// ---------------------------------------------------------------------------
// Pure Domain DMX512, Art-Net 4 & ANSI E1.31 sACN Lighting Engine
//
// Pure domain engine for stage lighting protocols, fixture profile library,
// bidirectional DMX packet encoding/decoding, and virtual production patch mapping.
//
// Rules: Zero Three.js and Zero DOM imports so all logic executes in pure Node.js
// unit tests and headless server environments.
// ---------------------------------------------------------------------------

export type DmxProtocol = 'artnet' | 'sacn';

export type DmxChannelParameter =
  | 'dimmer'
  | 'cct'
  | 'tint'
  | 'red'
  | 'green'
  | 'blue'
  | 'white'
  | 'amber'
  | 'pan'
  | 'tilt'
  | 'strobe'
  | 'zoom'
  | 'focus';

export interface DmxChannelMapping {
  channelOffset: number;
  parameter: DmxChannelParameter;
  bitDepth: 8 | 16;
  minValue?: number;
  maxValue?: number;
  defaultValue?: number;
}

export interface DmxFixtureProfile {
  id: string;
  manufacturer: string;
  model: string;
  mode: string;
  totalChannels: number;
  mappings: DmxChannelMapping[];
}

export interface DmxPatchEntry {
  patchId: string;
  lightId: string;
  lightName: string;
  universe: number;
  startAddress: number;
  fixtureProfileId: string;
  enabled: boolean;
}

export interface DmxBridgeConfig {
  enabled: boolean;
  protocol: DmxProtocol;
  targetIp: string;
  targetPort: number;
  localPort: number;
  subnet: number;
  universeOffset: number;
  refreshRateHz: number;
  priority: number;
  syncWithSceneLights: boolean;
}

export interface DmxCue {
  cueId: string;
  name: string;
  timestampS?: number;
  fadeTimeS?: number;
  values: { universe: number; channel: number; value: number }[];
}

// --- Curated Fixture Profile Library ---------------------------------------

export const DMX_FIXTURE_PROFILES: DmxFixtureProfile[] = [
  {
    id: 'arri-skypanel-s60c-m6',
    manufacturer: 'ARRI',
    model: 'SkyPanel S60-C',
    mode: 'Mode 6: CCT & RGBW 8-Bit',
    totalChannels: 8,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'cct', bitDepth: 8, minValue: 2800, maxValue: 10000, defaultValue: 5600 },
      { channelOffset: 2, parameter: 'tint', bitDepth: 8, minValue: -100, maxValue: 100, defaultValue: 0 },
      { channelOffset: 3, parameter: 'red', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 4, parameter: 'green', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 5, parameter: 'blue', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 6, parameter: 'white', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 7, parameter: 'strobe', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 0 },
    ],
  },
  {
    id: 'arri-skypanel-s60c-m1',
    manufacturer: 'ARRI',
    model: 'SkyPanel S60-C',
    mode: 'Mode 1: CCT 16-Bit Dimmer',
    totalChannels: 6,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 16, minValue: 0, maxValue: 65535, defaultValue: 65535 },
      { channelOffset: 2, parameter: 'cct', bitDepth: 16, minValue: 2800, maxValue: 10000, defaultValue: 5600 },
      { channelOffset: 4, parameter: 'tint', bitDepth: 8, minValue: -100, maxValue: 100, defaultValue: 0 },
      { channelOffset: 5, parameter: 'strobe', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 0 },
    ],
  },
  {
    id: 'astera-titan-m4',
    manufacturer: 'Astera',
    model: 'Titan Tube',
    mode: 'Mode 4: RGBW 8-Bit',
    totalChannels: 5,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'red', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 2, parameter: 'green', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 3, parameter: 'blue', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 4, parameter: 'white', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
    ],
  },
  {
    id: 'astera-titan-m2',
    manufacturer: 'Astera',
    model: 'Titan Tube',
    mode: 'Mode 2: CCT & Dimmer',
    totalChannels: 3,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'cct', bitDepth: 8, minValue: 1750, maxValue: 20000, defaultValue: 5600 },
      { channelOffset: 2, parameter: 'tint', bitDepth: 8, minValue: -100, maxValue: 100, defaultValue: 0 },
    ],
  },
  {
    id: 'aputure-600d-16bit',
    manufacturer: 'Aputure',
    model: 'LS 600d Pro / 1200d',
    mode: 'CCT & Dimmer 16-Bit',
    totalChannels: 5,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 16, minValue: 0, maxValue: 65535, defaultValue: 65535 },
      { channelOffset: 2, parameter: 'cct', bitDepth: 16, minValue: 2700, maxValue: 6500, defaultValue: 5600 },
      { channelOffset: 4, parameter: 'strobe', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 0 },
    ],
  },
  {
    id: 'litepanels-gemini-2x1',
    manufacturer: 'Litepanels',
    model: 'Gemini 2x1',
    mode: 'RGBW + CCT & Green/Magenta',
    totalChannels: 8,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'cct', bitDepth: 8, minValue: 2700, maxValue: 10000, defaultValue: 5600 },
      { channelOffset: 2, parameter: 'tint', bitDepth: 8, minValue: -100, maxValue: 100, defaultValue: 0 },
      { channelOffset: 3, parameter: 'red', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 4, parameter: 'green', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 5, parameter: 'blue', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 6, parameter: 'white', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 7, parameter: 'strobe', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 0 },
    ],
  },
  {
    id: 'generic-dimmer',
    manufacturer: 'Generic',
    model: 'Dimmer',
    mode: '1-Channel Intensity',
    totalChannels: 1,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
    ],
  },
  {
    id: 'generic-rgb',
    manufacturer: 'Generic',
    model: 'RGB Fixture',
    mode: '3-Channel RGB',
    totalChannels: 3,
    mappings: [
      { channelOffset: 0, parameter: 'red', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'green', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 2, parameter: 'blue', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
    ],
  },
  {
    id: 'generic-rgbw',
    manufacturer: 'Generic',
    model: 'RGBW Fixture',
    mode: '5-Channel RGBW + Dimmer',
    totalChannels: 5,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'red', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 2, parameter: 'green', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 3, parameter: 'blue', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 4, parameter: 'white', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
    ],
  },
  {
    id: 'generic-rgbaw',
    manufacturer: 'Generic',
    model: 'RGBAW Fixture',
    mode: '6-Channel RGBAW + Dimmer',
    totalChannels: 6,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'red', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 2, parameter: 'green', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 3, parameter: 'blue', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 4, parameter: 'amber', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 5, parameter: 'white', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
    ],
  },
  {
    id: 'generic-cct',
    manufacturer: 'Generic',
    model: 'Bi-Color CCT',
    mode: '3-Channel Dimmer + CCT + Tint',
    totalChannels: 3,
    mappings: [
      { channelOffset: 0, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 1, parameter: 'cct', bitDepth: 8, minValue: 2700, maxValue: 6500, defaultValue: 5600 },
      { channelOffset: 2, parameter: 'tint', bitDepth: 8, minValue: -100, maxValue: 100, defaultValue: 0 },
    ],
  },
  {
    id: 'generic-moving-spot',
    manufacturer: 'Generic',
    model: 'Moving Head Spot',
    mode: '8-Channel Spot (Pan/Tilt/Dim/Zoom/Shutter)',
    totalChannels: 8,
    mappings: [
      { channelOffset: 0, parameter: 'pan', bitDepth: 16, minValue: 0, maxValue: 65535, defaultValue: 32768 },
      { channelOffset: 2, parameter: 'tilt', bitDepth: 16, minValue: 0, maxValue: 65535, defaultValue: 32768 },
      { channelOffset: 4, parameter: 'dimmer', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 255 },
      { channelOffset: 5, parameter: 'strobe', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 0 },
      { channelOffset: 6, parameter: 'zoom', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 128 },
      { channelOffset: 7, parameter: 'focus', bitDepth: 8, minValue: 0, maxValue: 255, defaultValue: 128 },
    ],
  },
];

