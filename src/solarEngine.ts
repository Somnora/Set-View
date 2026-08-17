// ---------------------------------------------------------------------------
// SetView Physical Solar Ephemeris & Natural Environment Simulator Engine
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

import type { Vec3 } from './model.ts';

/** Geographic location parameters for solar ephemeris calculation. */
export interface GeoLocation {
  latitude: number; // Degrees: -90 (South Pole) to +90 (North Pole)
  longitude: number; // Degrees: -180 (West) to +180 (East)
  elevationM?: number; // Meters above sea level
  timezoneOffsetHours: number; // UTC offset in hours (-12 to +14)
  locationName?: string;
}

/** Calendar date for solar ephemeris calculations. */
export interface SolarDate {
  year: number;
  month: number; // 1 = January, 12 = December
  day: number; // 1 to 31
}

/** Supported solar lighting phases throughout a 24-hour cycle. */
export type SolarPhase =
  | 'daylight'
  | 'golden_hour'
  | 'civil_twilight'
  | 'nautical_twilight'
  | 'astronomical_twilight'
  | 'night';

/** Detailed astronomical solar ephemeris and radiometric lighting metrics. */
export interface SolarEphemerisResult {
  azimuthDeg: number; // 0 = North, 90 = East, 180 = South, 270 = West
  elevationDeg: number; // Degrees above horizon (-90 to +90)
  zenithDeg: number; // Degrees from zenith (90 - elevationDeg)
  declinationDeg: number; // Solar declination angle
  hourAngleDeg: number; // Local hour angle
  equationOfTimeMinutes: number; // Equation of time in minutes
  solarNoonTime: string; // HH:MM:SS local time
  sunriseTime: string; // HH:MM:SS local time
  sunsetTime: string; // HH:MM:SS local time
  goldenHourMorning: { start: string; end: string };
  goldenHourEvening: { start: string; end: string };
  blueHourMorning: { start: string; end: string };
  blueHourEvening: { start: string; end: string };
  solarPhase: SolarPhase;
  sunDirectionVector: Vec3; // Unit vector pointing towards sun in scene space
  colorTemperatureKelvin: number; // Color temp in Kelvin (2000K to 6500K+)
  directSunIlluminanceLux: number; // Direct beam illuminance in Lux (0 to 120,000)
  diffuseSkyIlluminanceLux: number; // Diffuse hemispherical sky illuminance in Lux
  shadowLengthMultiplier: number; // Shadow length multiplier for 1m vertical post (1 / tan(elev))
  shadowDirectionVector: Vec3; // Unit vector pointing in shadow casting direction on ground
}

/** Atmospheric weather and environmental conditions. */
export interface WeatherConditions {
  cloudCoveragePercent: number; // 0% (clear) to 100% (full overcast)
  cloudDensity: number; // Optical thickness 0.0 to 1.0
  fogDensityPercent: number; // Ground fog density 0% to 100%
  rainIntensityPercent: number; // Precipitation intensity 0% to 100%
  windSpeedMps: number; // Wind speed in m/s
  windHeadingDeg: number; // Wind direction (0 = North, 90 = East, etc.)
  airTurbidity: number; // Aerosol / particulate turbidity (2.0 = pristine mountain air, 10.0 = heavy haze)
}

/** Complete solar environment configuration for a scene. */
export interface SolarEnvironmentConfig {
  enabled: boolean;
  presetId?: string;
  location: GeoLocation;
  date: SolarDate;
  timeOfDayHours: number; // 0.0 to 24.0 (e.g. 17.5 = 17:30 / 5:30 PM)
  timePlaybackSpeed: number; // 0 = paused, 1 = real-time, 60 = 1 min/sec, etc.
  northHeadingDeg: number; // 0 to 360: scene True North rotation offset
  weather: WeatherConditions;
  skyTurbidity: number; // 2.0 to 10.0
  groundAlbedo: number; // 0.1 (dark asphalt) to 0.5 (light concrete/sand)
  castShadows: boolean;
  sunIntensityMultiplier: number; // User brightness multiplier (0.0 to 5.0, default 1.0)
}

/** Single hourly/minute tracking step in a 24-hour sun path table. */
export interface SolarTrackingEntry {
  timeString: string;
  timeDecimal: number;
  azimuthDeg: number;
  elevationDeg: number;
  colorTempK: number;
  directLux: number;
  shadowMultiplier: number;
  phase: string;
}

/** Curated world filming locations and studio stages. */
export interface CuratedFilmingLocation {
  id: string;
  name: string;
  region: string;
  country: string;
  location: GeoLocation;
  description: string;
}

export const CURATED_FILMING_LOCATIONS: Record<string, CuratedFilmingLocation> = {
  los_angeles: {
    id: 'los_angeles',
    name: 'Los Angeles (Hollywood Studios)',
    region: 'California',
    country: 'USA',
    location: {
      latitude: 34.0928,
      longitude: -118.3287,
      elevationM: 100,
      timezoneOffsetHours: -8,
      locationName: 'Hollywood, Los Angeles, CA',
    },
    description: 'Mediterranean climate with high sun angles and clear desert-adjacent coastal lighting.',
  },
  london: {
    id: 'london',
    name: 'London (Pinewood / Leavesden Studios)',
    region: 'England',
    country: 'UK',
    location: {
      latitude: 51.5489,
      longitude: -0.5342,
      elevationM: 60,
      timezoneOffsetHours: 0,
      locationName: 'Pinewood Studios, Iver Heath, UK',
    },
    description: 'Temperate oceanic climate with soft overcast diffusion and long twilight transitions.',
  },
  vancouver: {
    id: 'vancouver',
    name: 'Vancouver (BC Stages)',
    region: 'British Columbia',
    country: 'Canada',
    location: {
      latitude: 49.2827,
      longitude: -123.1207,
      elevationM: 70,
      timezoneOffsetHours: -8,
      locationName: 'Vancouver Film Studios, BC',
    },
    description: 'Pacific Northwest lighting with lower solar zenith angles and rich atmospheric moisture.',
  },
  atlanta: {
    id: 'atlanta',
    name: 'Atlanta (Trilith Studios)',
    region: 'Georgia',
    country: 'USA',
    location: {
      latitude: 33.4682,
      longitude: -84.4566,
      elevationM: 280,
      timezoneOffsetHours: -5,
      locationName: 'Trilith Studios, Fayetteville, GA',
    },
    description: 'Humid subtropical climate with warm golden hours and high summer solar elevation.',
  },
  sydney: {
    id: 'sydney',
    name: 'Sydney (Fox / Disney Studios Australia)',
    region: 'New South Wales',
    country: 'Australia',
    location: {
      latitude: -33.8915,
      longitude: 151.2227,
      elevationM: 45,
      timezoneOffsetHours: 10,
      locationName: 'Disney Studios Australia, Sydney',
    },
    description: 'Southern hemisphere lighting with inverted seasonal cycles and intense, crisp sunlight.',
  },
  reykjavik: {
    id: 'reykjavik',
    name: 'Reykjavik (Iceland Scout)',
    region: 'Capital Region',
    country: 'Iceland',
    location: {
      latitude: 64.1466,
      longitude: -21.9426,
      elevationM: 15,
      timezoneOffsetHours: 0,
      locationName: 'Reykjavik & Golden Circle Scout, Iceland',
    },
    description: 'Subarctic latitude featuring midnight sun in summer, dramatic low-angle sun, and prolonged golden hours.',
  },
  tokyo: {
    id: 'tokyo',
    name: 'Tokyo (Toho Studios)',
    region: 'Kanto',
    country: 'Japan',
    location: {
      latitude: 35.6366,
      longitude: 139.6053,
      elevationM: 40,
      timezoneOffsetHours: 9,
      locationName: 'Toho Studios, Setagaya, Tokyo',
    },
    description: 'Eastern Pacific lighting with clean morning illumination and atmospheric urban scatter.',
  },
  new_york: {
    id: 'new_york',
    name: 'New York (Silvercup Studios)',
    region: 'New York',
    country: 'USA',
    location: {
      latitude: 40.7516,
      longitude: -73.9438,
      elevationM: 10,
      timezoneOffsetHours: -5,
      locationName: 'Silvercup Studios, Long Island City, NY',
    },
    description: 'East coast urban lighting with distinct four-season ephemeris variation and canyon bounce.',
  },
  ouarzazate: {
    id: 'ouarzazate',
    name: 'Ouarzazate (Atlas Studios)',
    region: 'Draa-Tafilalet',
    country: 'Morocco',
    location: {
      latitude: 30.9333,
      longitude: -6.9667,
      elevationM: 1150,
      timezoneOffsetHours: 1,
      locationName: 'Atlas Film Studios, Ouarzazate, Morocco',
    },
    description: 'High-altitude desert lighting with pristine low-turbidity skies, intense direct lux, and sharp shadows.',
  },
};

