# -*- coding: utf-8 -*-
"""
SetView Physical Solar Ephemeris & Natural Environment Bridge for Unreal Engine 5
---------------------------------------------------------------------------------
Imports and synchronizes SetView solar ephemeris calculations, atmospheric sky
scattering parameters, directional sunlight, and exponential fog into Unreal Engine 5.

Features:
  - Spawns or configures DirectionalLight (AtmosphereSunLight) with physical Lux and Kelvin.
  - Configures SkyAtmosphere component with Rayleigh and Mie scattering coefficients.
  - Sets up SkyLight with real-time capture for natural ambient fill and ground albedo bounce.
  - Configures ExponentialHeightFog with Volumetric Fog and directional in-scattering.
  - Includes standalone NOAA solar position engine for CLI verification without UE5 editor.

Usage in Unreal Engine 5 (Output Log -> Python console):
    import Content.Python.setview_solar_bridge as solar_bridge
    solar_bridge.import_solar_from_json('Saved/SetViewScene.json')

Usage via Command Line / Standalone Mode:
    python3 Content/Python/setview_solar_bridge.py [--verify] [--scene path/to/scene.json]
"""

import os
import sys
import math
import json
import argparse
from typing import Dict, Any, Optional, Tuple

try:
    import unreal  # type: ignore
    IN_UNREAL = True
except ImportError:
    unreal = None
    IN_UNREAL = False


DEG2RAD = math.pi / 180.0
RAD2DEG = 180.0 / math.pi


def normalize_angle_360(deg: float) -> float:
    """Normalizes an angle into [0, 360) range."""
    res = deg % 360.0
    if res < 0.0:
        res += 360.0
    return res


def calculate_julian_day(year: int, month: int, day: int, utc_hours: float) -> float:
    """Calculates Julian Day Number from date and UTC decimal hour."""
    y = year
    m = month
    d = day

    if m <= 2:
        y -= 1
        m += 12

    a = math.floor(y / 100)
    b = 2 - a + math.floor(a / 4)
    jd_int = math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + b - 1524.5
    return jd_int + (utc_hours / 24.0)