export function findFixtureProfile(profileId: string): DmxFixtureProfile {
  const profile = DMX_FIXTURE_PROFILES.find((p) => p.id === profileId);
  if (profile) return profile;
  return DMX_FIXTURE_PROFILES[0];
}

// --- Helpers & Validation ---------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function generateUid(prefix = 'dmx'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDmxBridgeConfig(overrides?: Partial<DmxBridgeConfig>): DmxBridgeConfig {
  return {
    enabled: overrides?.enabled ?? false,
    protocol: overrides?.protocol === 'sacn' ? 'sacn' : 'artnet',
    targetIp: overrides?.targetIp ?? '127.0.0.1',
    targetPort: isFiniteNumber(overrides?.targetPort) ? overrides.targetPort : (overrides?.protocol === 'sacn' ? 5568 : 6454),
    localPort: isFiniteNumber(overrides?.localPort) ? overrides.localPort : (overrides?.protocol === 'sacn' ? 5568 : 6454),
    subnet: isFiniteNumber(overrides?.subnet) ? Math.max(0, Math.min(15, Math.floor(overrides.subnet))) : 0,
    universeOffset: isFiniteNumber(overrides?.universeOffset) ? Math.max(0, Math.min(15, Math.floor(overrides.universeOffset))) : 0,
    refreshRateHz: isFiniteNumber(overrides?.refreshRateHz) ? Math.max(1, Math.min(60, Math.floor(overrides.refreshRateHz))) : 30,
    priority: isFiniteNumber(overrides?.priority) ? Math.max(0, Math.min(200, Math.floor(overrides.priority))) : 100,
    syncWithSceneLights: overrides?.syncWithSceneLights ?? true,
  };
}

export function isDmxBridgeConfig(raw: unknown): raw is DmxBridgeConfig {
  if (!raw || typeof raw !== 'object') return false;
  const cfg = raw as Record<string, unknown>;
  return (
    typeof cfg.enabled === 'boolean' &&
    (cfg.protocol === 'artnet' || cfg.protocol === 'sacn') &&
    typeof cfg.targetIp === 'string' &&
    isFiniteNumber(cfg.targetPort) &&
    isFiniteNumber(cfg.localPort) &&
    isFiniteNumber(cfg.subnet) &&
    isFiniteNumber(cfg.universeOffset) &&
    isFiniteNumber(cfg.refreshRateHz) &&
    isFiniteNumber(cfg.priority) &&
    typeof cfg.syncWithSceneLights === 'boolean'
  );
}

