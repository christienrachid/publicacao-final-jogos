// Port of JSBSim models/atmosphere/FGStandardAtmosphere.cpp; LGPL-2.1, JSBSim-Team.
const HEIGHTS = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
const LAPSE = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002];
const GAS_CONSTANT = 287.05287;
const GRAVITY = 9.80665;

export interface Atmosphere {
  temperature: number;
  pressure: number;
  density: number;
  soundSpeed: number;
}

export function standardAtmosphere(altitude: number, out: Atmosphere = {
  temperature: 0, pressure: 0, density: 0, soundSpeed: 0,
}): Atmosphere {
  if (!Number.isFinite(altitude)) throw new RangeError('Non-finite altitude');
  const geometric = Math.max(-500, Math.min(86000, altitude));
  const height = 6356766 * geometric / (6356766 + geometric);
  let temperature = 288.15;
  let pressure = 101325;
  for (let i = 0; i < LAPSE.length; i++) {
    const dh = Math.min(height, HEIGHTS[i + 1]) - HEIGHTS[i];
    const next = temperature + LAPSE[i] * dh;
    pressure *= LAPSE[i] === 0
      ? Math.exp(-GRAVITY * dh / (GAS_CONSTANT * temperature))
      : Math.pow(temperature / next, GRAVITY / (GAS_CONSTANT * LAPSE[i]));
    temperature = next;
    if (height <= HEIGHTS[i + 1]) break;
  }
  out.temperature = temperature;
  out.pressure = pressure;
  out.density = pressure / (GAS_CONSTANT * temperature);
  out.soundSpeed = Math.sqrt(1.4 * GAS_CONSTANT * temperature);
  return out;
}