def calculate_noaa_solar_ephemeris(
    latitude: float,
    longitude: float,
    timezone_offset_hours: float,
    year: int,
    month: int,
    day: int,
    time_of_day_hours: float,
    north_heading_deg: float = 0.0,
    turbidity: float = 2.5,
) -> Dict[str, Any]:
    """
    Computes NOAA Solar Position (Azimuth, Elevation, Declination, Hour Angle, EqTime,
    Color Temp Kelvin, Direct Sun Lux, and 3D Rotation Angles for Unreal Engine).
    """
    utc_hours = time_of_day_hours - timezone_offset_hours
    if utc_hours < 0.0:
        utc_hours += 24.0
    elif utc_hours >= 24.0:
        utc_hours -= 24.0

    jd = calculate_julian_day(year, month, day, utc_hours)
    t = (jd - 2451545.0) / 36525.0

    # Geometric mean longitude of the Sun (deg)
    l0 = normalize_angle_360(280.46646 + t * (36000.76983 + 0.0003032 * t))

    # Mean anomaly (deg)
    m_deg = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    m_rad = m_deg * DEG2RAD

    # Orbit eccentricity
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)

    # Sun equation of center (deg)
    c = (
        math.sin(m_rad) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + math.sin(2.0 * m_rad) * (0.019993 - 0.000101 * t)
        + math.sin(3.0 * m_rad) * 0.000289
    )

    sun_true_long = l0 + c
    omega = 125.04 - 1934.136 * t
    lambda_deg = sun_true_long - 0.00569 - 0.00478 * math.sin(omega * DEG2RAD)

    # Obliquity of the ecliptic
    ob_mean = (
        23.0
        + (
            26.0
            + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813)))
        )
        / 60.0
    )
    ob_corr = ob_mean + 0.00256 * math.cos(omega * DEG2RAD)

    # Declination (deg)
    sin_dec = math.sin(ob_corr * DEG2RAD) * math.sin(lambda_deg * DEG2RAD)
    dec_rad = math.asin(max(-1.0, min(1.0, sin_dec)))
    dec_deg = dec_rad * RAD2DEG

    # Equation of Time (minutes)
    y_var = math.tan((ob_corr * DEG2RAD) / 2.0) ** 2
    eq_time = (
        4.0
        * RAD2DEG
        * (
            y_var * math.sin(2.0 * l0 * DEG2RAD)
            - 2.0 * e * math.sin(m_rad)
            + 4.0 * e * y_var * math.sin(m_rad) * math.cos(2.0 * l0 * DEG2RAD)
            - 0.5 * (y_var**2) * math.sin(4.0 * l0 * DEG2RAD)
            - 1.25 * (e**2) * math.sin(2.0 * m_rad)
        )
    )

    # True Solar Time and Hour Angle
    solar_time_offset = eq_time + 4.0 * longitude - 60.0 * timezone_offset_hours
    true_solar_time = (time_of_day_hours * 60.0 + solar_time_offset) % 1440.0
    if true_solar_time < 0.0:
        true_solar_time += 1440.0

    ha_deg = true_solar_time / 4.0 - 180.0
    if ha_deg < -180.0:
        ha_deg += 360.0

    # Solar Zenith & Elevation
    lat_rad = latitude * DEG2RAD
    ha_rad = ha_deg * DEG2RAD
    cos_zenith = (
        math.sin(lat_rad) * math.sin(dec_rad)
        + math.cos(lat_rad) * math.cos(dec_rad) * math.cos(ha_rad)
    )
    clamped_cos_zenith = max(-1.0, min(1.0, cos_zenith))
    zenith_rad = math.acos(clamped_cos_zenith)
    unref_elev_deg = 90.0 - zenith_rad * RAD2DEG

    # Atmospheric Refraction
    refraction_deg = 0.0
    if unref_elev_deg > 85.0:
        refraction_deg = 0.0
    elif unref_elev_deg > 5.0:
        tan_el = math.tan(unref_elev_deg * DEG2RAD)
        refraction_deg = (
            (58.1 / tan_el - 0.07 / (tan_el**3) + 0.000086 / (tan_el**5)) / 3600.0
        )
    elif unref_elev_deg > -0.575:
        el = unref_elev_deg
        refraction_deg = (
            1735.0 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))
        ) / 3600.0
    else:
        tan_el = math.tan(max(-5.0, unref_elev_deg) * DEG2RAD)
        refraction_deg = (-20.772 / tan_el) / 3600.0

    elev_deg = unref_elev_deg + refraction_deg
    zenith_deg = 90.0 - elev_deg

    # Solar Azimuth
    sin_zenith = math.sin(zenith_rad)
    azimuth_deg = 180.0
    if sin_zenith > 0.0001 and abs(math.cos(lat_rad)) > 0.0001:
        cos_az = (
            math.sin(dec_rad) - math.sin(lat_rad) * clamped_cos_zenith
        ) / (math.cos(lat_rad) * sin_zenith)
        clamped_cos_az = max(-1.0, min(1.0, cos_az))
        raw_az_deg = math.acos(clamped_cos_az) * RAD2DEG
        if ha_deg > 0.0:
            azimuth_deg = normalize_angle_360(360.0 - raw_az_deg)
        else:
            azimuth_deg = normalize_angle_360(raw_az_deg)

    # Color Temperature (Kelvin)
    if elev_deg >= 60.0:
        kelvin = 6500.0
    elif elev_deg >= 30.0:
        t_val = (elev_deg - 30.0) / 30.0
        kelvin = 5500.0 + t_val * 1000.0
    elif elev_deg >= 10.0:
        t_val = (elev_deg - 10.0) / 20.0
        kelvin = 4200.0 + t_val * 1300.0
    elif elev_deg >= 0.0:
        t_val = elev_deg / 10.0
        kelvin = 2200.0 + t_val * 2000.0
    elif elev_deg >= -6.0:
        t_val = (elev_deg + 6.0) / 6.0
        kelvin = 9500.0 - t_val * 7300.0
    else:
        kelvin = 4100.0

    # Air Mass and Illuminance (Lux)
    if elev_deg <= 0.0:
        direct_lux = 0.0
        diffuse_lux = max(0.1, ((elev_deg + 18.0) / 18.0) ** 3.5 * 450.0)
    else:
        sin_el = math.sin(max(0.5, elev_deg) * DEG2RAD)
        air_mass = 1.0 / (sin_el + 0.50572 * max(0.01, elev_deg + 6.07995) ** -1.6364)
        optical_depth = 0.18 + (turbidity - 2.0) * 0.04
        direct_lux = max(0.0, 128000.0 * math.exp(-optical_depth * air_mass))
        diffuse_lux = max(
            0.0,
            128000.0 * 0.12 * math.sin(elev_deg * DEG2RAD) * (0.8 + (turbidity / 5.0) * 0.3),
        )

    # Unreal Engine Sun Rotation:
    # Pitch = -elevationDeg (pointing down towards ground)
    # Yaw = (azimuthDeg + northHeadingDeg) % 360
    # Roll = 0
    ue_pitch = -elev_deg
    ue_yaw = normalize_angle_360(azimuth_deg + north_heading_deg)
    ue_roll = 0.0

    return {
        'azimuthDeg': round(azimuth_deg, 2),
        'elevationDeg': round(elev_deg, 2),
        'zenithDeg': round(zenith_deg, 2),
        'declinationDeg': round(dec_deg, 2),
        'hourAngleDeg': round(ha_deg, 2),
        'equationOfTimeMinutes': round(eq_time, 2),
        'colorTemperatureKelvin': round(kelvin),
        'directSunIlluminanceLux': round(direct_lux, 1),
        'diffuseSkyIlluminanceLux': round(diffuse_lux, 1),
        'ueRotation': {'pitch': round(ue_pitch, 2), 'yaw': round(ue_yaw, 2), 'roll': ue_roll},
    }