export function normalizeDmxBridgeConfig(raw: unknown): DmxBridgeConfig {
  if (!raw || typeof raw !== 'object') return createDmxBridgeConfig();
  const cfg = raw as Partial<DmxBridgeConfig>;
  return createDmxBridgeConfig({
    enabled: typeof cfg.enabled === 'boolean' ? cfg.enabled : false,
    protocol: cfg.protocol === 'sacn' ? 'sacn' : 'artnet',
    targetIp: typeof cfg.targetIp === 'string' && cfg.targetIp.trim() ? cfg.targetIp.trim() : '127.0.0.1',
    targetPort: isFiniteNumber(cfg.targetPort)
      ? Math.max(1, Math.min(65535, Math.floor(cfg.targetPort)))
      : (cfg.protocol === 'sacn' ? 5568 : 6454),
    localPort: isFiniteNumber(cfg.localPort)
      ? Math.max(1, Math.min(65535, Math.floor(cfg.localPort)))
      : (cfg.protocol === 'sacn' ? 5568 : 6454),
    subnet: isFiniteNumber(cfg.subnet) ? Math.max(0, Math.min(15, Math.floor(cfg.subnet))) : 0,
    universeOffset: isFiniteNumber(cfg.universeOffset) ? Math.max(0, Math.min(15, Math.floor(cfg.universeOffset))) : 0,
    refreshRateHz: isFiniteNumber(cfg.refreshRateHz) ? Math.max(1, Math.min(60, Math.floor(cfg.refreshRateHz))) : 30,
    priority: isFiniteNumber(cfg.priority) ? Math.max(0, Math.min(200, Math.floor(cfg.priority))) : 100,
    syncWithSceneLights: typeof cfg.syncWithSceneLights === 'boolean' ? cfg.syncWithSceneLights : true,
  });
}

export function createDmxPatchEntry(overrides?: Partial<DmxPatchEntry>): DmxPatchEntry {
  return {
    patchId: overrides?.patchId ?? generateUid('patch'),
    lightId: overrides?.lightId ?? '',
    lightName: overrides?.lightName ?? 'Fixture 1',
    universe: isFiniteNumber(overrides?.universe) ? Math.max(0, Math.floor(overrides.universe)) : 0,
    startAddress: isFiniteNumber(overrides?.startAddress) ? Math.max(1, Math.min(512, Math.floor(overrides.startAddress))) : 1,
    fixtureProfileId: overrides?.fixtureProfileId ?? 'arri-skypanel-s60c-m6',
    enabled: overrides?.enabled ?? true,
  };
}

export function isDmxPatchEntry(raw: unknown): raw is DmxPatchEntry {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as Record<string, unknown>;
  return (
    typeof p.patchId === 'string' &&
    typeof p.lightId === 'string' &&
    typeof p.lightName === 'string' &&
    isFiniteNumber(p.universe) &&
    isFiniteNumber(p.startAddress) &&
    typeof p.fixtureProfileId === 'string' &&
    typeof p.enabled === 'boolean'
  );
}

export function normalizeDmxPatchEntry(raw: unknown): DmxPatchEntry {
  if (!raw || typeof raw !== 'object') return createDmxPatchEntry();
  const p = raw as Partial<DmxPatchEntry>;
  const rawProfileId = typeof p.fixtureProfileId === 'string' ? p.fixtureProfileId.trim() : 'generic-dimmer';
  const profileExists = DMX_FIXTURE_PROFILES.some((prof) => prof.id === rawProfileId);
  return createDmxPatchEntry({
    patchId: typeof p.patchId === 'string' && p.patchId.trim() ? p.patchId : generateUid('patch'),
    lightId: typeof p.lightId === 'string' ? p.lightId : '',
    lightName: typeof p.lightName === 'string' && p.lightName.trim() ? p.lightName.trim() : 'Fixture',
    universe: isFiniteNumber(p.universe) ? Math.max(0, Math.min(15, Math.floor(p.universe))) : 0,
    startAddress: isFiniteNumber(p.startAddress) ? Math.max(1, Math.min(512, Math.floor(p.startAddress))) : 1,
    fixtureProfileId: profileExists ? rawProfileId : 'generic-dimmer',
    enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
  });
}

export function createDmxCue(overrides?: Partial<DmxCue>): DmxCue {
  return {
    cueId: overrides?.cueId ?? generateUid('cue'),
    name: overrides?.name ?? 'Cue 1',
    timestampS: isFiniteNumber(overrides?.timestampS) ? Math.max(0, overrides.timestampS) : undefined,
    fadeTimeS: isFiniteNumber(overrides?.fadeTimeS) ? Math.max(0, overrides.fadeTimeS) : 0,
    values: Array.isArray(overrides?.values) ? overrides.values.map((v) => ({
      universe: isFiniteNumber(v.universe) ? Math.max(0, Math.min(15, Math.floor(v.universe))) : 0,
      channel: isFiniteNumber(v.channel) ? Math.max(1, Math.min(512, Math.floor(v.channel))) : 1,
      value: isFiniteNumber(v.value) ? Math.max(0, Math.min(255, Math.floor(v.value))) : 0,
    })) : [],
  };
}

