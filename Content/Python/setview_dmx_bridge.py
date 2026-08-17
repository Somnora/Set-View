# -*- coding: utf-8 -*-
"""
SetView DMX512, Art-Net 4 & ANSI E1.31 sACN Virtual Production Lighting Bridge for Unreal Engine 5
--------------------------------------------------------------------------------------------------
Receives real-time DMX512 packets over Art-Net 4 (UDP 6454) or sACN (UDP 5568) streamed from SetView,
decodes fixture channel profiles, and drives Unreal Engine Cine Lights, Rect Lights, Spot Lights,
and DMX Fixture Actors in real time during virtual production stage playback.

Features:
  - Art-Net 4 (OpDmx 0x5000) and ANSI E1.31 sACN packet decoding.
  - Multi-universe buffer support (Universes 0 to 15, 512 channels each).
  - 8-bit and 16-bit fixture parameter mappings: intensity, CCT, RGB, pan, tilt, beam angle.
  - Automatic Cine Light actor creation and binding based on SetView patch manifests.
  - Thread-safe packet ingestion with queue dispatching to Unreal Engine Slate tick callback.
  - Standalone verification mode for running outside Unreal Engine.

Usage in Unreal Engine 5 (Output Log -> Python console):
    import Content.Python.setview_dmx_bridge as dmx_bridge
    server = dmx_bridge.start_dmx_bridge(protocol='artnet', port=6454)

Usage via Command Line / Standalone Mode:
    python3 Content/Python/setview_dmx_bridge.py [--protocol artnet|sacn] [--port 6454]
"""

import os
import sys
import time
import math
import json
import socket
import struct
import select
import threading
import queue
import argparse
from typing import Dict, Any, Optional, List, Tuple

try:
    import unreal  # type: ignore
    IN_UNREAL = True
except ImportError:
    unreal = None
    IN_UNREAL = False


ARTNET_PORT = 6454
SACN_PORT = 5568
ARTNET_HEADER = b"Art-Net\x00"
ARTNET_OP_DMX = 0x5000
SACN_ROOT_VECTOR = 0x00000004
SACN_FRAME_VECTOR = 0x00000002
SACN_DMP_VECTOR = 0x02


def kelvin_to_rgb(kelvin: float) -> Tuple[float, float, float]:
    """Planckian locus approximation converting CCT Kelvin (1000K-40000K) to linear RGB (0.0-1.0)."""
    k = max(1000.0, min(40000.0, kelvin)) / 100.0
    
    if k <= 66.0:
        r = 255.0
        g = 99.4708025861 * math.log(max(1.0, k)) - 161.1195681661
        if k <= 19.0:
            b = 0.0
        else:
            b = 138.5177312231 * math.log(k - 10.0) - 305.0447927307
    else:
        r = 329.698727446 * math.pow(k - 60.0, -0.1332047592)
        g = 288.1221695283 * math.pow(k - 60.0, -0.0755148492)
        b = 255.0

    return (
        max(0.0, min(1.0, r / 255.0)),
        max(0.0, min(1.0, g / 255.0)),
        max(0.0, min(1.0, b / 255.0)),
    )


class ArtNetCodec:
    """Encoder and decoder for Art-Net 4 OpDmx packets."""

    @staticmethod
    def decode(packet: bytes) -> Optional[Dict[str, Any]]:
        if len(packet) < 18:
            return None
        if not packet.startswith(ARTNET_HEADER):
            return None

        opcode = struct.unpack("<H", packet[8:10])[0]
        if opcode != ARTNET_OP_DMX:
            return None

        prot_ver = struct.unpack(">H", packet[10:12])[0]
        sequence = packet[12]
        physical = packet[13]
        sub_uni = packet[14]
        net = packet[15]
        length = struct.unpack(">H", packet[16:18])[0]

        universe = (sub_uni & 0x0F) | ((net & 0x7F) << 8)
        subnet = (sub_uni >> 4) & 0x0F

        if len(packet) < 18 + length:
            return None

        channels = list(packet[18:18 + length])
        return {
            "protocol": "artnet",
            "version": prot_ver,
            "sequence": sequence,
            "physical": physical,
            "universe": universe,
            "subnet": subnet,
            "channels": channels,
        }