/** Curated natural lighting presets. */
export interface SolarPreset {
  id: string;
  name: string;
  description: string;
  timeOfDayHours: number;
  northHeadingDeg: number;
  weather: WeatherConditions;
  skyTurbidity: number;
  groundAlbedo: number;
  sunIntensityMultiplier: number;
}

export const SOLAR_PRESETS: Record<string, SolarPreset> = {
  high_noon_clear: {
    id: 'high_noon_clear',
    name: 'High Noon (Clear Sky)',
    description: 'Overhead sun with crisp high-contrast shadows, 6000K-6500K daylight, and maximum direct illuminance.',
    timeOfDayHours: 12.0,
    northHeadingDeg: 0,
    weather: {
      cloudCoveragePercent: 5,
      cloudDensity: 0.1,
      fogDensityPercent: 0,
      rainIntensityPercent: 0,
      windSpeedMps: 2.0,
      windHeadingDeg: 45,
      airTurbidity: 2.5,
    },
    skyTurbidity: 2.5,
    groundAlbedo: 0.22,
    sunIntensityMultiplier: 1.0,
  },
  golden_hour_sunset: {
    id: 'golden_hour_sunset',
    name: 'Golden Hour (Sunset)',
    description: 'Low-angle warm sunlight at 2500K-3500K with elongated shadows and warm Rayleigh atmospheric scattering.',
    timeOfDayHours: 18.25,
    northHeadingDeg: 0,
    weather: {
      cloudCoveragePercent: 15,
      cloudDensity: 0.3,
      fogDensityPercent: 5,
      rainIntensityPercent: 0,
      windSpeedMps: 1.5,
      windHeadingDeg: 270,
      airTurbidity: 3.5,
    },
    skyTurbidity: 3.8,
    groundAlbedo: 0.25,
    sunIntensityMultiplier: 1.1,
  },
  blue_hour_dusk: {
    id: 'blue_hour_dusk',
    name: 'Blue Hour (Dusk)',
    description: 'Sun just below the horizon with deep cobalt-blue sky dome illumination and soft ambient fill.',
    timeOfDayHours: 19.5,
    northHeadingDeg: 0,
    weather: {
      cloudCoveragePercent: 10,
      cloudDensity: 0.2,
      fogDensityPercent: 8,
      rainIntensityPercent: 0,
      windSpeedMps: 1.0,
      windHeadingDeg: 180,
      airTurbidity: 2.8,
    },
    skyTurbidity: 3.0,
    groundAlbedo: 0.15,
    sunIntensityMultiplier: 0.8,
  },
  overcast_soft: {
    id: 'overcast_soft',
    name: 'Overcast (Soft Diffusion)',
    description: 'Heavy cloud layer creating a massive natural softbox with gentle wrap-around light and virtually no harsh shadows.',
    timeOfDayHours: 13.0,
    northHeadingDeg: 0,
    weather: {
      cloudCoveragePercent: 85,
      cloudDensity: 0.8,
      fogDensityPercent: 15,
      rainIntensityPercent: 0,
      windSpeedMps: 4.0,
      windHeadingDeg: 225,
      airTurbidity: 4.5,
    },
    skyTurbidity: 4.5,
    groundAlbedo: 0.2,
    sunIntensityMultiplier: 0.7,
  },
  magic_hour_sunrise: {
    id: 'magic_hour_sunrise',
    name: 'Magic Hour (Dawn)',
    description: 'Crisp morning illumination with low turbidity, delicate pink-gold horizon gradients, and light mist.',
    timeOfDayHours: 6.25,
    northHeadingDeg: 0,
    weather: {
      cloudCoveragePercent: 10,
      cloudDensity: 0.2,
      fogDensityPercent: 20,
      rainIntensityPercent: 0,
      windSpeedMps: 0.8,
      windHeadingDeg: 90,
      airTurbidity: 2.2,
    },
    skyTurbidity: 2.4,
    groundAlbedo: 0.22,
    sunIntensityMultiplier: 1.0,
  },
  night_moonlight: {
    id: 'night_moonlight',
    name: 'Night (Moonlight Fill)',
    description: 'Deep nocturnal sky with faint 4100K lunar keylight and dark ambient bounce for cinematic night exteriors.',
    timeOfDayHours: 23.5,
    northHeadingDeg: 0,
    weather: {
      cloudCoveragePercent: 5,
      cloudDensity: 0.1,
      fogDensityPercent: 5,
      rainIntensityPercent: 0,
      windSpeedMps: 1.2,
      windHeadingDeg: 0,
      airTurbidity: 2.0,
    },
    skyTurbidity: 2.0,
    groundAlbedo: 0.1,
    sunIntensityMultiplier: 0.05,
  },
};

// --- Math & Solvers ---------------------------------------------------------

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Normalizes an angle into [0, 360) range. */
export function normalizeAngle360(deg: number): number {
  let res = deg % 360;
  if (res < 0) res += 360;
  return res;
}