export function isDmxCue(raw: unknown): raw is DmxCue {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Record<string, unknown>;
  return (
    typeof c.cueId === 'string' &&
    typeof c.name === 'string' &&
    (c.timestampS === undefined || isFiniteNumber(c.timestampS)) &&
    (c.fadeTimeS === undefined || isFiniteNumber(c.fadeTimeS)) &&
    Array.isArray(c.values) &&
    c.values.every((v) => typeof v === 'object' && v !== null && isFiniteNumber(v.universe) && isFiniteNumber(v.channel) && isFiniteNumber(v.value))
  );
}

export function normalizeDmxCue(raw: unknown): DmxCue {
  if (!raw || typeof raw !== 'object') return createDmxCue();
  const c = raw as Partial<DmxCue>;
  return createDmxCue({
    cueId: typeof c.cueId === 'string' && c.cueId.trim() ? c.cueId : generateUid('cue'),
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Cue',
    timestampS: isFiniteNumber(c.timestampS) ? Math.max(0, c.timestampS) : undefined,
    fadeTimeS: isFiniteNumber(c.fadeTimeS) ? Math.max(0, c.fadeTimeS) : 0,
    values: Array.isArray(c.values) ? c.values.map((v) => ({
      universe: isFiniteNumber(v.universe) ? Math.max(0, Math.min(15, Math.floor(v.universe))) : 0,
      channel: isFiniteNumber(v.channel) ? Math.max(1, Math.min(512, Math.floor(v.channel))) : 1,
      value: isFiniteNumber(v.value) ? Math.max(0, Math.min(255, Math.floor(v.value))) : 0,
    })) : [],
  });
}

// --- Color Temperature & Chromaticity Conversion ---------------------------

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return { r, g, b };
  }
  const num = parseInt(clean.slice(0, 6), 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function kelvinToRgbDmx(kelvin: number): { r: number; g: number; b: number } {
  const k = Math.min(20000, Math.max(1000, kelvin));
  const temp = k / 100;
  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    if (r < 0) r = 0;
    if (r > 255) r = 255;
  }

  if (temp <= 66) {
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
    if (g < 0) g = 0;
    if (g > 255) g = 255;
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
    if (g < 0) g = 0;
    if (g > 255) g = 255;
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = temp - 10;
    b = 138.5177312231 * Math.log(b) - 305.0447927307;
    if (b < 0) b = 0;
    if (b > 255) b = 255;
  }

  return {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b),
  };
}

export function rgbToKelvinDmx(r: number, g: number, b: number): number {
  const nr = Math.min(255, Math.max(0, r)) / 255;
  const ng = Math.min(255, Math.max(0, g)) / 255;
  const nb = Math.min(255, Math.max(0, b)) / 255;

  const rLin = nr <= 0.04045 ? nr / 12.92 : Math.pow((nr + 0.055) / 1.055, 2.4);
  const gLin = ng <= 0.04045 ? ng / 12.92 : Math.pow((ng + 0.055) / 1.055, 2.4);
  const bLin = nb <= 0.04045 ? nb / 12.92 : Math.pow((nb + 0.055) / 1.055, 2.4);

  const X = rLin * 0.4124 + gLin * 0.3576 + bLin * 0.1805;
  const Y = rLin * 0.2126 + gLin * 0.7152 + bLin * 0.0722;
  const Z = rLin * 0.0193 + gLin * 0.1192 + bLin * 0.9505;

  const sum = X + Y + Z;
  if (sum <= 0.00001) return 5600;

  const x = X / sum;
  const y = Y / sum;

  const n = (x - 0.3320) / (0.1858 - y);
  const cct = 449.0 * Math.pow(n, 3) + 3525.0 * Math.pow(n, 2) + 6823.3 * n + 5520.33;

  if (isNaN(cct) || !isFinite(cct)) return 5600;
  return Math.round(Math.min(20000, Math.max(1000, cct)));
}

// --- Art-Net 4 Protocol Packet Encoding / Decoding -------------------------
const ARTNET_HEADER_BYTES = [0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]; // "Art-Net\0"
const ARTNET_OPCODE_DMX = 0x5000;
const ARTNET_PROT_VER = 14;

export interface ArtDmxPacketOptions {
  universe: number;
  channels?: Uint8Array;
  data?: Uint8Array;
  sequence?: number;
  subnet?: number;
  net?: number;
  physical?: number;
}