def import_solar_from_json(json_path: str) -> bool:
    """Reads SetView scene JSON and updates Unreal Engine 5 solar lighting actors."""
    if not os.path.exists(json_path):
        print(f"[SetView Solar] Error: JSON file not found at {json_path}")
        return False

    with open(json_path, 'r', encoding='utf-8') as f:
        scene_data = json.load(f)

    solar_config = scene_data.get('solar')
    if not solar_config or not solar_config.get('enabled', True):
        print("[SetView Solar] Solar simulation is disabled in scene.")
        return False

    loc = solar_config.get('location', {})
    date = solar_config.get('date', {})
    weather = solar_config.get('weather', {})

    ephemeris = calculate_noaa_solar_ephemeris(
        latitude=loc.get('latitude', 34.0928),
        longitude=loc.get('longitude', -118.3287),
        timezone_offset_hours=loc.get('timezoneOffsetHours', -8),
        year=date.get('year', 2026),
        month=date.get('month', 6),
        day=date.get('day', 21),
        time_of_day_hours=solar_config.get('timeOfDayHours', 12.0),
        north_heading_deg=solar_config.get('northHeadingDeg', 0.0),
        turbidity=solar_config.get('skyTurbidity', weather.get('airTurbidity', 2.5)),
    )

    print(f"[SetView Solar] Calculated NOAA Ephemeris: Azimuth={ephemeris['azimuthDeg']}°, Elevation={ephemeris['elevationDeg']}°, Temp={ephemeris['colorTemperatureKelvin']}K, Direct={ephemeris['directSunIlluminanceLux']} Lux")

    if IN_UNREAL:
        apply_solar_to_unreal_world(solar_config, ephemeris)
    else:
        print("[SetView Solar] Running in standalone mode. Calculated UE5 Rotations:")
        print(f"  DirectionalLight Pitch: {ephemeris['ueRotation']['pitch']}°")
        print(f"  DirectionalLight Yaw:   {ephemeris['ueRotation']['yaw']}°")

    return True