/** Formats decimal hours (e.g. 17.5) into HH:MM:SS string. */
export function formatHoursToTimeString(decimalHours: number): string {
  let h = decimalHours % 24;
  if (h < 0) h += 24;
  const hours = Math.floor(h);
  const remMinutes = (h - hours) * 60;
  const minutes = Math.floor(remMinutes);
  const seconds = Math.floor((remMinutes - minutes) * 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Parses HH:MM:SS or HH:MM string into decimal hours (0.0 to 24.0). */
export function parseTimeToDecimalHours(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 12.0;
  const parts = timeStr.split(':').map((p) => parseFloat(p));
  if (parts.length === 0 || isNaN(parts[0])) return 12.0;
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return Math.max(0, Math.min(24, h + m / 60 + s / 3600));
}

/**
 * Calculates Julian Day Number from calendar date and UTC decimal hour.
 * Follows standard Meeus Astronomical Algorithms formula.
 */
export function calculateJulianDay(date: SolarDate, utcHours: number): number {
  let y = date.year;
  let m = date.month;
  const d = date.day;

  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jdInt = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
  return jdInt + utcHours / 24.0;
}

/**
 * NOAA Solar Position and Ephemeris Solver.
 * Implements the rigorous National Oceanic and Atmospheric Administration
 * algorithm for solar declination, equation of time, solar noon, azimuth,
 * unrefracted elevation, and atmospheric refraction.
 */
export function calculateSolarEphemeris(config: SolarEnvironmentConfig): SolarEphemerisResult {
  const { location, date, timeOfDayHours, northHeadingDeg, weather, skyTurbidity } = config;

  // 1. Calculate UTC time
  let utcHours = timeOfDayHours - location.timezoneOffsetHours;
  let julianDate = date;
  if (utcHours < 0) {
    utcHours += 24;
    // previous day adjustment if crossing midnight in UTC
    const prevDate = new Date(Date.UTC(date.year, date.month - 1, date.day - 1));
    julianDate = {
      year: prevDate.getUTCFullYear(),
      month: prevDate.getUTCMonth() + 1,
      day: prevDate.getUTCDate(),
    };
  } else if (utcHours >= 24) {
    utcHours -= 24;
    const nextDate = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
    julianDate = {
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      day: nextDate.getUTCDate(),
    };
  }

  const jd = calculateJulianDay(julianDate, utcHours);
  const t = (jd - 2451545.0) / 36525.0; // Julian century

  // 2. Geometric mean longitude of the Sun (degrees)
  let l0 = 280.46646 + t * (36000.76983 + 0.0003032 * t);
  l0 = normalizeAngle360(l0);

  // 3. Geometric mean anomaly of the Sun (degrees)
  const mDeg = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const mRad = mDeg * DEG2RAD;

  // 4. Eccentricity of Earth's orbit
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  // 5. Sun's equation of the center (degrees)
  const c =
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289;

  // 6. Sun's true longitude (degrees)
  const sunTrueLong = l0 + c;

  // 7. Sun's apparent longitude (degrees)
  const omega = 125.04 - 1934.136 * t;
  const lambda = sunTrueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG2RAD);

  // 8. Mean obliquity of the ecliptic (degrees)
  const obMean =
    23.0 +
    (26.0 +
      (21.448 -
        t * (46.815 + t * (0.00059 - t * 0.001813)))) /
      60.0;
  const obCorr = obMean + 0.00256 * Math.cos(omega * DEG2RAD);

  // 9. Solar declination (degrees)
  const sinDeclination = Math.sin(obCorr * DEG2RAD) * Math.sin(lambda * DEG2RAD);
  const declinationRad = Math.asin(Math.max(-1, Math.min(1, sinDeclination)));
  const declinationDeg = declinationRad * RAD2DEG;

  // 10. Equation of Time (minutes)
  const yVar = Math.tan((obCorr * DEG2RAD) / 2) * Math.tan((obCorr * DEG2RAD) / 2);
  const eqTime =
    4 *
    RAD2DEG *
    (yVar * Math.sin(2 * l0 * DEG2RAD) -
      2 * e * Math.sin(mRad) +
      4 * e * yVar * Math.sin(mRad) * Math.cos(2 * l0 * DEG2RAD) -
      0.5 * yVar * yVar * Math.sin(4 * l0 * DEG2RAD) -
      1.25 * e * e * Math.sin(2 * mRad));

  // 11. True Solar Time & Local Hour Angle
  const solarTimeOffset = eqTime + 4 * location.longitude - 60 * location.timezoneOffsetHours;
  let trueSolarTimeMinutes = (timeOfDayHours * 60 + solarTimeOffset) % 1440;
  if (trueSolarTimeMinutes < 0) trueSolarTimeMinutes += 1440;

  let hourAngleDeg = trueSolarTimeMinutes / 4 - 180;
  if (hourAngleDeg < -180) hourAngleDeg += 360;

  // 12. Solar Zenith & Elevation (Unrefracted)
  const latRad = location.latitude * DEG2RAD;
  const haRad = hourAngleDeg * DEG2RAD;
  const cosZenith =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(haRad);
  const clampedCosZenith = Math.max(-1, Math.min(1, cosZenith));
  const zenithRad = Math.acos(clampedCosZenith);
  const unrefractedElevationDeg = 90 - zenithRad * RAD2DEG;

  // 13. Atmospheric Refraction Correction
  let refractionDeg = 0;
  if (unrefractedElevationDeg > 85) {
    refractionDeg = 0;
  } else if (unrefractedElevationDeg > 5) {
    const elRad = unrefractedElevationDeg * DEG2RAD;
    const tanEl = Math.tan(elRad);
    refractionDeg =
      (58.1 / tanEl - 0.07 / Math.pow(tanEl, 3) + 0.000086 / Math.pow(tanEl, 5)) / 3600;
  } else if (unrefractedElevationDeg > -0.575) {
    const el = unrefractedElevationDeg;
    refractionDeg =
      (1735.0 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))) / 3600;
  } else {
    const elRad = Math.max(-5, unrefractedElevationDeg) * DEG2RAD;
    refractionDeg = (-20.772 / Math.tan(elRad)) / 3600;
  }

  const elevationDeg = unrefractedElevationDeg + refractionDeg;
  const zenithDeg = 90 - elevationDeg;

  // 14. Solar Azimuth (0 = North, 90 = East, 180 = South, 270 = West)
  const sinZenith = Math.sin(zenithRad);
  let azimuthDeg = 180;
  if (sinZenith > 0.0001 && Math.abs(Math.cos(latRad)) > 0.0001) {
    const cosAzimuth =
      (Math.sin(declinationRad) - Math.sin(latRad) * clampedCosZenith) /
      (Math.cos(latRad) * sinZenith);
    const clampedCosAz = Math.max(-1, Math.min(1, cosAzimuth));
    const rawAzDeg = Math.acos(clampedCosAz) * RAD2DEG;

    if (hourAngleDeg > 0) {
      azimuthDeg = normalizeAngle360(360 - rawAzDeg);
    } else {
      azimuthDeg = normalizeAngle360(rawAzDeg);
    }
  }

  // 15. Solar Noon, Sunrise, Sunset, Golden Hour, and Blue Hour calculations
  const noonUtcMinutes = (720 - 4 * location.longitude - eqTime) % 1440;
  let noonLocalHours = noonUtcMinutes / 60 + location.timezoneOffsetHours;
  if (noonLocalHours < 0) noonLocalHours += 24;
  if (noonLocalHours >= 24) noonLocalHours -= 24;
  const solarNoonTime = formatHoursToTimeString(noonLocalHours);

  // Helper for finding time at target solar elevation
  const calculateHalfDayHoursAtElevation = (targetElevDeg: number): number | null => {
    const targetElevRad = targetElevDeg * DEG2RAD;
    const cosH0 =
      (Math.sin(targetElevRad) - Math.sin(latRad) * Math.sin(declinationRad)) /
      (Math.cos(latRad) * Math.cos(declinationRad));
    if (cosH0 > 1) return null; // Sun never reaches this elevation (polar night/low)
    if (cosH0 < -1) return 12; // Sun always above this elevation (midnight sun)
    return (Math.acos(cosH0) * RAD2DEG * 4) / 60;
  };

  const sunRiseSetHalfHours = calculateHalfDayHoursAtElevation(-0.8333);
  let sunriseTime = 'N/A (Polar Night)';
  let sunsetTime = 'N/A (Polar Night)';

  if (sunRiseSetHalfHours !== null) {
    if (sunRiseSetHalfHours >= 12) {
      sunriseTime = '00:00:00 (Midnight Sun)';
      sunsetTime = '23:59:59 (Midnight Sun)';
    } else {
      let riseH = noonLocalHours - sunRiseSetHalfHours;
      if (riseH < 0) riseH += 24;
      let setH = noonLocalHours + sunRiseSetHalfHours;
      if (setH >= 24) setH -= 24;
      sunriseTime = formatHoursToTimeString(riseH);
      sunsetTime = formatHoursToTimeString(setH);
    }
  }

  // Golden Hour: +6 deg to -4 deg elevation
  const goldenTopHalf = calculateHalfDayHoursAtElevation(6.0);
  const goldenBottomHalf = calculateHalfDayHoursAtElevation(-4.0);
  let goldenHourMorning = { start: 'N/A', end: 'N/A' };
  let goldenHourEvening = { start: 'N/A', end: 'N/A' };

  if (goldenBottomHalf !== null && goldenTopHalf !== null) {
    let mornStart = noonLocalHours - goldenBottomHalf;
    let mornEnd = noonLocalHours - goldenTopHalf;
    if (mornStart < 0) mornStart += 24;
    if (mornEnd < 0) mornEnd += 24;
    goldenHourMorning = {
      start: formatHoursToTimeString(mornStart),
      end: formatHoursToTimeString(mornEnd),
    };

    let eveStart = noonLocalHours + goldenTopHalf;
    let eveEnd = noonLocalHours + goldenBottomHalf;
    if (eveStart >= 24) eveStart -= 24;
    if (eveEnd >= 24) eveEnd -= 24;
    goldenHourEvening = {
      start: formatHoursToTimeString(eveStart),
      end: formatHoursToTimeString(eveEnd),
    };
  }

  // Blue Hour: -4 deg to -6 deg elevation
  const blueTopHalf = calculateHalfDayHoursAtElevation(-4.0);
  const blueBottomHalf = calculateHalfDayHoursAtElevation(-6.0);
  let blueHourMorning = { start: 'N/A', end: 'N/A' };
  let blueHourEvening = { start: 'N/A', end: 'N/A' };

  if (blueBottomHalf !== null && blueTopHalf !== null) {
    let mornStart = noonLocalHours - blueBottomHalf;
    let mornEnd = noonLocalHours - blueTopHalf;
    if (mornStart < 0) mornStart += 24;
    if (mornEnd < 0) mornEnd += 24;
    blueHourMorning = {
      start: formatHoursToTimeString(mornStart),
      end: formatHoursToTimeString(mornEnd),
    };

    let eveStart = noonLocalHours + blueTopHalf;
    let eveEnd = noonLocalHours + blueBottomHalf;
    if (eveStart >= 24) eveStart -= 24;
    if (eveEnd >= 24) eveEnd -= 24;
    blueHourEvening = {
      start: formatHoursToTimeString(eveStart),
      end: formatHoursToTimeString(eveEnd),
    };
  }

  // 16. Determine Current Solar Phase
  let solarPhase: SolarPhase = 'daylight';
  if (elevationDeg > 6.0) {
    solarPhase = 'daylight';
  } else if (elevationDeg >= -4.0) {
    solarPhase = 'golden_hour';
  } else if (elevationDeg >= -6.0) {
    solarPhase = 'civil_twilight';
  } else if (elevationDeg >= -12.0) {
    solarPhase = 'nautical_twilight';
  } else if (elevationDeg >= -18.0) {
    solarPhase = 'astronomical_twilight';
  } else {
    solarPhase = 'night';
  }

  // 17. 3D Sun Direction Vector relative to scene True North heading
  const sunDirectionVector = calculateSolarVector(azimuthDeg, elevationDeg, northHeadingDeg);

  // 18. Shadow Multiplier & 3D Shadow Direction
  const groundShadow = calculateGroundShadow(sunDirectionVector, elevationDeg);
  const shadowDirectionVector = groundShadow.groundShadowDirection;
  const shadowLengthMultiplier = groundShadow.shadowLengthMultiplier ?? 0;

  // 19. Rayleigh & Mie Color Temperature & Illuminance
  const colorMetrics = calculateRayleighMieColor(elevationDeg, skyTurbidity || weather.airTurbidity);
  const illuminance = calculateSolarIlluminance(
    elevationDeg,
    weather.cloudCoveragePercent,
    skyTurbidity || weather.airTurbidity,
    config.sunIntensityMultiplier ?? 1.0,
  );

  return {
    azimuthDeg: Number(azimuthDeg.toFixed(2)),
    elevationDeg: Number(elevationDeg.toFixed(2)),
    zenithDeg: Number(zenithDeg.toFixed(2)),
    declinationDeg: Number(declinationDeg.toFixed(2)),
    hourAngleDeg: Number(hourAngleDeg.toFixed(2)),
    equationOfTimeMinutes: Number(eqTime.toFixed(2)),
    solarNoonTime,
    sunriseTime,
    sunsetTime,
    goldenHourMorning,
    goldenHourEvening,
    blueHourMorning,
    blueHourEvening,
    solarPhase,
    sunDirectionVector,
    colorTemperatureKelvin: colorMetrics.kelvin,
    directSunIlluminanceLux: illuminance.directLux,
    diffuseSkyIlluminanceLux: illuminance.diffuseLux,
    shadowLengthMultiplier,
    shadowDirectionVector,
  };
}