export function encodeArtDmxPacket(
  optsOrUniverse: number | ArtDmxPacketOptions,
  channelsParam?: Uint8Array,
  sequenceParam = 0,
  subnetParam = 0,
): Uint8Array {
  let universe = 0;
  let channels = new Uint8Array(512);
  let sequence = 0;
  let subnet = 0;
  let net = 0;
  let physical = 0;

  if (typeof optsOrUniverse === 'object' && optsOrUniverse !== null) {
    universe = optsOrUniverse.universe ?? 0;
    const rawChannels = optsOrUniverse.channels ?? optsOrUniverse.data;
    if (rawChannels) {
      channels = new Uint8Array(rawChannels);
    }
    sequence = optsOrUniverse.sequence ?? 0;
    subnet = optsOrUniverse.subnet ?? 0;
    net = optsOrUniverse.net ?? 0;
    physical = optsOrUniverse.physical ?? 0;
  } else {
    universe = optsOrUniverse ?? 0;
    if (channelsParam) {
      channels = new Uint8Array(channelsParam);
    }
    sequence = sequenceParam;
    subnet = subnetParam;
  }

  const dmxLength = Math.min(512, Math.max(2, channels.length % 2 === 0 ? channels.length : channels.length + 1));
  const packet = new Uint8Array(18 + dmxLength);

  // 0-7: Header "Art-Net\0"
  for (let i = 0; i < 8; i++) {
    packet[i] = ARTNET_HEADER_BYTES[i];
  }

  // 8-9: OpCode (0x5000 OpDmx, Little Endian)
  packet[8] = ARTNET_OPCODE_DMX & 0xff;
  packet[9] = (ARTNET_OPCODE_DMX >> 8) & 0xff;

  // 10-11: Protocol Version (14, Big Endian)
  packet[10] = (ARTNET_PROT_VER >> 8) & 0xff;
  packet[11] = ARTNET_PROT_VER & 0xff;

  // 12: Sequence (0x00 to disable, or 1-255)
  packet[12] = sequence & 0xff;

  // 13: Physical Port
  packet[13] = physical & 0xff;

  // 14: SubUni (low 4 bits = universe, high 4 bits = subnet)
  const lowUni = universe & 0x0f;
  const sub = (subnet & 0x0f) << 4;
  packet[14] = (sub | lowUni) & 0xff;

  // 15: Net (high 7 bits of 15-bit address)
  const netByte = ((universe >> 8) | (net & 0x7f)) & 0x7f;
  packet[15] = netByte;

  // 16-17: Length (Big Endian, 2 to 512, even)
  packet[16] = (dmxLength >> 8) & 0xff;
  packet[17] = dmxLength & 0xff;

  // 18+: DMX Data
  packet.set(channels.subarray(0, dmxLength), 18);

  return packet;
}

export function decodeArtDmxPacket(packet: Uint8Array): {
  universe: number;
  sequence: number;
  subnet: number;
  net: number;
  physical?: number;
  channels: Uint8Array;
  data: Uint8Array;
} | null {
  if (packet.length < 18) return null;

  // Check header
  for (let i = 0; i < 8; i++) {
    if (packet[i] !== ARTNET_HEADER_BYTES[i]) return null;
  }

  // Check OpCode 0x5000 (Little Endian)
  const opCode = packet[8] | (packet[9] << 8);
  if (opCode !== ARTNET_OPCODE_DMX) return null;

  const sequence = packet[12];
  const physical = packet[13];
  const subUni = packet[14];
  const net = packet[15];
  const length = (packet[16] << 8) | packet[17];

  const lowUni = subUni & 0x0f;
  const subnet = (subUni >> 4) & 0x0f;
  const universe = lowUni | (net << 8);

  const dmxData = packet.subarray(18, 18 + Math.min(length, packet.length - 18));
  const channels = new Uint8Array(512);
  channels.set(dmxData.subarray(0, 512));

  return { universe, sequence, subnet, net, physical, channels, data: channels };
}

// --- ANSI E1.31 sACN Protocol Packet Encoding / Decoding -------------------
const SACN_ROOT_VECTOR = 0x00000004;
const SACN_FRAMING_VECTOR = 0x00000002;
const SACN_DMP_VECTOR = 0x02;
const SACN_DEFAULT_CID = new Uint8Array([
  0x53, 0x65, 0x74, 0x56, 0x69, 0x65, 0x77, 0x2d,
  0x44, 0x4d, 0x58, 0x2d, 0x42, 0x72, 0x69, 0x64,
]); // "SetView-DMX-Brid"

export interface SacnPacketOptions {
  universe: number;
  channels?: Uint8Array | number[];
  data?: Uint8Array | number[];
  sequence?: number;
  priority?: number;
  sourceName?: string;
  cid?: Uint8Array | number[];
}