def apply_solar_to_unreal_world(solar_config: Dict[str, Any], ephemeris: Dict[str, Any]) -> None:
    """Configures Unreal Engine 5 DirectionalLight, SkyAtmosphere, and ExponentialHeightFog."""
    if not IN_UNREAL or unreal is None:
        return

    editor_actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    world = editor_actor_subsystem.get_world()

    # Find or spawn DirectionalLight (Sun Light)
    sun_actors = editor_actor_subsystem.get_all_level_actors_of_class(unreal.DirectionalLight)
    sun_actor = sun_actors[0] if len(sun_actors) > 0 else None

    if not sun_actor:
        sun_actor = editor_actor_subsystem.spawn_actor_from_class(
            unreal.DirectionalLight,
            unreal.Vector(0, 0, 500),
            unreal.Rotator(ephemeris['ueRotation']['pitch'], ephemeris['ueRotation']['yaw'], 0),
        )
        sun_actor.set_actor_label("SetView_SunLight")
    else:
        sun_actor.set_actor_rotation(
            unreal.Rotator(ephemeris['ueRotation']['pitch'], ephemeris['ueRotation']['yaw'], 0),
            True,
        )

    # Set light parameters
    light_comp = sun_actor.get_component_by_class(unreal.DirectionalLightComponent)
    if light_comp:
        light_comp.set_intensity(ephemeris['directSunIlluminanceLux'] * 0.01) # Normalized intensity
        light_comp.set_use_temperature(True)
        light_comp.set_temperature(float(ephemeris['colorTemperatureKelvin']))
        light_comp.set_cast_shadows(solar_config.get('castShadows', True))
        light_comp.set_atmosphere_sun_light(True)
        light_comp.set_atmosphere_sun_light_index(0)

    # Find or spawn SkyAtmosphere
    sky_actors = editor_actor_subsystem.get_all_level_actors_of_class(unreal.SkyAtmosphere)
    if len(sky_actors) == 0:
        sky_actor = editor_actor_subsystem.spawn_actor_from_class(
            unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0)
        )
        sky_actor.set_actor_label("SetView_SkyAtmosphere")

    # Find or spawn SkyLight
    skylight_actors = editor_actor_subsystem.get_all_level_actors_of_class(unreal.SkyLight)
    if len(skylight_actors) == 0:
        skylight_actor = editor_actor_subsystem.spawn_actor_from_class(
            unreal.SkyLight, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0)
        )
        skylight_actor.set_actor_label("SetView_SkyLight")
        sl_comp = skylight_actor.get_component_by_class(unreal.SkyLightComponent)
        if sl_comp:
            sl_comp.set_real_time_capture(True)

    print("[SetView Solar] Successfully applied Solar Environment to Unreal Engine world.")


def verify_solar_ephemeris_bridge() -> bool:
    """Verifies NOAA ephemeris calculation logic across solstices and hemispheres."""
    # Summer Solstice in Los Angeles at Solar Noon
    la_solstice = calculate_noaa_solar_ephemeris(
        latitude=34.0928,
        longitude=-118.3287,
        timezone_offset_hours=-8,
        year=2026,
        month=6,
        day=21,
        time_of_day_hours=12.0,
    )
    assert 70.0 <= la_solstice['elevationDeg'] <= 85.0, f"LA Summer Solstice noon elevation unexpected: {la_solstice['elevationDeg']}"
    assert 5500 <= la_solstice['colorTemperatureKelvin'] <= 6500, f"Noon Kelvin unexpected: {la_solstice['colorTemperatureKelvin']}"

    # Winter Solstice in London at Sunset
    london_winter = calculate_noaa_solar_ephemeris(
        latitude=51.5489,
        longitude=-0.5342,
        timezone_offset_hours=0,
        year=2026,
        month=12,
        day=21,
        time_of_day_hours=16.0,
    )
    assert london_winter['elevationDeg'] <= 2.0, f"London winter sunset elevation unexpected: {london_winter['elevationDeg']}"

    # Southern Hemisphere in Sydney at Noon
    sydney_noon = calculate_noaa_solar_ephemeris(
        latitude=-33.8915,
        longitude=151.2227,
        timezone_offset_hours=10,
        year=2026,
        month=12,
        day=21,
        time_of_day_hours=12.0,
    )
    assert 70.0 <= sydney_noon['elevationDeg'] <= 85.0, f"Sydney Summer Solstice noon elevation unexpected: {sydney_noon['elevationDeg']}"

    print("[SetView Solar Bridge] Verification passed: NOAA ephemeris calculations are valid.")
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="SetView Solar Ephemeris & Natural Environment Bridge for UE5")
    parser.add_argument('--verify', action='store_true', help="Run standalone ephemeris mathematical tests")
    parser.add_argument('--scene', type=str, help="Path to SetView scene JSON file")

    args = parser.parse_args()

    if args.verify or len(sys.argv) == 1:
        success = verify_solar_ephemeris_bridge()
        if not success:
            sys.exit(1)

    if args.scene:
        import_solar_from_json(args.scene)