/**
 * Calculates the 3D unit direction vector pointing towards the sun in scene space.
 * Coordinate space: +Y is Up, -Z is Scene North (when northHeadingDeg = 0), +X is East.
 */
export function calculateSolarVector(
  azimuthDeg: number,
  elevationDeg: number,
  northHeadingDeg: number = 0,
): Vec3 {
  const sceneHeadingRad = (azimuthDeg + northHeadingDeg) * DEG2RAD;
  const elevRad = Math.max(-89.9, Math.min(89.9, elevationDeg)) * DEG2RAD;
  const cosElev = Math.cos(elevRad);
  const sunDirX = cosElev * Math.sin(sceneHeadingRad);
  const sunDirY = Math.sin(elevRad);
  const sunDirZ = -cosElev * Math.cos(sceneHeadingRad);

  const sunMag = Math.hypot(sunDirX, sunDirY, sunDirZ) || 1.0;
  return {
    x: Number((sunDirX / sunMag).toFixed(5)),
    y: Number((sunDirY / sunMag).toFixed(5)),
    z: Number((sunDirZ / sunMag).toFixed(5)),
  };
}

export interface GroundShadowResult {
  shadowLengthMultiplier: number | null;
  groundShadowDirection: Vec3;
}

/**
 * Calculates ground shadow casting direction and length multiplier for a 1m vertical object.
 */
