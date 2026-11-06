// ---------------------------------------------------------------------------
// Length units for people (roadmap P2.2). PURE: no three.js, no DOM.
//
// SceneData stays in meters (y-up, feet origin); nothing here changes the
// coordinate contract. This module only turns meters into readouts (13 ft 6 in,
// or 4.11 m) and turns what people type back into meters.
//
// Inches convert as inches * 254 / 10000, so any whole number of 1/16 in maps
// to the nearest double of its exact metric value (a 4x8 ft sheet is exactly
// 1.2192 x 2.4384 m), and format then parse returns the same meters.
// ---------------------------------------------------------------------------

export type UnitSystem = 'imperial' | 'metric';
/** Imperial readout resolution: whole inches, or 1/2 to 1/16 in. */
export type InchFraction = 1 | 2 | 4 | 8 | 16;

export interface LengthFormat {
  system: UnitSystem;
  /** Imperial resolution. Default 1/8 in. */
  fractionIn?: InchFraction;
  /** Metric decimal places. Default 2 (centimeters). */
  decimals?: number;
}

/** Exact: 1 in = 25.4 mm. */
export const METERS_PER_INCH = 0.0254;
export const INCHES_PER_FOOT = 12;
/** The per-device setting (localStorage key). */
export const UNIT_SYSTEM_STORAGE_KEY = 'setview.units';

/** Meters for a length in inches. Whole sixteenths convert without drift. */
export function inchesToMeters(inches: number): number {
  return (inches * 254) / 10000;
}

export function metersToInches(m: number): number {
  return (m * 10000) / 254;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * A length for display. Imperial rounds to the nearest fraction first, so it
 * never reads 12 in: 13 ft 6 in, 13 ft 6 1/2 in, 13 ft 0 in, 7/8 in.
 * Metric: 4.11 m.
 */
export function formatLength(m: number, fmt: LengthFormat): string {
  if (!Number.isFinite(m)) return '?';
  if (fmt.system === 'metric') return `${fixed(m, fmt.decimals ?? 2)} m`;
  const f = fmt.fractionIn ?? 8;
  const n = Math.round(Math.abs(metersToInches(m)) * f);
  if (n === 0) return '0 in';
  const perFoot = INCHES_PER_FOOT * f;
  const feet = Math.floor(n / perFoot);
  const rem = n - feet * perFoot;
  const whole = Math.floor(rem / f);
  const num = rem - whole * f;
  let inches: string;
  if (num === 0) {
    inches = `${whole}`;
  } else {
    const g = gcd(num, f);
    const frac = `${num / g}/${f / g}`;
    inches = whole > 0 ? `${whole} ${frac}` : frac;
  }
  const sign = m < 0 ? '-' : '';
  return feet > 0 ? `${sign}${feet} ft ${inches} in` : `${sign}${inches} in`;
}

/** toFixed without a "-0.00" for values that round to zero. */
function fixed(v: number, decimals: number): string {
  const s = v.toFixed(decimals);
  return Number(s) === 0 ? (0).toFixed(decimals) : s;
}

/**
 * Two or three lengths as one readout: "20 ft 4 in × 16 ft 5 in", or
 * "6.2 × 5.0 m" (metric names its unit once).
 */
export function formatDims(w: number, h: number, d: number | undefined, fmt: LengthFormat): string {
  const parts = d === undefined ? [w, h] : [w, h, d];
  if (fmt.system === 'metric') {
    if (!parts.every(Number.isFinite)) return '?';
    return `${parts.map((v) => fixed(v, fmt.decimals ?? 2)).join(' × ')} m`;
  }
  return parts.map((v) => formatLength(v, fmt)).join(' × ');
}

type LengthUnit = 'ft' | 'in' | 'm' | 'cm' | 'mm';

const UNIT_WORDS: Record<string, LengthUnit> = {
  feet: 'ft',
  foot: 'ft',
  ft: 'ft',
  "'": 'ft',
  inches: 'in',
  inch: 'in',
  in: 'in',
  '"': 'in',
  meters: 'm',
  meter: 'm',
  metres: 'm',
  metre: 'm',
  m: 'm',
  cm: 'cm',
  mm: 'mm',
};

// One term: a quantity (6 1/2, 1/2, 6, 6.5, .5) and an optional unit. Longer
// unit words come first so "inches" is not read as "in" plus garbage.
const TERM =
  /^\s*(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:\.\d*)?|\.\d+))\s*(feet|foot|ft|'|inches|inch|in|"|meters|meter|metres|metre|mm|cm|m)?/;

/**
 * Meters for a typed length, or null when it is not one. Accepts 13'6",
 * 13' 6", 13'-6", 13 ft 6 in, 13 6 (feet then inches), 6 1/2", 102in, 2.6m,
 * 260cm and 2600mm, with curly quotes and primes. A bare number is feet in
 * imperial and meters in metric. Feet and meters never mix in one entry, and
 * inches after feet stay under 12.
 */
export function parseLength(text: string, system: UnitSystem = 'metric'): number | null {
  let s = text
    .trim()
    .toLowerCase()
    .replace(/[′’‘]/g, "'")
    .replace(/[″“”]|''/g, '"');
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1);
  }
  const terms: { value: number; unit: LengthUnit | null }[] = [];
  while (s.trim().length > 0) {
    if (terms.length >= 2) return null;
    const m = TERM.exec(s);
    if (!m || m[0].trim().length === 0) return null;
    let value: number;
    if (m[1] !== undefined) {
      if (Number(m[3]) === 0) return null;
      value = Number(m[1]) + Number(m[2]) / Number(m[3]);
    } else if (m[4] !== undefined) {
      if (Number(m[5]) === 0) return null;
      value = Number(m[4]) / Number(m[5]);
    } else {
      value = Number(m[6]);
    }
    if (!Number.isFinite(value)) return null;
    const unit = m[7] !== undefined ? UNIT_WORDS[m[7]] : null;
    terms.push({ value, unit });
    s = s.slice(m[0].length);
    // A unit word must end at a word boundary ("13 ftx" is not a length).
    if (/^[a-z]/.test(s)) return null;
    // 13'-6": the dash between feet and inches is a separator.
    if (unit === 'ft') s = s.replace(/^\s*-\s*(?=[\d.])/, ' ');
  }
  if (terms.length === 0) return null;

  const metricUnits = terms.some((t) => t.unit === 'm' || t.unit === 'cm' || t.unit === 'mm');
  const imperialUnits = terms.some((t) => t.unit === 'ft' || t.unit === 'in');
  if (metricUnits && imperialUnits) return null;

  if (metricUnits || (system === 'metric' && !imperialUnits)) {
    // A bare number is meters only on its own; "2 30" means nothing.
    if (terms.length === 2 && terms.some((t) => t.unit === null)) return null;
    const scale: Record<string, number> = { m: 1, cm: 100, mm: 1000 };
    let meters = 0;
    for (const t of terms) meters += t.value / scale[t.unit ?? 'm'];
    return sign * meters;
  }

  // Imperial: [feet] [inches], each at most once, feet first.
  let feet = 0;
  let inches = 0;
  if (terms.length === 1) {
    const t = terms[0];
    if (t.unit === 'in') inches = t.value;
    else feet = t.value;
  } else {
    const [a, b] = terms;
    if (a.unit === 'in' || b.unit === 'ft') return null;
    // After feet, 12 in or more is a typo ("13 16"), not a length.
    if (b.value >= INCHES_PER_FOOT) return null;
    feet = a.value;
    inches = b.value;
  }
  return sign * inchesToMeters(feet * INCHES_PER_FOOT + inches);
}