export function encodeSacnPacket(
  optsOrUniverse: number | SacnPacketOptions,
  channelsParam?: Uint8Array | number[],
  sequenceParam = 0,
  priorityParam = 100,
  sourceNameParam = 'SetView Soundstage DMX Bridge',
): Uint8Array {
  let universe = 1;
  let channels = new Uint8Array(512);
  let sequence = 0;
  let priority = 100;
  let sourceName = 'SetView Soundstage DMX Bridge';
  let cid: Uint8Array = SACN_DEFAULT_CID;

  if (typeof optsOrUniverse === 'object' && optsOrUniverse !== null) {
    universe = optsOrUniverse.universe ?? 1;
    const rawChannels = optsOrUniverse.channels ?? optsOrUniverse.data;
    if (rawChannels) {
      channels = new Uint8Array(rawChannels);
    }
    sequence = optsOrUniverse.sequence ?? 0;
    priority = optsOrUniverse.priority ?? 100;
    sourceName = optsOrUniverse.sourceName ?? 'SetView Soundstage DMX Bridge';
    if (optsOrUniverse.cid) {
      cid = new Uint8Array(optsOrUniverse.cid);
    }
  } else {
    universe = optsOrUniverse ?? 1;
    if (channelsParam) {
      channels = new Uint8Array(channelsParam);
    }
    sequence = sequenceParam;
    priority = priorityParam;
    sourceName = sourceNameParam;
  }

  const dmxCount = Math.min(512, Math.max(1, channels.length));
  const totalLength = 126 + dmxCount; // 38 root + 77 framing + 11 DMP header + 1 START code + dmxCount
  const packet = new Uint8Array(totalLength);

  // --- Root Layer (38 bytes) ---
  // 0-1: Preamble Size 0x0010
  packet[0] = 0x00;
  packet[1] = 0x10;
  // 2-3: Post-amble Size 0x0000
  packet[2] = 0x00;
  packet[3] = 0x00;
  // 4-15: ACN Packet Identifier "ASC-E1.17\0\0\0"
  const acnPid = [0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00];
  for (let i = 0; i < 12; i++) {
    packet[4 + i] = acnPid[i];
  }
  // 16-17: Flags (0x7000) & Length (Root layer length = totalLength - 16)
  const rootLen = totalLength - 16;
  packet[16] = 0x70 | ((rootLen >> 8) & 0x0f);
  packet[17] = rootLen & 0xff;
  // 18-21: Vector 0x00000004 (Root layer)
  packet[18] = (SACN_ROOT_VECTOR >> 24) & 0xff;
  packet[19] = (SACN_ROOT_VECTOR >> 16) & 0xff;
  packet[20] = (SACN_ROOT_VECTOR >> 8) & 0xff;
  packet[21] = SACN_ROOT_VECTOR & 0xff;
  // 22-37: CID (Sender UUID 16 bytes)
  for (let i = 0; i < 16; i++) {
    packet[22 + i] = i < cid.length ? cid[i] : 0;
  }

  // --- Framing Layer (77 bytes: 38..114) ---
  // 38-39: Flags (0x7000) & Length (Framing layer length = totalLength - 38)
  const frameLen = totalLength - 38;
  packet[38] = 0x70 | ((frameLen >> 8) & 0x0f);
  packet[39] = frameLen & 0xff;
  // 40-43: Vector 0x00000002
  packet[40] = (SACN_FRAMING_VECTOR >> 24) & 0xff;
  packet[41] = (SACN_FRAMING_VECTOR >> 16) & 0xff;
  packet[42] = (SACN_FRAMING_VECTOR >> 8) & 0xff;
  packet[43] = SACN_FRAMING_VECTOR & 0xff;
  // 44-107: Source Name (64 bytes null-padded UTF-8)
  for (let i = 0; i < 63 && i < sourceName.length; i++) {
    packet[44 + i] = sourceName.charCodeAt(i) & 0xff;
  }
  packet[107] = 0x00;
  // 108: Priority (0-200, default 100)
  packet[108] = Math.max(0, Math.min(200, priority));
  // 109-110: Synchronization Address (0x0000 = unsynchronized)
  packet[109] = 0x00;
  packet[110] = 0x00;
  // 111: Sequence Number
  packet[111] = sequence & 0xff;
  // 112: Options (0x00)
  packet[112] = 0x00;
  // 113-114: Universe Number (1-63999, Big Endian)
  packet[113] = (universe >> 8) & 0xff;
  packet[114] = universe & 0xff;

  // --- DMP Layer (11 bytes header + 1 START code + dmxCount: 115..end) ---
  // 115-116: Flags (0x7000) & Length (DMP layer length = totalLength - 115)
  const dmpLen = totalLength - 115;
  packet[115] = 0x70 | ((dmpLen >> 8) & 0x0f);
  packet[116] = dmpLen & 0xff;
  // 117: Vector 0x02
  packet[117] = SACN_DMP_VECTOR;
  // 118: Address Type & Data Type 0xa1
  packet[118] = 0xa1;
  // 119-120: First Property Address 0x0000
  packet[119] = 0x00;
  packet[120] = 0x00;
  // 121-122: Address Increment 0x0001
  packet[121] = 0x00;
  packet[122] = 0x01;
  // 123-124: Property value count (1 START code + dmxCount)
  const propCount = 1 + dmxCount;
  packet[123] = (propCount >> 8) & 0xff;
  packet[124] = propCount & 0xff;
  // 125: DMX START Code (0x00 = Null START code for standard dimmer/lighting data)
  packet[125] = 0x00;
  // 126+: Slot Data
  packet.set(channels.subarray(0, dmxCount), 126);

  return packet;
}