export function calculateGroundShadow(
  sunDirectionVector: Vec3,
  elevationDeg: number,
): GroundShadowResult {
  if (elevationDeg <= 0) {
    return {
      shadowLengthMultiplier: null,
      groundShadowDirection: { x: 0, y: 0, z: 0 },
    };
  }
  const horizDist = Math.hypot(sunDirectionVector.x, sunDirectionVector.z) || 1.0;
  const groundShadowDirection: Vec3 = {
    x: Number((-sunDirectionVector.x / horizDist).toFixed(5)),
    y: 0,
    z: Number((-sunDirectionVector.z / horizDist).toFixed(5)),
  };
  const elevRad = elevationDeg * DEG2RAD;
  const shadowLengthMultiplier = Number((1.0 / Math.tan(elevRad)).toFixed(3));
  return {
    shadowLengthMultiplier,
    groundShadowDirection,
  };
}

/**
 * Calculates physical Rayleigh & Mie scattering color temperature (Kelvin)
 * and RGB spectral tint from sun elevation angle and atmospheric turbidity.
 */
export function calculateRayleighMieColor(
  elevationDeg: number,
  turbidity: number = 2.5,
): { kelvin: number; rgb: { r: number; g: number; b: number }; hex: string } {
  const turbFactor = Math.max(2.0, Math.min(10.0, turbidity)) / 2.5;

  let kelvin = 6500;
  if (elevationDeg >= 60) {
    kelvin = 6500;
  } else if (elevationDeg >= 30) {
    // 5500K to 6500K
    const t = (elevationDeg - 30) / 30;
    kelvin = 5500 + t * 1000;
  } else if (elevationDeg >= 10) {
    // 4200K to 5500K
    const t = (elevationDeg - 10) / 20;
    kelvin = 4200 + t * 1300;
  } else if (elevationDeg >= 0) {
    // 2200K to 4200K (Sunset/Sunrise Golden Hour)
    const t = elevationDeg / 10;
    kelvin = 2200 + t * 2000;
  } else if (elevationDeg >= -6) {
    // Blue Hour / Civil Twilight (shifts from warm horizon to deep sky 8000K-11000K)
    const t = (elevationDeg + 6) / 6;
    kelvin = 9500 - t * 7300; // 9500K down to 2200K
  } else if (elevationDeg >= -18) {
    // Nautical / Astronomical Twilight (fading sky dome)
    const t = (elevationDeg + 18) / 12;
    kelvin = 4100 + t * 5400;
  } else {
    // Night moonlight
    kelvin = 4100;
  }

  // Higher turbidity warms and reddens the direct light
  if (elevationDeg > 0) {
    kelvin = Math.max(1800, kelvin - (turbFactor - 1.0) * 400);
  }

  const roundedKelvin = Math.round(kelvin);
  const rgb = kelvinToRgb(roundedKelvin);
  return {
    kelvin: roundedKelvin,
    rgb,
    hex: rgb.hex,
  };
}

/**
 * Converts color temperature in Kelvin (1000K to 12000K) to linear RGB and hex.
 * Implements Tanner Helland algorithm with Planckian blackbody locus fitting.
 */
export function kelvinToRgb(kelvin: number): { r: number; g: number; b: number; hex: string } {
  const k = Math.max(1000, Math.min(15000, kelvin)) / 100;
  let red = 0;
  let green = 0;
  let blue = 0;

  // Red
  if (k <= 66) {
    red = 255;
  } else {
    red = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    red = Math.max(0, Math.min(255, red));
  }

  // Green
  if (k <= 66) {
    green = 99.4708025861 * Math.log(k) - 161.1195681661;
  } else {
    green = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  }
  green = Math.max(0, Math.min(255, green));

  // Blue
  if (k >= 66) {
    blue = 255;
  } else if (k <= 19) {
    blue = 0;
  } else {
    blue = 138.5177312231 * Math.log(k - 10) - 305.0447927307;
    blue = Math.max(0, Math.min(255, blue));
  }

  const rInt = Math.round(red);
  const gInt = Math.round(green);
  const bInt = Math.round(blue);
  const hex = `#${rInt.toString(16).padStart(2, '0')}${gInt.toString(16).padStart(2, '0')}${bInt.toString(16).padStart(2, '0')}`;

  return {
    r: Number((red / 255).toFixed(3)),
    g: Number((green / 255).toFixed(3)),
    b: Number((blue / 255).toFixed(3)),
    hex,
  };
}

/**
 * Calculates direct and diffuse solar illuminance in Lux with Kasten-Young air mass,
 * Rayleigh/Mie atmospheric attenuation, and cloud layer extinction.
 */
export function calculateSolarIlluminance(
  elevationDeg: number,
  cloudCoveragePercent: number = 0,
  turbidity: number = 2.5,
  sunIntensityMultiplier: number = 1.0,
): { directLux: number; diffuseLux: number } {
  if (elevationDeg <= -18) {
    // Night moonlight
    return {
      directLux: Number((0.25 * sunIntensityMultiplier).toFixed(2)),
      diffuseLux: Number((0.05 * sunIntensityMultiplier).toFixed(2)),
    };
  }

  if (elevationDeg <= 0) {
    // Twilight transition
    const t = (elevationDeg + 18) / 18; // 0 at -18, 1 at 0
    const twilLux = Math.pow(t, 3.5) * 450 * sunIntensityMultiplier;
    return {
      directLux: 0,
      diffuseLux: Number(Math.max(0.1, twilLux).toFixed(1)),
    };
  }

  // Air Mass approximation (Kasten & Young, 1989)
  const sinEl = Math.sin(Math.max(0.5, elevationDeg) * DEG2RAD);
  const airMass =
    1.0 / (sinEl + 0.50572 * Math.pow(Math.max(0.01, elevationDeg + 6.07995), -1.6364));

  // Extraterrestrial solar constant ~128,000 lux
  const solarConstantLux = 128000;
  const turbFactor = Math.max(2.0, Math.min(10.0, turbidity));
  const opticalDepth = 0.18 + (turbFactor - 2.0) * 0.04;

  // Direct sun beam
  const directUnclouded = solarConstantLux * Math.exp(-opticalDepth * airMass);
  const cloudTransmittance = Math.pow(Math.max(0.005, 1.0 - (cloudCoveragePercent / 100)), 1.8);
  const directLux = Math.max(0, directUnclouded * cloudTransmittance * sunIntensityMultiplier);

  // Diffuse hemispherical sky illuminance
  const diffuseBase =
    solarConstantLux * 0.12 * Math.sin(elevationDeg * DEG2RAD) * (0.8 + (turbFactor / 5.0) * 0.3);
  const diffuseWithClouds = diffuseBase * (0.5 + (cloudCoveragePercent / 100) * 0.6);
  const diffuseLux = Math.max(0, diffuseWithClouds * sunIntensityMultiplier);

  return {
    directLux: Number(directLux.toFixed(0)),
    diffuseLux: Number(diffuseLux.toFixed(0)),
  };
}