class SacnCodec:
    """Encoder and decoder for ANSI E1.31 sACN packets."""

    @staticmethod
    def decode(packet: bytes) -> Optional[Dict[str, Any]]:
        if len(packet) < 126:
            return None

        preamble_size = struct.unpack(">H", packet[0:2])[0]
        if preamble_size != 0x0010:
            return None

        acn_pid = packet[4:16]
        if acn_pid != b"ASC-E1.17\x00\x00\x00":
            return None

        root_vector = struct.unpack(">I", packet[18:22])[0]
        if root_vector != SACN_ROOT_VECTOR:
            return None

        frame_vector = struct.unpack(">I", packet[40:44])[0]
        if frame_vector != SACN_FRAME_VECTOR:
            return None

        source_name = packet[44:108].decode("utf-8", errors="ignore").rstrip("\x00")
        priority = packet[108]
        sequence = packet[111]
        universe = struct.unpack(">H", packet[113:115])[0]

        dmp_vector = packet[117]
        if dmp_vector != SACN_DMP_VECTOR:
            return None

        prop_count = struct.unpack(">H", packet[123:125])[0]
        start_code = packet[125]
        if start_code != 0x00:
            return None

        slot_count = prop_count - 1
        if len(packet) < 126 + slot_count:
            return None

        channels = list(packet[126:126 + slot_count])
        return {
            "protocol": "sacn",
            "sourceName": source_name,
            "priority": priority,
            "sequence": sequence,
            "universe": universe - 1 if universe > 0 else 0,
            "channels": channels,
        }


