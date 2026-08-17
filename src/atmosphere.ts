// ---------------------------------------------------------------------------
// Atmospheric fog and volumetric lighting domain model.
// ZERO Three.js and ZERO DOM dependencies: pure data and deterministic math.
// ---------------------------------------------------------------------------

export type AtmospherePreset =
  | 'clear'
  | 'subtle_haze'
  | 'cinematic_fog'
  | 'dramatic_shafts'
  | 'noir_smoky'
  | 'custom';

export interface AtmosphereConfig {
  /** Master toggle for atmospheric simulation and volumetric lighting. */
  enabled: boolean;
  /** Curated cinematic preset or custom parameters. */
  preset: AtmospherePreset;
  /** Normalized medium density [0.0, 1.0]. */
  density: number;
  /** Atmospheric tint color as hex string (#rrggbb). */
  tintHex: string;
  /** Forward scattering phase factor / Mie scattering [0.0, 1.0]. */
  scatteringFactor: number;
  /** Height extinction falloff coefficient per meter [0.0, 10.0]. */
  heightFalloff: number;
  /** Number of floating ambient dust motes [0, 1000]. */
  dustMotesCount: number;
  /** Volumetric light beam intensity multiplier [0.0, 10.0]. */
  beamIntensity: number;
}

export const ATMOSPHERE_PRESETS: Record<Exclude<AtmospherePreset, 'custom'>, AtmosphereConfig> = {
  clear: {
    enabled: false,
    preset: 'clear',
    density: 0.0,
    tintHex: '#ffffff',
    scatteringFactor: 0.1,
    heightFalloff: 0.0,
    dustMotesCount: 0,
    beamIntensity: 0.0,
  },
  subtle_haze: {
    enabled: true,
    preset: 'subtle_haze',
    density: 0.15,
    tintHex: '#d8e2ec',
    scatteringFactor: 0.35,
    heightFalloff: 0.25,
    dustMotesCount: 80,
    beamIntensity: 1.2,
  },
  cinematic_fog: {
    enabled: true,
    preset: 'cinematic_fog',
    density: 0.4,
    tintHex: '#b4c6d8',
    scatteringFactor: 0.55,
    heightFalloff: 0.6,
    dustMotesCount: 160,
    beamIntensity: 2.2,
  },
  dramatic_shafts: {
    enabled: true,
    preset: 'dramatic_shafts',
    density: 0.65,
    tintHex: '#e6dfd5',
    scatteringFactor: 0.85,
    heightFalloff: 0.4,
    dustMotesCount: 250,
    beamIntensity: 3.8,
  },
  noir_smoky: {
    enabled: true,
    preset: 'noir_smoky',
    density: 0.8,
    tintHex: '#8c949e',
    scatteringFactor: 0.7,
    heightFalloff: 0.9,
    dustMotesCount: 120,
    beamIntensity: 4.5,
  },
};

/**
 * Validates if the given value conforms to the AtmosphereConfig interface.
 * Pure.
 */
export function isAtmosphereConfig(v: unknown): v is AtmosphereConfig {
  const c = v as AtmosphereConfig;
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.enabled === 'boolean' &&
    typeof c.preset === 'string' &&
    ['clear', 'subtle_haze', 'cinematic_fog', 'dramatic_shafts', 'noir_smoky', 'custom'].includes(c.preset) &&
    typeof c.density === 'number' &&
    Number.isFinite(c.density) &&
    c.density >= 0 &&
    typeof c.tintHex === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(c.tintHex) &&
    typeof c.scatteringFactor === 'number' &&
    Number.isFinite(c.scatteringFactor) &&
    typeof c.heightFalloff === 'number' &&
    Number.isFinite(c.heightFalloff) &&
    typeof c.dustMotesCount === 'number' &&
    Number.isFinite(c.dustMotesCount) &&
    typeof c.beamIntensity === 'number' &&
    Number.isFinite(c.beamIntensity)
  );
}

/**
 * Sanitizes and repairs an atmospheric configuration object, clamping all values to valid ranges.
 * Pure.
 */