/** Generates a 24-hour tracking schedule table for a given solar configuration. */
export function generateSolarTrackingTable(
  config: SolarEnvironmentConfig,
  stepMinutes: number = 60,
): SolarTrackingEntry[] {
  const table: SolarTrackingEntry[] = [];
  const totalMinutes = 24 * 60;
  const step = Math.max(1, Math.min(120, stepMinutes));

  for (let min = 0; min <= totalMinutes; min += step) {
    const timeDecimal = min / 60;
    const stepConfig: SolarEnvironmentConfig = {
      ...config,
      timeOfDayHours: timeDecimal,
    };
    const ephemeris = calculateSolarEphemeris(stepConfig);
    table.push({
      timeString: formatHoursToTimeString(timeDecimal).slice(0, 5),
      timeDecimal: Number(timeDecimal.toFixed(2)),
      azimuthDeg: ephemeris.azimuthDeg,
      elevationDeg: ephemeris.elevationDeg,
      colorTempK: ephemeris.colorTemperatureKelvin,
      directLux: ephemeris.directSunIlluminanceLux,
      shadowMultiplier: ephemeris.shadowLengthMultiplier,
      phase: ephemeris.solarPhase,
    });
  }

  return table;
}

/** Generates an RFC 4180 CSV export of the 24-hour solar tracking table. */
export function generateSolarTrackingTableCsv(
  config: SolarEnvironmentConfig,
  stepMinutes: number = 60,
): string {
  const table = generateSolarTrackingTable(config, stepMinutes);
  const locName = config.location.locationName || 'Custom Location';
  const dateStr = `${config.date.year}-${config.date.month.toString().padStart(2, '0')}-${config.date.day.toString().padStart(2, '0')}`;

  const header = [
    '# SetView Natural Environment & Solar Ephemeris Sun-Tracking Report',
    `# Location: ${locName} (Lat: ${config.location.latitude}, Long: ${config.location.longitude}, UTC${config.location.timezoneOffsetHours >= 0 ? '+' : ''}${config.location.timezoneOffsetHours})`,
    `# Date: ${dateStr}`,
    `# True North Heading: ${config.northHeadingDeg} deg`,
    'Time (Local),Time (Dec),Azimuth (Deg),Elevation (Deg),Color Temp (K),Direct Beam (Lux),Shadow Multiplier,Solar Phase',
  ].join('\n');

  const rows = table.map((e) =>
    [
      `"${e.timeString}"`,
      e.timeDecimal.toFixed(2),
      e.azimuthDeg.toFixed(2),
      e.elevationDeg.toFixed(2),
      e.colorTempK.toString(),
      e.directLux.toString(),
      e.shadowMultiplier.toFixed(3),
      `"${e.phase}"`,
    ].join(','),
  );

  return `${header}\n${rows.join('\n')}\n`;
}

/**
 * Generates discrete 3D celestial arc positions for the 24-hour sun trajectory.
 * Useful for drawing the 3D sun path line and hour mark indicators in Three.js.
 */
export function generateSolarPathPoints(
  config: SolarEnvironmentConfig,
  count: number = 96,
): Array<{
  x: number;
  y: number;
  z: number;
  elevationDeg: number;
  azimuthDeg: number;
  hour: number;
}> {
  const points: Array<{
    x: number;
    y: number;
    z: number;
    elevationDeg: number;
    azimuthDeg: number;
    hour: number;
  }> = [];

  const n = Math.max(24, count);
  for (let i = 0; i <= n; i++) {
    const hour = (i / n) * 24;
    const stepConfig = { ...config, timeOfDayHours: hour };
    const eph = calculateSolarEphemeris(stepConfig);
    points.push({
      x: eph.sunDirectionVector.x,
      y: eph.sunDirectionVector.y,
      z: eph.sunDirectionVector.z,
      elevationDeg: eph.elevationDeg,
      azimuthDeg: eph.azimuthDeg,
      hour: Number(hour.toFixed(2)),
    });
  }

  return points;
}