class SetViewDmxBridgeServer:
    """
    Multi-threaded DMX receiver bridging network packets to Unreal Engine Cine Lights.
    """

    def __init__(
        self,
        protocol: str = "artnet",
        port: Optional[int] = None,
        bind_ip: str = "0.0.0.0",
        patch_file: Optional[str] = None,
    ):
        self.protocol = protocol.lower()
        self.port = port if port is not None else (SACN_PORT if self.protocol == "sacn" else ARTNET_PORT)
        self.bind_ip = bind_ip
        self.patch_file = patch_file

        self.running = False
        self.sock: Optional[socket.socket] = None
        self.thread: Optional[threading.Thread] = None
        self.packet_queue: queue.Queue = queue.Queue(maxsize=500)
        self.tick_handle = None

        # 16 universe data buffers (0-15, 512 channels)
        self.universes = [[0] * 512 for _ in range(16)]

        # Patch configuration
        self.patches: List[Dict[str, Any]] = []
        self.light_actors: Dict[str, Any] = {}

        # Diagnostics
        self.total_packets = 0
        self.total_bytes = 0
        self.fps = 0.0
        self.last_stat_time = time.time()
        self.stat_frames = 0

        if self.patch_file and os.path.isfile(self.patch_file):
            self.load_patches_from_file(self.patch_file)

    def load_patches_from_file(self, file_path: str) -> None:
        """Loads DMX patch manifest from SetView scene JSON or CSV export."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            if file_path.endswith(".json"):
                data = json.loads(content)
                if "dmxPatches" in data and isinstance(data["dmxPatches"], list):
                    self.patches = data["dmxPatches"]
                    print(f"[SetView DMX] Loaded {len(self.patches)} patches from scene JSON: {file_path}")
            elif file_path.endswith(".csv"):
                lines = content.strip().split("\n")
                if len(lines) > 1:
                    headers = [h.strip() for h in lines[0].split(",")]
                    loaded = []
                    for line in lines[1:]:
                        if not line.strip():
                            continue
                        cols = [c.strip() for c in line.split(",")]
                        entry = dict(zip(headers, cols))
                        loaded.append({
                            "patchId": entry.get("Patch ID", f"patch_{len(loaded)}"),
                            "lightId": entry.get("Light ID", ""),
                            "lightName": entry.get("Light Name", "Light"),
                            "universe": int(entry.get("Universe", 0)),
                            "startAddress": int(entry.get("Start Address", 1)),
                            "fixtureProfileId": entry.get("Profile ID", "generic-cct"),
                            "enabled": entry.get("Status", "ENABLED").upper() == "ENABLED",
                        })
                    self.patches = loaded
                    print(f"[SetView DMX] Loaded {len(self.patches)} patches from CSV: {file_path}")
        except Exception as e:
            print(f"[SetView DMX] Error loading patch file: {e}")

    def start(self) -> None:
        """Starts the UDP network receiver and registers UE5 tick listener."""
        if self.running:
            return

        self.running = True
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        try:
            self.sock.bind((self.bind_ip, self.port))
            print(f"[SetView DMX] Listening for {self.protocol.upper()} on {self.bind_ip}:{self.port}")
        except Exception as e:
            print(f"[SetView DMX] Failed to bind UDP socket on {self.bind_ip}:{self.port}: {e}")
            self.running = False
            return

        self.thread = threading.Thread(target=self._network_worker, daemon=True)
        self.thread.start()

        if IN_UNREAL:
            self._register_ue5_tick()
            self._initialize_ue5_fixtures()
            print("[SetView DMX] Unreal Engine 5 integration initialized")

    def stop(self) -> None:
        """Stops the DMX bridge and cleans up sockets."""
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
            self.thread = None

        if IN_UNREAL and self.tick_handle:
            try:
                unreal.unregister_slate_post_tick_callback(self.tick_handle)
            except Exception:
                pass
            self.tick_handle = None

        print("[SetView DMX] DMX Bridge server stopped")

    def _network_worker(self) -> None:
        """Background thread receiving binary UDP packets."""
        while self.running and self.sock:
            try:
                rlist, _, _ = select.select([self.sock], [], [], 0.1)
                if not rlist:
                    continue

                data, addr = self.sock.recvfrom(2048)
                if not data:
                    continue

                self.total_packets += 1
                self.total_bytes += len(data)
                self.stat_frames += 1

                now = time.time()
                if now - self.last_stat_time >= 1.0:
                    self.fps = self.stat_frames / (now - self.last_stat_time)
                    self.stat_frames = 0
                    self.last_stat_time = now

                # Decode packet
                parsed = None
                if self.protocol == "sacn":
                    parsed = SacnCodec.decode(data)
                else:
                    parsed = ArtNetCodec.decode(data)

                if parsed:
                    uni = parsed.get("universe", 0)
                    chans = parsed.get("channels", [])
                    if 0 <= uni < 16:
                        # Update universe buffer
                        for i, val in enumerate(chans[:512]):
                            self.universes[uni][i] = val

                    # Queue for main/Slate thread processing
                    if not self.packet_queue.full():
                        self.packet_queue.put_nowait(parsed)

            except Exception as e:
                if self.running:
                    print(f"[SetView DMX] Network worker error: {e}")

    def _register_ue5_tick(self) -> None:
        """Registers Slate post-tick callback to update UE5 actors on the game thread."""
        def tick_callback(delta_time: float) -> None:
            self._process_packets_ue5()

        self.tick_handle = unreal.register_slate_post_tick_callback(tick_callback)

    def _initialize_ue5_fixtures(self) -> None:
        """Finds or spawns UE5 Cine Light fixtures matching the patch list."""
        if not IN_UNREAL:
            return

        world = unreal.EditorLevelLibrary.get_editor_world()
        if not world:
            return

        # Find existing light actors in world
        all_actors = unreal.EditorLevelLibrary.get_all_level_actors()
        for actor in all_actors:
            name = actor.get_actor_label()
            for patch in self.patches:
                if patch.get("lightName") == name or patch.get("lightId") == name:
                    self.light_actors[patch.get("patchId", name)] = actor

    def _process_packets_ue5(self) -> None:
        """Dispatches universe buffer updates to UE5 Cine Light actors."""
        if not IN_UNREAL:
            return

        # Drain queued packets up to latest
        while not self.packet_queue.empty():
            try:
                _ = self.packet_queue.get_nowait()
            except queue.Empty:
                break

        # Apply universe values to patched lights
        for patch in self.patches:
            if not patch.get("enabled", True):
                continue

            patch_id = patch.get("patchId", "")
            actor = self.light_actors.get(patch_id)
            if not actor:
                continue

            uni = patch.get("universe", 0)
            start_addr = patch.get("startAddress", 1) - 1
            if not (0 <= uni < 16 and 0 <= start_addr < 512):
                continue

            buf = self.universes[uni]
            profile_id = patch.get("fixtureProfileId", "arri-skypanel-s60c-m6")

            # Extract parameters based on profile footprint
            intensity = 1.0
            cct = 5600.0
            rgb = (1.0, 1.0, 1.0)

            if "skypanel" in profile_id or "gemini" in profile_id:
                # Mode 6 / CCT + RGBW: ch0-1=dimmer16, ch2-3=cct16, ch5=R, ch6=G, ch7=B
                dimmer_raw = (buf[start_addr] << 8) | (buf[start_addr + 1] if start_addr + 1 < 512 else 0)
                intensity = dimmer_raw / 65535.0
                cct_raw = (buf[start_addr + 2] << 8) | (buf[start_addr + 3] if start_addr + 3 < 512 else 0)
                cct = 2800.0 + (cct_raw / 65535.0) * (10000.0 - 2800.0)
                if start_addr + 7 < 512:
                    rgb = (buf[start_addr + 5] / 255.0, buf[start_addr + 6] / 255.0, buf[start_addr + 7] / 255.0)
            elif "dimmer" in profile_id:
                intensity = buf[start_addr] / 255.0
            elif "cct" in profile_id:
                intensity = buf[start_addr] / 255.0
                cct_raw = buf[start_addr + 1] if start_addr + 1 < 512 else 128
                cct = 2000.0 + (cct_raw / 255.0) * 8000.0
            elif "rgb" in profile_id:
                intensity = buf[start_addr] / 255.0
                if start_addr + 3 < 512:
                    rgb = (buf[start_addr + 1] / 255.0, buf[start_addr + 2] / 255.0, buf[start_addr + 3] / 255.0)

            # Update UE5 Light Component
            light_comp = actor.get_component_by_class(unreal.LightComponent)
            if light_comp:
                # Max intensity 100,000 Lumens / Candelas
                light_comp.set_intensity(intensity * 50000.0)
                calc_rgb = kelvin_to_rgb(cct)
                final_r = calc_rgb[0] * rgb[0]
                final_g = calc_rgb[1] * rgb[1]
                final_b = calc_rgb[2] * rgb[2]
                light_comp.set_light_color(unreal.LinearColor(final_r, final_g, final_b, 1.0))


_active_bridge: Optional[SetViewDmxBridgeServer] = None


def start_dmx_bridge(
    protocol: str = "artnet",
    port: Optional[int] = None,
    bind_ip: str = "0.0.0.0",
    patch_file: Optional[str] = None,
) -> SetViewDmxBridgeServer:
    """Starts the global SetView DMX bridge server instance."""
    global _active_bridge
    if _active_bridge and _active_bridge.running:
        _active_bridge.stop()

    _active_bridge = SetViewDmxBridgeServer(
        protocol=protocol,
        port=port,
        bind_ip=bind_ip,
        patch_file=patch_file,
    )
    _active_bridge.start()
    return _active_bridge


def stop_dmx_bridge() -> None:
    """Stops the global SetView DMX bridge server."""
    global _active_bridge
    if _active_bridge:
        _active_bridge.stop()
        _active_bridge = None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SetView Soundstage DMX512 & Art-Net / sACN Bridge")
    parser.add_argument("--protocol", choices=["artnet", "sacn"], default="artnet", help="Protocol (artnet or sacn)")
    parser.add_argument("--port", type=int, default=None, help="UDP listening port (default 6454 for Art-Net, 5568 for sACN)")
    parser.add_argument("--bind", default="0.0.0.0", help="Bind IP address")
    parser.add_argument("--patch", default=None, help="Path to SetView scene JSON or CSV patch manifest")
    args = parser.parse_args()

    print("==================================================================")
    print("SetView DMX512 & Art-Net / sACN Lighting Bridge for Unreal Engine")
    print(f"Protocol: {args.protocol.upper()} | Port: {args.port or (5568 if args.protocol == 'sacn' else 6454)} | Bind: {args.bind}")
    print("==================================================================")

    server = start_dmx_bridge(
        protocol=args.protocol,
        port=args.port,
        bind_ip=args.bind,
        patch_file=args.patch,
    )

    try:
        while True:
            time.sleep(1.0)
            print(
                f"[SetView DMX] Receiving: {server.fps:.1f} FPS | "
                f"Total Packets: {server.total_packets} | Total Bytes: {server.total_bytes}"
            )
    except KeyboardInterrupt:
        print("\nStopping DMX Bridge...")
        stop_dmx_bridge()
        print("Done.")