export function decodeSacnPacket(packet: Uint8Array): {
  universe: number;
  priority: number;
  sequence: number;
  sourceName: string;
  channels: Uint8Array;
  data: Uint8Array;
} | null {
  if (packet.length < 126) return null;

  // Check Root Layer Preamble
  if (packet[0] !== 0x00 || packet[1] !== 0x10) return null;

  // Check Root Layer Vector 0x00000004
  const rootVec = (packet[18] << 24) | (packet[19] << 16) | (packet[20] << 8) | packet[21];
  if (rootVec !== SACN_ROOT_VECTOR) return null;

  // Check Framing Layer Vector 0x00000002
  const frameVec = (packet[40] << 24) | (packet[41] << 16) | (packet[42] << 8) | packet[43];
  if (frameVec !== SACN_FRAMING_VECTOR) return null;

  // Extract source name (up to 64 chars or null byte)
  let nameEnd = 44;
  while (nameEnd < 108 && packet[nameEnd] !== 0) {
    nameEnd++;
  }
  const decoder = new TextDecoder();
  const sourceName = decoder.decode(packet.subarray(44, nameEnd));

  const priority = packet[108];
  const sequence = packet[111];
  const universe = (packet[113] << 8) | packet[114];

  // DMP Vector 0x02
  if (packet[117] !== 0x02) return null;

  // DMX START Code check
  if (packet[125] !== 0x00) return null;

  const propCount = (packet[123] << 8) | packet[124];
  const channelCount = Math.max(0, propCount - 1);
  const available = Math.min(channelCount, packet.length - 126);

  const channels = new Uint8Array(512);
  channels.set(packet.subarray(126, 126 + available));

  return {
    universe,
    priority,
    sequence,
    sourceName,
    channels,
    data: channels,
  };
}

// --- Fixture Channel Mapping -----------------------------------------------

export function mapLightToDmxChannels(
  light: {
    intensity: number;
    kelvin?: number;
    colorHex?: string;
    color?: string;
    position?: { x: number; y: number; z: number } | [number, number, number];
  },
  profile: DmxFixtureProfile,
  startAddress: number,
  universeData: Uint8Array,
): void {
  const baseIdx = Math.max(0, startAddress - 1);
  const kelvin = light.kelvin ?? 5600;
  const hexStr = light.colorHex ?? light.color;
  const rgb = hexStr ? hexToRgb(hexStr) : kelvinToRgbDmx(kelvin);
  const normIntensity = Math.min(10, Math.max(0, light.intensity));
  const int8 = Math.min(255, Math.max(0, Math.round(Math.min(1, normIntensity) * 255)));
  const int16 = Math.min(65535, Math.max(0, Math.round(Math.min(1, normIntensity) * 65535)));
  const posX = Array.isArray(light.position) ? light.position[0] : light.position?.x;
  const posZ = Array.isArray(light.position) ? light.position[2] : light.position?.z;

  for (const m of profile.mappings) {
    const ch = baseIdx + m.channelOffset;
    if (ch < 0 || ch >= 512) continue;

    switch (m.parameter) {
      case 'dimmer': {
        if (m.bitDepth === 16) {
          universeData[ch] = (int16 >> 8) & 0xff;
          if (ch + 1 < 512) universeData[ch + 1] = int16 & 0xff;
        } else {
          universeData[ch] = int8;
        }
        break;
      }
      case 'cct': {
        const minK = m.minValue ?? 2700;
        const maxK = m.maxValue ?? 6500;
        const normK = Math.min(1, Math.max(0, (kelvin - minK) / Math.max(1, maxK - minK)));
        if (m.bitDepth === 16) {
          const val16 = Math.round(normK * 65535);
          universeData[ch] = (val16 >> 8) & 0xff;
          if (ch + 1 < 512) universeData[ch + 1] = val16 & 0xff;
        } else {
          universeData[ch] = Math.round(normK * 255);
        }
        break;
      }
      case 'tint': {
        universeData[ch] = m.defaultValue ?? 128;
        break;
      }
      case 'red': {
        universeData[ch] = rgb.r;
        break;
      }
      case 'green': {
        universeData[ch] = rgb.g;
        break;
      }
      case 'blue': {
        universeData[ch] = rgb.b;
        break;
      }
      case 'white': {
        const whiteVal = Math.min(rgb.r, rgb.g, rgb.b);
        universeData[ch] = whiteVal;
        break;
      }
      case 'amber': {
        const amberVal = rgb.r > rgb.b ? Math.min(rgb.r, rgb.g) : 0;
        universeData[ch] = amberVal;
        break;
      }
      case 'pan': {
        if (posX !== undefined) {
          const normPan = Math.min(1, Math.max(0, (posX + 10) / 20));
          if (m.bitDepth === 16) {
            const val16 = Math.round(normPan * 65535);
            universeData[ch] = (val16 >> 8) & 0xff;
            if (ch + 1 < 512) universeData[ch + 1] = val16 & 0xff;
          } else {
            universeData[ch] = Math.round(normPan * 255);
          }
        } else {
          universeData[ch] = m.defaultValue ?? 128;
        }
        break;
      }
      case 'tilt': {
        if (posZ !== undefined) {
          const normTilt = Math.min(1, Math.max(0, (posZ + 10) / 20));
          if (m.bitDepth === 16) {
            const val16 = Math.round(normTilt * 65535);
            universeData[ch] = (val16 >> 8) & 0xff;
            if (ch + 1 < 512) universeData[ch + 1] = val16 & 0xff;
          } else {
            universeData[ch] = Math.round(normTilt * 255);
          }
        } else {
          universeData[ch] = m.defaultValue ?? 128;
        }
        break;
      }
      case 'strobe': {
        universeData[ch] = m.defaultValue ?? 0;
        break;
      }
      case 'zoom':
      case 'focus': {
        universeData[ch] = m.defaultValue ?? 128;
        break;
      }
    }
  }
}