/** Generates a complete standalone HTML Director of Photography Sun-Report. */
export function generateDpSunReportHtml(
  param1: string | SolarEnvironmentConfig,
  param2?: SolarEnvironmentConfig | string,
): string {
  let sceneName = 'SetView Scene';
  let config: SolarEnvironmentConfig;
  if (typeof param1 === 'string') {
    sceneName = param1;
    config = (param2 as SolarEnvironmentConfig) || createSolarEnvironmentConfig();
  } else {
    config = param1;
    sceneName = typeof param2 === 'string' ? param2 : 'SetView Scene';
  }
  const eph = calculateSolarEphemeris(config);
  const table = generateSolarTrackingTable(config, 60);
  const dateStr = `${config.date.year}-${config.date.month.toString().padStart(2, '0')}-${config.date.day.toString().padStart(2, '0')}`;
  const locName = config.location.locationName || 'Custom Location';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SetView DP Sun Report - ${escapeHtml(sceneName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1120; color: #f8fafc; padding: 24px; margin: 0; }
    .header { border-bottom: 2px solid #38bdf8; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    h1 { margin: 0 0 6px 0; font-size: 24px; color: #f8fafc; }
    .subtitle { color: #94a3b8; font-size: 14px; }
    .badge { background: #0284c7; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
    .grid-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .metric-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 14px; }
    .metric-label { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: bold; }
    .metric-val { font-size: 24px; font-weight: bold; color: #38bdf8; margin: 6px 0 2px 0; font-family: monospace; }
    .metric-sub { font-size: 11px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; background: #1e293b; border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid #334155; }
    th { background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 11px; }
    tr:hover { background: rgba(56, 189, 248, 0.05); }
    .phase-badge { padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; text-transform: capitalize; background: #334155; color: #cbd5e1; }
    .phase-daylight { background: #0284c7; color: #fff; }
    .phase-golden_hour { background: #d97706; color: #fff; }
    .phase-civil_twilight { background: #4f46e5; color: #fff; }
    .footer { margin-top: 32px; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>SetView DP Sun & Natural Lighting Report</h1>
      <div class="subtitle">Scene: <strong>${escapeHtml(sceneName)}</strong> | Location: <strong>${escapeHtml(locName)}</strong> | Date: <strong>${dateStr}</strong></div>
    </div>
    <div class="badge">NOAA Ephemeris Solver</div>
  </div>

  <div class="grid-metrics">
    <div class="metric-card">
      <div class="metric-label">Solar Elevation & Azimuth</div>
      <div class="metric-val">${eph.elevationDeg.toFixed(1)}° / ${eph.azimuthDeg.toFixed(1)}°</div>
      <div class="metric-sub">True North Heading: ${config.northHeadingDeg}°</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Color Temperature</div>
      <div class="metric-val">${eph.colorTemperatureKelvin} K</div>
      <div class="metric-sub">Rayleigh & Mie Scattering</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Direct Beam Illuminance</div>
      <div class="metric-val">${eph.directSunIlluminanceLux.toLocaleString()} Lux</div>
      <div class="metric-sub">Diffuse Sky: ${eph.diffuseSkyIlluminanceLux.toLocaleString()} Lux</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Sunrise / Sunset</div>
      <div class="metric-val">${eph.sunriseTime} / ${eph.sunsetTime}</div>
      <div class="metric-sub">Solar Noon: ${eph.solarNoonTime}</div>
    </div>
  </div>

  <div style="display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap;">
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; flex: 0 0 320px; text-align: center;">
      <div style="font-size: 13px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 12px;">Polar Sun Path Chart</div>
      <svg width="280" height="280" viewBox="0 0 300 300" style="overflow: visible;">
        <!-- Concentric Elevation Rings -->
        <circle cx="150" cy="150" r="130" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
        <circle cx="150" cy="150" r="86.6" fill="none" stroke="#334155" stroke-dasharray="3,3" />
        <circle cx="150" cy="150" r="43.3" fill="none" stroke="#334155" stroke-dasharray="3,3" />
        <circle cx="150" cy="150" r="3" fill="#38bdf8" />
        <!-- Axis Crosshairs -->
        <line x1="150" y1="20" x2="150" y2="280" stroke="#334155" stroke-width="1" />
        <line x1="20" y1="150" x2="280" y2="150" stroke="#334155" stroke-width="1" />
        <!-- Compass Labels -->
        <text x="150" y="14" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">N</text>
        <text x="290" y="154" fill="#94a3b8" font-size="12" font-weight="bold" text-anchor="start">E</text>
        <text x="150" y="296" fill="#94a3b8" font-size="12" font-weight="bold" text-anchor="middle">S</text>
        <text x="10" y="154" fill="#94a3b8" font-size="12" font-weight="bold" text-anchor="end">W</text>
        <text x="150" y="98" fill="#64748b" font-size="9" text-anchor="middle">60°</text>
        <text x="150" y="55" fill="#64748b" font-size="9" text-anchor="middle">30°</text>
        <!-- Sun Path Polyline -->
        ${(() => {
          const daylightPts = table
            .filter((t) => t.elevationDeg >= -1)
            .map((t) => {
              const r = Math.max(0, 130 * (1 - Math.max(0, t.elevationDeg) / 90));
              const rad = t.azimuthDeg * (Math.PI / 180);
              const x = (150 + r * Math.sin(rad)).toFixed(1);
              const y = (150 - r * Math.cos(rad)).toFixed(1);
              return `${x},${y}`;
            });
          if (daylightPts.length > 1) {
            return `<polyline points="${daylightPts.join(' ')}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
          }
          return '';
        })()}
        <!-- Current Sun Position Marker -->
        ${(() => {
          if (eph.elevationDeg >= 0) {
            const r = Math.max(0, 130 * (1 - eph.elevationDeg / 90));
            const rad = eph.azimuthDeg * (Math.PI / 180);
            const cx = (150 + r * Math.sin(rad)).toFixed(1);
            const cy = (150 - r * Math.cos(rad)).toFixed(1);
            return `<circle cx="${cx}" cy="${cy}" r="7" fill="#fbbf24" stroke="#ffffff" stroke-width="2" />
                    <circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="#fbbf24" stroke-width="1.5" opacity="0.6" />`;
          }
          return '';
        })()}
      </svg>
    </div>
    <div style="flex: 1; min-width: 280px;">
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; height: 100%; box-sizing: border-box;">
        <div style="font-size: 13px; font-weight: bold; color: #94a3b8; text-transform: uppercase; margin-bottom: 12px;">Lighting Summary & Twilight Windows</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
          <div><strong>Golden Hour (AM):</strong> <span style="color: #f59e0b;">${eph.goldenHourMorning.start} - ${eph.goldenHourMorning.end}</span></div>
          <div><strong>Golden Hour (PM):</strong> <span style="color: #f59e0b;">${eph.goldenHourEvening.start} - ${eph.goldenHourEvening.end}</span></div>
          <div><strong>Blue Hour (AM):</strong> <span style="color: #60a5fa;">${eph.blueHourMorning.start} - ${eph.blueHourMorning.end}</span></div>
          <div><strong>Blue Hour (PM):</strong> <span style="color: #60a5fa;">${eph.blueHourEvening.start} - ${eph.blueHourEvening.end}</span></div>
          <div><strong>Solar Noon:</strong> <span style="color: #38bdf8;">${eph.solarNoonTime}</span></div>
          <div><strong>Current Phase:</strong> <span style="text-transform: capitalize; color: #38bdf8;">${eph.solarPhase.replace('_', ' ')}</span></div>
          <div><strong>Shadow Length:</strong> <span>${eph.shadowLengthMultiplier > 0 ? `${eph.shadowLengthMultiplier.toFixed(2)}x object height` : 'No direct shadow'}</span></div>
          <div><strong>Weather Turbidity:</strong> <span>${config.weather.airTurbidity.toFixed(1)} (Linke Turbidity)</span></div>
        </div>
      </div>
    </div>
  </div>

  <h2>24-Hour Solar Ephemeris & Shadow Trajectory</h2>
  <table>
    <thead>
      <tr>
        <th>Local Time</th>
        <th>Azimuth</th>
        <th>Elevation</th>
        <th>Color Temp (K)</th>
        <th>Direct Beam (Lux)</th>
        <th>Shadow Multiplier</th>
        <th>Phase</th>
      </tr>
    </thead>
    <tbody>
      ${table
        .map(
          (r) => `
        <tr>
          <td style="font-family: monospace; font-weight: bold;">${r.timeString}</td>
          <td>${r.azimuthDeg.toFixed(1)}°</td>
          <td>${r.elevationDeg.toFixed(1)}°</td>
          <td style="color: #f59e0b; font-weight: 600;">${r.colorTempK} K</td>
          <td>${r.directLux.toLocaleString()} lx</td>
          <td>${r.shadowMultiplier > 0 ? `${r.shadowMultiplier.toFixed(2)}x` : '-'}</td>
          <td><span class="phase-badge phase-${r.phase}">${r.phase.replace('_', ' ')}</span></td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated by SetView Physical Solar Ephemeris & Cinematography Suite on ${new Date().toISOString()}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Factories, Type Guards & Normalizers -----------------------------------

/** Creates a default SolarEnvironmentConfig object. */
export function createSolarEnvironmentConfig(
  presetId?: string,
  locationKey: string = 'los_angeles',
  overrides?: Partial<SolarEnvironmentConfig>,
): SolarEnvironmentConfig {
  const loc = CURATED_FILMING_LOCATIONS[locationKey]?.location || CURATED_FILMING_LOCATIONS.los_angeles.location;
  const now = new Date();
  const date: SolarDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };

  const preset = presetId && SOLAR_PRESETS[presetId] ? SOLAR_PRESETS[presetId] : SOLAR_PRESETS.golden_hour_sunset;

  const base: SolarEnvironmentConfig = {
    enabled: true,
    presetId: preset.id,
    location: { ...loc },
    date,
    timeOfDayHours: preset.timeOfDayHours,
    timePlaybackSpeed: 0,
    northHeadingDeg: preset.northHeadingDeg,
    weather: { ...preset.weather },
    skyTurbidity: preset.skyTurbidity,
    groundAlbedo: preset.groundAlbedo,
    castShadows: true,
    sunIntensityMultiplier: preset.sunIntensityMultiplier,
  };

  if (overrides) {
    if (overrides.location) base.location = { ...base.location, ...overrides.location };
    if (overrides.date) base.date = { ...base.date, ...overrides.date };
    if (overrides.weather) base.weather = { ...base.weather, ...overrides.weather };
    Object.assign(base, overrides);
  }

  return base;
}

/** Type guard verifying if an object conforms to SolarEnvironmentConfig. */
export function isSolarEnvironmentConfig(obj: unknown): obj is SolarEnvironmentConfig {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Partial<SolarEnvironmentConfig>;

  return (
    typeof c.enabled === 'boolean' &&
    typeof c.timeOfDayHours === 'number' &&
    typeof c.northHeadingDeg === 'number' &&
    c.location !== null &&
    typeof c.location === 'object' &&
    typeof c.location.latitude === 'number' &&
    typeof c.location.longitude === 'number' &&
    typeof c.location.timezoneOffsetHours === 'number' &&
    c.date !== null &&
    typeof c.date === 'object' &&
    typeof c.date.year === 'number' &&
    typeof c.date.month === 'number' &&
    typeof c.date.day === 'number' &&
    c.weather !== null &&
    typeof c.weather === 'object' &&
    typeof c.weather.cloudCoveragePercent === 'number'
  );
}

/** Normalizes and sanitizes a SolarEnvironmentConfig object, fixing invalid numbers and clamping ranges. */
export function normalizeSolarEnvironmentConfig(
  config?: Partial<SolarEnvironmentConfig>,
): SolarEnvironmentConfig {
  const fallback = createSolarEnvironmentConfig();
  if (!config || typeof config !== 'object') return fallback;

  const lat =
    typeof config.location?.latitude === 'number' && isFinite(config.location.latitude)
      ? Math.max(-90, Math.min(90, config.location.latitude))
      : fallback.location.latitude;

  const lon =
    typeof config.location?.longitude === 'number' && isFinite(config.location.longitude)
      ? Math.max(-180, Math.min(180, config.location.longitude))
      : fallback.location.longitude;

  const tz =
    typeof config.location?.timezoneOffsetHours === 'number' && isFinite(config.location.timezoneOffsetHours)
      ? Math.max(-12, Math.min(14, config.location.timezoneOffsetHours))
      : fallback.location.timezoneOffsetHours;

  const elevM =
    typeof config.location?.elevationM === 'number' && isFinite(config.location.elevationM)
      ? Math.max(0, config.location.elevationM)
      : fallback.location.elevationM;

  const locName =
    typeof config.location?.locationName === 'string'
      ? config.location.locationName
      : fallback.location.locationName;

  const year =
    typeof config.date?.year === 'number' && isFinite(config.date.year)
      ? Math.max(1900, Math.min(2100, Math.round(config.date.year)))
      : fallback.date.year;

  const month =
    typeof config.date?.month === 'number' && isFinite(config.date.month)
      ? Math.max(1, Math.min(12, Math.round(config.date.month)))
      : fallback.date.month;

  const day =
    typeof config.date?.day === 'number' && isFinite(config.date.day)
      ? Math.max(1, Math.min(31, Math.round(config.date.day)))
      : fallback.date.day;

  const timeOfDay =
    typeof config.timeOfDayHours === 'number' && isFinite(config.timeOfDayHours)
      ? Math.max(0, Math.min(24, config.timeOfDayHours))
      : fallback.timeOfDayHours;

  const playbackSpeed =
    typeof config.timePlaybackSpeed === 'number' && isFinite(config.timePlaybackSpeed)
      ? config.timePlaybackSpeed
      : 0;

  const northHeading =
    typeof config.northHeadingDeg === 'number' && isFinite(config.northHeadingDeg)
      ? normalizeAngle360(config.northHeadingDeg)
      : fallback.northHeadingDeg;

  const clouds =
    typeof config.weather?.cloudCoveragePercent === 'number' && isFinite(config.weather.cloudCoveragePercent)
      ? Math.max(0, Math.min(100, config.weather.cloudCoveragePercent))
      : fallback.weather.cloudCoveragePercent;

  const cloudDensity =
    typeof config.weather?.cloudDensity === 'number' && isFinite(config.weather.cloudDensity)
      ? Math.max(0, Math.min(1, config.weather.cloudDensity))
      : fallback.weather.cloudDensity;

  const fog =
    typeof config.weather?.fogDensityPercent === 'number' && isFinite(config.weather.fogDensityPercent)
      ? Math.max(0, Math.min(100, config.weather.fogDensityPercent))
      : fallback.weather.fogDensityPercent;

  const rain =
    typeof config.weather?.rainIntensityPercent === 'number' && isFinite(config.weather.rainIntensityPercent)
      ? Math.max(0, Math.min(100, config.weather.rainIntensityPercent))
      : fallback.weather.rainIntensityPercent;

  const windSpeed =
    typeof config.weather?.windSpeedMps === 'number' && isFinite(config.weather.windSpeedMps)
      ? Math.max(0, config.weather.windSpeedMps)
      : fallback.weather.windSpeedMps;

  const windHeading =
    typeof config.weather?.windHeadingDeg === 'number' && isFinite(config.weather.windHeadingDeg)
      ? normalizeAngle360(config.weather.windHeadingDeg)
      : fallback.weather.windHeadingDeg;

  const turbidity =
    typeof config.skyTurbidity === 'number' && isFinite(config.skyTurbidity)
      ? Math.max(2.0, Math.min(10.0, config.skyTurbidity))
      : fallback.skyTurbidity;

  const groundAlbedo =
    typeof config.groundAlbedo === 'number' && isFinite(config.groundAlbedo)
      ? Math.max(0.05, Math.min(0.8, config.groundAlbedo))
      : fallback.groundAlbedo;

  const sunMultiplier =
    typeof config.sunIntensityMultiplier === 'number' && isFinite(config.sunIntensityMultiplier)
      ? Math.max(0, Math.min(10, config.sunIntensityMultiplier))
      : fallback.sunIntensityMultiplier;

  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
    presetId: typeof config.presetId === 'string' ? config.presetId : undefined,
    location: {
      latitude: lat,
      longitude: lon,
      elevationM: elevM,
      timezoneOffsetHours: tz,
      locationName: locName,
    },
    date: {
      year,
      month,
      day,
    },
    timeOfDayHours: timeOfDay,
    timePlaybackSpeed: playbackSpeed,
    northHeadingDeg: northHeading,
    weather: {
      cloudCoveragePercent: clouds,
      cloudDensity,
      fogDensityPercent: fog,
      rainIntensityPercent: rain,
      windSpeedMps: windSpeed,
      windHeadingDeg: windHeading,
      airTurbidity: turbidity,
    },
    skyTurbidity: turbidity,
    groundAlbedo,
    castShadows: typeof config.castShadows === 'boolean' ? config.castShadows : true,
    sunIntensityMultiplier: sunMultiplier,
  };
}