/**
 * The starting system for a browser language tag: imperial where the region
 * is the United States (en-US, es-US), metric everywhere else.
 */
export function defaultUnitSystem(language: string | null | undefined): UnitSystem {
  const subtags = (language ?? '').split(/[-_]/).slice(1);
  const region = subtags.find((t) => /^[a-z]{2}$/i.test(t) || /^\d{3}$/.test(t));
  return region && (region.toUpperCase() === 'US' || region === '840') ? 'imperial' : 'metric';
}

/** The subset of Storage this module uses. */
export interface UnitStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** This device's unit setting, or the language default when unset or unreadable. */
export function readUnitSystem(store: UnitStore | null | undefined, language: string | null | undefined): UnitSystem {
  try {
    const v = store?.getItem(UNIT_SYSTEM_STORAGE_KEY);
    if (v === 'imperial' || v === 'metric') return v;
  } catch {
    // Blocked storage: fall through to the default.
  }
  return defaultUnitSystem(language);
}

/** Saves the setting. False when storage is unavailable (it then lasts for this page only). */
export function writeUnitSystem(store: UnitStore | null | undefined, system: UnitSystem): boolean {
  if (!store) return false;
  try {
    store.setItem(UNIT_SYSTEM_STORAGE_KEY, system);
    return true;
  } catch {
    return false;
  }
}

/** The other system, for a toggle. */
export function otherUnitSystem(system: UnitSystem): UnitSystem {
  return system === 'imperial' ? 'metric' : 'imperial';
}