export function mapDmxChannelsToLight(
  universeData: Uint8Array,
  arg2: DmxFixtureProfile | number,
  arg3: DmxFixtureProfile | number,
  fallbackLight?: any,
): { intensity: number; kelvin: number; colorHex: string; color: string } {
  let profile: DmxFixtureProfile;
  let startAddress = 1;

  if (typeof arg2 === 'object' && arg2 !== null) {
    profile = arg2;
    startAddress = typeof arg3 === 'number' ? arg3 : 1;
  } else {
    startAddress = typeof arg2 === 'number' ? arg2 : 1;
    profile = (typeof arg3 === 'object' && arg3 !== null) ? arg3 : DMX_FIXTURE_PROFILES[0];
  }

  const baseIdx = Math.max(0, startAddress - 1);
  let intensity = 1.0;
  let kelvin = fallbackLight?.kelvin ?? 5600;
  let r = 255;
  let g = 255;
  let b = 255;
  let hasRgb = false;
  let hasCct = false;

  for (const m of profile.mappings) {
    const ch = baseIdx + m.channelOffset;
    if (ch < 0 || ch >= 512) continue;

    switch (m.parameter) {
      case 'dimmer': {
        if (m.bitDepth === 16 && ch + 1 < 512) {
          const val16 = (universeData[ch] << 8) | universeData[ch + 1];
          intensity = val16 / 65535;
        } else {
          intensity = universeData[ch] / 255;
        }
        break;
      }
      case 'cct': {
        const minK = m.minValue ?? 2700;
        const maxK = m.maxValue ?? 6500;
        let normK = 0;
        if (m.bitDepth === 16 && ch + 1 < 512) {
          const val16 = (universeData[ch] << 8) | universeData[ch + 1];
          normK = val16 / 65535;
        } else {
          normK = universeData[ch] / 255;
        }
        kelvin = Math.round(minK + normK * (maxK - minK));
        hasCct = true;
        break;
      }
      case 'red': {
        r = universeData[ch];
        hasRgb = true;
        break;
      }
      case 'green': {
        g = universeData[ch];
        hasRgb = true;
        break;
      }
      case 'blue': {
        b = universeData[ch];
        hasRgb = true;
        break;
      }
    }
  }

  if (hasRgb && !hasCct) {
    kelvin = rgbToKelvinDmx(r, g, b);
  } else if (hasCct && !hasRgb) {
    const rgbFromK = kelvinToRgbDmx(kelvin);
    r = rgbFromK.r;
    g = rgbFromK.g;
    b = rgbFromK.b;
  }

  const colorHex = rgbToHex(r, g, b);
  return {
    intensity: Math.round(intensity * 100) / 100,
    kelvin,
    colorHex,
    color: colorHex,
  };
}

// --- CSV Patch List Export (RFC 4180 compliant) ----------------------------

export function exportDmxPatchListCsv(patches: DmxPatchEntry[], profiles: DmxFixtureProfile[]): string {
  const profileMap = new Map<string, DmxFixtureProfile>(profiles.map((p) => [p.id, p]));
  const headers = [
    'Patch ID',
    'Light ID',
    'Light Name',
    'Universe',
    'Start Address',
    'End Address',
    'Footprint',
    'Profile ID',
    'Manufacturer',
    'Model',
    'Mode',
    'Status',
  ];

  const rows = patches.map((patch) => {
    const profile = profileMap.get(patch.fixtureProfileId);
    const footprint = profile ? profile.totalChannels : 1;
    const endAddress = Math.min(512, patch.startAddress + footprint - 1);
    const mfg = profile ? profile.manufacturer : 'Generic';
    const model = profile ? profile.model : 'Dimmer';
    const mode = profile ? profile.mode : 'Default';
    const status = patch.enabled ? 'ENABLED' : 'DISABLED';

    return [
      `"${patch.patchId}"`,
      `"${patch.lightId}"`,
      `"${patch.lightName.replace(/"/g, '""')}"`,
      patch.universe,
      patch.startAddress,
      endAddress,
      footprint,
      `"${patch.fixtureProfileId}"`,
      `"${mfg.replace(/"/g, '""')}"`,
      `"${model.replace(/"/g, '""')}"`,
      `"${mode.replace(/"/g, '""')}"`,
      `"${status}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}
