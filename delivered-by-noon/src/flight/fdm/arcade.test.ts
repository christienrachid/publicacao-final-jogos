// Arcade acceptance tests over the JSBSim-derived FGPropagate model; LGPL-2.1, JSBSim-Team.
import { expect, it } from 'vitest';
import { Vec3 } from 'playcanvas';
import { ARCADE_TUNING, FIXED_STEP, FlightDynamics, type FlightControls } from './model';
import { MouseInstructor } from './instructor';

const measurements: Record<string, number> = {};
const neutral: FlightControls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 };
const degrees = 180 / Math.PI;
function flying(speed = 110, arcade = 1): FlightDynamics {
  const fdm = new FlightDynamics(arcade);
  fdm.reset(0, 1000, 0, 0, speed, 0.6);
  return fdm;
}

it('completes a held aileron roll in two seconds or less', () => {
  for (const sign of [-1, 1]) {
    const fdm = flying();
    let angle = 0, time = 0, inverted = false;
    while (time < 2 && angle < 2 * Math.PI) {
      fdm.step({ ...neutral, roll: sign });
      angle += fdm.rates.x * sign * FIXED_STEP;
      time += FIXED_STEP;
      inverted ||= fdm.rotation.transformVector(Vec3.UP).y < -0.9;
    }
    expect(angle).toBeGreaterThanOrEqual(2 * Math.PI);
    expect(inverted).toBe(true);
    expect(fdm.rotation.transformVector(Vec3.UP).y).toBeGreaterThan(0.9);
    measurements.rollSeconds = time;
  }
});

it('loops from 110 m/s within six seconds, losing at most 25 percent speed without stalling', () => {
  const fdm = flying();
  const forward = fdm.rotation.transformVector(Vec3.FORWARD);
  let previous = Math.atan2(forward.y, -forward.z), angle = 0, time = 0, minSpeed = 110;
  while (time < 6 && angle < 2 * Math.PI) {
    fdm.step({ ...neutral, pitch: 1 });
    fdm.rotation.transformVector(Vec3.FORWARD, forward);
    const next = Math.atan2(forward.y, -forward.z);
    angle += Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
    previous = next;
    minSpeed = Math.min(minSpeed, fdm.speed);
    time += FIXED_STEP;
    expect(fdm.stalled).toBe(false);
  }
  expect(angle).toBeGreaterThanOrEqual(2 * Math.PI);
  expect(minSpeed).toBeGreaterThanOrEqual(110 * 0.75);
  measurements.loopSeconds = time;
  measurements.loopSpeedLossPercent = (1 - minSpeed / 110) * 100;
});

it('turns 180 degrees by banking and pulling in four seconds or less', () => {
  const fdm = flying();
  let time = 0;
  while (time < 1) {
    fdm.step({ ...neutral, roll: 1 });
    time += FIXED_STEP;
    const right = fdm.rotation.transformVector(Vec3.RIGHT), up = fdm.rotation.transformVector(Vec3.UP);
    if (Math.atan2(-right.y, up.y) >= Math.PI / 2) break;
  }
  let heading = 0, last = 0;
  while (time < 4 && heading < Math.PI) {
    fdm.step({ ...neutral, pitch: 1 });
    const forward = fdm.rotation.transformVector(Vec3.FORWARD);
    const next = Math.atan2(forward.x, -forward.z);
    heading += Math.atan2(Math.sin(next - last), Math.cos(next - last));
    last = next;
    time += FIXED_STEP;
  }
  expect(heading).toBeGreaterThanOrEqual(Math.PI);
  measurements.halfTurnSeconds = time;
});

it('aligns the nose with a 90 degree mouse aim within 1.5 seconds, overshooting at most five degrees', () => {
  const fdm = flying(70), instructor = new MouseInstructor();
  instructor.reset(0);
  const input = { ...neutral };
  let alignment = Infinity, overshoot = 0, crossings = 0, previousSide = 1;
  for (let i = 0; i < 6 / FIXED_STEP; i++) {
    instructor.steer(fdm, 1, 0, 0, input);
    fdm.step(input);
    const forward = fdm.rotation.transformVector(Vec3.FORWARD);
    const error = Math.acos(Math.max(-1, Math.min(1, forward.x))) * degrees;
    const heading = Math.atan2(forward.x, -forward.z) * degrees;
    if (error < 5 && alignment === Infinity) alignment = (i + 1) * FIXED_STEP;
    overshoot = Math.max(overshoot, heading - 90);
    const signed = 90 - heading;
    const side = signed > 0.5 ? 1 : signed < -0.5 ? -1 : 0;
    if (side && side !== previousSide) crossings++;
    if (side) previousSide = side;
    if (i > 2 / FIXED_STEP) expect(Math.abs(90 - heading)).toBeLessThan(5);
  }
  expect(alignment).toBeLessThanOrEqual(1.5);
  expect(overshoot).toBeLessThanOrEqual(5);
  expect(crossings).toBeLessThanOrEqual(1);
  measurements.mouseSeconds = alignment;
  measurements.mouseOvershootDegrees = overshoot;
});

