# -*- coding: utf-8 -*-
"""
SetView LiveLink & Real-Time WebXR VCam Receiver Companion for Unreal Engine 5
-----------------------------------------------------------------------------
Receives real-time 60/72fps camera tracking, optical lens parameters, and take tally
signals streamed from SetView WebXR VCam on Meta Quest 3 or desktop browser.

Features:
  - Real-time CineCameraActor location and rotation updates matching SetView coordinate system.
  - Optical lens streaming: focal length (mm), aperture (T-stop), manual focus distance (cm).
  - Multi-threaded network worker with thread-safe queue dispatching to UE5 post-tick callback.
  - Tally light integration and automated take increment logging for Virtual Production.
  - Standalone verification mode for running outside Unreal Engine.

Usage in Unreal Engine 5 (Output Log -> Python console):
    import Content.Python.setview_livelink_server as livelink
    server = livelink.start_server(port=8088)

Usage via Command Line / Standalone Mode:
    python3 setview_livelink_server.py [--port 8088] [--subject SetView_VCam]
"""

import os
import sys
import time
import math
import json
import socket
import threading
import queue
import argparse
from typing import Dict, Any, Optional

try:
    import unreal  # type: ignore
    IN_UNREAL = True
except ImportError:
    unreal = None
    IN_UNREAL = False


DEFAULT_PORT = 8088
DEFAULT_SUBJECT = "SetView_VCam"