export function normalizeAtmosphereConfig(raw: unknown): AtmosphereConfig {
  if (!raw || typeof raw !== 'object') {
    return createAtmosphereConfig('clear');
  }

  const r = raw as Partial<AtmosphereConfig>;
  const validPresets: AtmospherePreset[] = [
    'clear',
    'subtle_haze',
    'cinematic_fog',
    'dramatic_shafts',
    'noir_smoky',
    'custom',
  ];

  const preset: AtmospherePreset =
    typeof r.preset === 'string' && validPresets.includes(r.preset as AtmospherePreset)
      ? (r.preset as AtmospherePreset)
      : 'custom';

  const defaultBase = preset !== 'custom' ? ATMOSPHERE_PRESETS[preset] : ATMOSPHERE_PRESETS.subtle_haze;

  const enabled = typeof r.enabled === 'boolean' ? r.enabled : defaultBase.enabled;
  const density =
    typeof r.density === 'number' && Number.isFinite(r.density)
      ? Math.max(0, Math.min(1.0, r.density))
      : defaultBase.density;

  let tintHex = typeof r.tintHex === 'string' ? r.tintHex.trim() : defaultBase.tintHex;
  if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(tintHex)) {
    tintHex = defaultBase.tintHex;
  }

  const scatteringFactor =
    typeof r.scatteringFactor === 'number' && Number.isFinite(r.scatteringFactor)
      ? Math.max(0, Math.min(1.0, r.scatteringFactor))
      : defaultBase.scatteringFactor;

  const heightFalloff =
    typeof r.heightFalloff === 'number' && Number.isFinite(r.heightFalloff)
      ? Math.max(0, Math.min(10.0, r.heightFalloff))
      : defaultBase.heightFalloff;

  const dustMotesCount =
    typeof r.dustMotesCount === 'number' && Number.isFinite(r.dustMotesCount)
      ? Math.max(0, Math.min(1000, Math.round(r.dustMotesCount)))
      : defaultBase.dustMotesCount;

  const beamIntensity =
    typeof r.beamIntensity === 'number' && Number.isFinite(r.beamIntensity)
      ? Math.max(0, Math.min(10.0, r.beamIntensity))
      : defaultBase.beamIntensity;

  return {
    enabled,
    preset,
    density,
    tintHex,
    scatteringFactor,
    heightFalloff,
    dustMotesCount,
    beamIntensity,
  };
}

/**
 * Creates a validated atmosphere config from a preset with optional field overrides.
 * Pure.
 */
export function createAtmosphereConfig(
  preset: AtmospherePreset = 'clear',
  overrides?: Partial<AtmosphereConfig>,
): AtmosphereConfig {
  const base = preset === 'custom' ? ATMOSPHERE_PRESETS.subtle_haze : ATMOSPHERE_PRESETS[preset];
  const config: AtmosphereConfig = {
    ...base,
    preset,
    ...overrides,
  };
  return normalizeAtmosphereConfig(config);
}

/**
 * Calculates optical transmittance attenuation according to the Beer-Lambert extinction law.
 * Returns transmittance factor in [0.0, 1.0].
 * Pure.
 */
export function calculateVolumetricAttenuation(
  distanceM: number,
  density: number,
  scattering: number = 0.5,
): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 1.0;
  if (!Number.isFinite(density) || density <= 0) return 1.0;

  const validScattering = Number.isFinite(scattering) ? Math.max(0, scattering) : 0.5;
  const extinctionCoefficient = density * (1.0 + validScattering * 0.5);
  const opticalDepth = extinctionCoefficient * distanceM;
  const transmittance = Math.exp(-opticalDepth);

  return Math.max(0, Math.min(1.0, transmittance));
}

/**
 * Calculates scattered beam in-scatter luminance along a light beam ray.
 * Pure.
 */
export function calculateBeamLuminance(
  lightIntensity: number,
  beamIntensity: number,
  distanceM: number,
  density: number,
): number {
  if (!Number.isFinite(lightIntensity) || lightIntensity <= 0) return 0.0;
  if (!Number.isFinite(beamIntensity) || beamIntensity <= 0) return 0.0;
  if (!Number.isFinite(density) || density <= 0) return 0.0;

  const dist = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0.0;
  const geometricFalloff = 1.0 / (1.0 + 0.08 * dist * dist);
  const mediumExtinction = Math.exp(-density * 0.25 * dist);
  const inScatterLuminance = lightIntensity * beamIntensity * density * geometricFalloff * mediumExtinction;

  return Number.isFinite(inScatterLuminance) ? Math.max(0, inScatterLuminance) : 0.0;
}