it('holds a stationary horizon aim to less than one metre drift for 30 seconds', () => {
  const fdm = flying(70), instructor = new MouseInstructor(), input = { ...neutral };
  instructor.reset(0);
  let drift = 0;
  for (let i = 0; i < 30 / FIXED_STEP; i++) {
    instructor.steer(fdm, 0, 0, -1, input);
    fdm.step(input);
    drift = Math.max(drift, Math.abs(fdm.position.y - 1000));
  }
  expect(drift).toBeLessThan(1);
  measurements.horizonDriftMetres = drift;
});

it('keeps uncommanded flight straight and stable for 30 seconds', () => {
  const fdm = flying(70);
  for (let i = 0; i < 30 / FIXED_STEP; i++) fdm.step(neutral);
  expect(Math.abs(fdm.position.x)).toBeLessThan(0.01);
  expect(Math.abs(fdm.position.y - 1000)).toBeLessThan(10);
  expect(fdm.rates.length()).toBeLessThan(0.001);
  measurements.neutralDriftMetres = Math.abs(fdm.position.y - 1000);
});

it('accelerates vigorously, limits speed near 160 m/s and recovers automatically from a stall', () => {
  const fdm = flying(70);
  for (let i = 0; i < 5 / FIXED_STEP; i++) fdm.step({ ...neutral, throttle: 1 });
  const gain = fdm.speed - 70;
  expect(gain).toBeGreaterThan(40);
  for (let i = 0; i < 25 / FIXED_STEP; i++) fdm.step({ ...neutral, throttle: 1 });
  expect(fdm.speed).toBeGreaterThan(155);
  expect(fdm.speed).toBeLessThanOrEqual(160.01);
  measurements.speedGainInFiveSeconds = gain;
  measurements.maximumSpeed = fdm.speed;
  const stalled = flying(20);
  expect(stalled.stalled).toBe(true);
  let recovery = 0;
  while (recovery < 2 && (stalled.stalled || stalled.speed < 30)) {
    stalled.step(neutral);
    recovery += FIXED_STEP;
  }
  expect(stalled.stalled).toBe(false);
  expect(stalled.speed).toBeGreaterThan(30);
  expect(recovery).toBeLessThan(2);
  measurements.stallRecoverySeconds = recovery;
});

it('reaches commanded rates within 0.15 seconds and stops within 0.2 seconds', () => {
  const fdm = flying();
  let response = 0;
  while (response < 0.15 && fdm.rates.x < ARCADE_TUNING.rollRate * 0.95) {
    fdm.step({ ...neutral, roll: 1 });
    response += FIXED_STEP;
  }
  expect(fdm.rates.x).toBeGreaterThanOrEqual(ARCADE_TUNING.rollRate * 0.95);
  let stop = 0;
  while (stop < 0.2 && fdm.rates.x > ARCADE_TUNING.rollRate * 0.05) {
    fdm.step(neutral);
    stop += FIXED_STEP;
  }
  expect(fdm.rates.x).toBeLessThanOrEqual(ARCADE_TUNING.rollRate * 0.05);
  measurements.rateResponseSeconds = response;
  measurements.rotationStopSeconds = stop;
});

it('mixes pure aerodynamic moments and commanded rates without giving the physical mode zero-flow authority', () => {
  const physical = flying(70, 0), mixed = flying(70, 0.5), arcade = flying(70, 1);
  for (const fdm of [physical, mixed, arcade]) {
    fdm.velocity.set(0, 0, 0);
    fdm.step({ ...neutral, roll: 1 });
  }
  expect(physical.rates.x).toBeLessThan(mixed.rates.x);
  expect(mixed.rates.x).toBeLessThan(arcade.rates.x);
  expect(physical.rates.x).toBeLessThan(arcade.rates.x * 0.001);
  expect(() => new FlightDynamics(2)).toThrow(RangeError);
  console.log('ARCADE measurements:', JSON.stringify(measurements));
});