class SetViewLiveLinkServer:
    """
    LiveLink TCP / WebSocket bridge server receiving SetView camera telemetry.
    """

    def __init__(self, port: int = DEFAULT_PORT, subject_name: str = DEFAULT_SUBJECT, auto_spawn_camera: bool = True):
        self.port = port
        self.subject_name = subject_name
        self.auto_spawn_camera = auto_spawn_camera

        self.running = False
        self.server_socket: Optional[socket.socket] = None
        self.listener_thread: Optional[threading.Thread] = None
        self.client_threads: list[threading.Thread] = []
        self.message_queue: queue.Queue = queue.Queue(maxsize=240)

        self.cine_camera_actor = None
        self.cine_camera_component = None
        self.tick_handle = None

        self.is_recording = False
        self.current_take = 1
        self.total_frames_received = 0
        self.last_log_time = 0.0

    def start(self) -> bool:
        """Starts network server thread and registers Unreal post-tick callback."""
        if self.running:
            self._log("Server is already active.")
            return True

        self.running = True

        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind(("0.0.0.0", self.port))
            self.server_socket.listen(5)
            self.server_socket.settimeout(1.0)
        except Exception as e:
            self._log(f"Failed to bind socket on port {self.port}: {e}", is_error=True)
            self.running = False
            return False

        self.listener_thread = threading.Thread(
            target=self._accept_loop,
            name="SetViewLiveLinkListener",
            daemon=True
        )
        self.listener_thread.start()

        if IN_UNREAL:
            self._bind_or_spawn_cine_camera()
            self.tick_handle = unreal.register_python_post_tick_callback(self._on_unreal_tick)
            self._log(f"SetView LiveLink Server listening on port {self.port} for subject '{self.subject_name}'.")
        else:
            self._log(f"Standalone SetView LiveLink Server listening on port {self.port} (Unreal API not detected).")

        return True

    def stop(self):
        """Stops server, closes client sockets, and unregisters Unreal post-tick callback."""
        self.running = False

        if IN_UNREAL and self.tick_handle:
            try:
                unreal.unregister_python_post_tick_callback(self.tick_handle)
            except Exception as e:
                self._log(f"Error unregistering tick callback: {e}", is_error=True)
            self.tick_handle = None

        if self.server_socket:
            try:
                self.server_socket.close()
            except Exception:
                pass
            self.server_socket = None

        if self.listener_thread and self.listener_thread.is_alive():
            self.listener_thread.join(timeout=1.5)

        self._log("SetView LiveLink Server stopped.")

    def _log(self, message: str, is_error: bool = False):
        prefix = "[SetView LiveLink]"
        if IN_UNREAL and unreal:
            if is_error:
                unreal.log_error(f"{prefix} {message}")
            else:
                unreal.log(f"{prefix} {message}")
        else:
            print(f"{prefix} {message}")

    def _bind_or_spawn_cine_camera(self):
        if not IN_UNREAL or not unreal:
            return

        editor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        all_actors = editor_subsystem.get_all_level_actors()

        for actor in all_actors:
            if actor.get_actor_label() == self.subject_name and isinstance(actor, unreal.CineCameraActor):
                self.cine_camera_actor = actor
                self.cine_camera_component = actor.get_cine_camera_component()
                self._log(f"Bound to existing CineCameraActor '{self.subject_name}'.")
                return

        if self.auto_spawn_camera:
            spawn_loc = unreal.Vector(0, 0, 160)
            spawn_rot = unreal.Rotator(0, 0, 0)
            self.cine_camera_actor = editor_subsystem.spawn_actor_from_class(
                unreal.CineCameraActor,
                spawn_loc,
                spawn_rot
            )
            if self.cine_camera_actor:
                self.cine_camera_actor.set_actor_label(self.subject_name)
                self.cine_camera_component = self.cine_camera_actor.get_cine_camera_component()
                self._log(f"Spawned CineCameraActor '{self.subject_name}' at default origin.")

    def _accept_loop(self):
        while self.running and self.server_socket:
            try:
                client_sock, client_addr = self.server_socket.accept()
                self._log(f"Client connected from {client_addr[0]}:{client_addr[1]}")
                client_thread = threading.Thread(
                    target=self._client_handler,
                    args=(client_sock, client_addr),
                    daemon=True
                )
                client_thread.start()
                self.client_threads.append(client_thread)
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    self._log(f"Accept loop error: {e}", is_error=True)
                break

    def _client_handler(self, client_sock: socket.socket, client_addr: tuple):
        client_sock.settimeout(2.0)
        buffer = ""

        while self.running:
            try:
                data = client_sock.recv(4096)
                if not data:
                    break

                buffer += data.decode("utf-8", errors="ignore")
                lines = buffer.split("\n")
                buffer = lines.pop()

                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        packet = json.loads(line)
                        self.total_frames_received += 1

                        # Handle ping/pong immediately
                        if packet.get("type") == "ping":
                            pong_resp = json.dumps({
                                "type": "pong",
                                "payload": packet.get("payload", {}),
                                "timestamp": int(time.time() * 1000)
                            }) + "\n"
                            client_sock.sendall(pong_resp.encode("utf-8"))
                            continue

                        # Place in post-tick queue, drop oldest if full
                        if self.message_queue.full():
                            try:
                                self.message_queue.get_nowait()
                            except queue.Empty:
                                pass
                        self.message_queue.put_nowait(packet)
                    except json.JSONDecodeError:
                        pass
            except socket.timeout:
                continue
            except Exception as e:
                self._log(f"Client read error: {e}")
                break

        try:
            client_sock.close()
        except Exception:
            pass
        self._log(f"Client disconnected from {client_addr[0]}:{client_addr[1]}")

    def _on_unreal_tick(self, delta_seconds: float):
        if not IN_UNREAL:
            return

        latest_packet = None
        while not self.message_queue.empty():
            try:
                latest_packet = self.message_queue.get_nowait()
            except queue.Empty:
                break

        if not latest_packet:
            return

        self._apply_telemetry_to_cine_camera(latest_packet)

    def _apply_telemetry_to_cine_camera(self, packet: Dict[str, Any]):
        if not IN_UNREAL or not self.cine_camera_actor or not self.cine_camera_component:
            return

        transform_data = packet.get("transform", {}).get("unreal", {})
        loc = transform_data.get("location", {})
        rot = transform_data.get("rotation", {})

        if loc and rot:
            ue_loc = unreal.Vector(float(loc.get("x", 0)), float(loc.get("y", 0)), float(loc.get("z", 0)))
            ue_rot = unreal.Rotator(float(rot.get("pitch", 0)), float(rot.get("yaw", 0)), float(rot.get("roll", 0)))
            self.cine_camera_actor.set_actor_location_and_rotation(ue_loc, ue_rot, False, False)

        cam_data = packet.get("camera", {})
        if "focalLengthMm" in cam_data:
            self.cine_camera_component.set_editor_property("current_focal_length", float(cam_data["focalLengthMm"]))
        if "apertureTStop" in cam_data:
            self.cine_camera_component.set_editor_property("current_aperture", float(cam_data["apertureTStop"]))
        if "focusDistanceCm" in cam_data:
            focus_settings = self.cine_camera_component.get_editor_property("focus_settings")
            focus_settings.set_editor_property("manual_focus_distance", float(cam_data["focusDistanceCm"]))
            self.cine_camera_component.set_editor_property("focus_settings", focus_settings)

        status_data = packet.get("status", {})
        rec_state = status_data.get("isRecording", False)
        if rec_state != self.is_recording:
            self.is_recording = rec_state
            if self.is_recording:
                self._log(f"TALLY RECORDING: Take {self.current_take} START")
            else:
                self._log(f"TALLY RECORDING: Take {self.current_take} STOP")
                self.current_take += 1


_active_server_instance: Optional[SetViewLiveLinkServer] = None


def start_server(port: int = DEFAULT_PORT, subject: str = DEFAULT_SUBJECT) -> Optional[SetViewLiveLinkServer]:
    """Helper function to instantiate and run SetViewLiveLinkServer in UE5 Python console."""
    global _active_server_instance
    if _active_server_instance:
        _active_server_instance.stop()

    _active_server_instance = SetViewLiveLinkServer(port=port, subject_name=subject)
    if _active_server_instance.start():
        return _active_server_instance
    return None


def stop_server():
    """Stops the globally running SetViewLiveLinkServer."""
    global _active_server_instance
    if _active_server_instance:
        _active_server_instance.stop()
        _active_server_instance = None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SetView LiveLink Companion Receiver Server for UE5")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to listen on (default: 8088)")
    parser.add_argument("--subject", type=str, default=DEFAULT_SUBJECT, help="Subject name (default: SetView_VCam)")
    args = parser.parse_args()

    srv = start_server(port=args.port, subject=args.subject)
    if srv:
        print(f"SetView LiveLink Server running on port {args.port}. Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            stop_server()
