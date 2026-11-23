// Guidance tests using the JSBSim FGPropagate-derived FDM; LGPL-2.1, JSBSim-Team.
import { expect, it } from 'vitest';
import { Quat, Vec3 } from 'playcanvas';
import { FIXED_STEP, FlightDynamics, type FlightControls } from './model';
import { MouseInstructor } from './instructor';

function pilot() {
  const fdm = new FlightDynamics();
  fdm.reset(0, 500, 0, 0, 70, 0.6);
  const instructor = new MouseInstructor();
  instructor.reset(0);
  const controls: FlightControls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 };
  return { fdm, instructor, controls };
}

function error(fdm: FlightDynamics, aim: Vec3): number {
  const nose = fdm.rotation.transformVector(Vec3.FORWARD);
  const heading = Math.atan2(nose.x, -nose.z);
  const pitch = Math.atan2(fdm.worldVelocity.y, Math.hypot(fdm.worldVelocity.x, fdm.worldVelocity.z));
  const direction = new Vec3(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), -Math.cos(heading) * Math.cos(pitch));
  return Math.acos(Math.max(-1, Math.min(1, direction.dot(aim)))) * 180 / Math.PI;
}

it('holds level flight with a stationary horizon aim instead of steadily climbing', () => {
  const { fdm, instructor, controls } = pilot();
  controls.throttle = 0.6;
  for (let i = 0; i < 30 / FIXED_STEP; i++) {
    instructor.steer(fdm, 0, 0, -1, controls);
    fdm.step(controls);
  }
  expect(Math.abs(fdm.position.y - 500)).toBeLessThan(10);
  expect(Math.abs(fdm.worldVelocity.y)).toBeLessThan(0.5);
});

it('climbs gently when the aim is only two degrees above the horizon', () => {
  const { fdm, instructor, controls } = pilot();
  controls.throttle = 0.6;
  const pitch = 2 * Math.PI / 180;
  for (let i = 0; i < 10 / FIXED_STEP; i++) {
    instructor.steer(fdm, 0, Math.sin(pitch), -Math.cos(pitch), controls);
    fdm.step(controls);
  }
  expect(fdm.position.y).toBeGreaterThan(505);
  expect(fdm.position.y).toBeLessThan(530);
  expect(fdm.worldVelocity.y).toBeGreaterThan(0.5);
  expect(fdm.worldVelocity.y).toBeLessThan(3.5);
});

it('keeps a horizon aim level at full power while approaching A-29 maximum speed', () => {
  const { fdm, instructor, controls } = pilot();
  controls.throttle = 1;
  for (let i = 0; i < 90 / FIXED_STEP; i++) {
    instructor.steer(fdm, 0, 0, -1, controls);
    fdm.step(controls);
  }
  expect(fdm.speed).toBeGreaterThan(155);
  expect(fdm.speed).toBeLessThanOrEqual(160.01);
  expect(Math.abs(fdm.position.y - 500)).toBeLessThan(15);
  expect(Math.abs(fdm.worldVelocity.y)).toBeLessThan(0.5);
});

it('turns right into a 90 degree aim in four seconds and settles without repeated overshoot', () => {
  const { fdm, instructor, controls } = pilot();
  const aim = new Vec3(1, 0, 0);
  let previousSide = 1, crossings = 0;
  for (let i = 0; i < 12 / FIXED_STEP; i++) {
    instructor.steer(fdm, aim.x, aim.y, aim.z, controls);
    fdm.step(controls);
    const forward = fdm.rotation.transformVector(Vec3.FORWARD);
    const heading = Math.atan2(forward.x, -forward.z) * 180 / Math.PI;
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(94);
    const signed = 90 - heading;
    const side = signed > 0.5 ? 1 : signed < -0.5 ? -1 : 0;
    if (side && side !== previousSide) crossings++;
    if (side) previousSide = side;
    if (i === 4 / FIXED_STEP - 1) expect(Math.abs(90 - heading)).toBeLessThan(4);
    if (i > 5 / FIXED_STEP) expect(error(fdm, aim)).toBeLessThan(3);
  }
  expect(crossings).toBeLessThanOrEqual(1);
  expect(error(fdm, aim)).toBeLessThan(1.5);
});

it('climbs toward an upward aim without banking or yawing', () => {
  const { fdm, instructor, controls } = pilot();
  const aim = new Vec3(0, 0.5, -Math.sqrt(0.75));
  for (let i = 0; i < 4 / FIXED_STEP; i++) {
    instructor.steer(fdm, aim.x, aim.y, aim.z, controls);
    fdm.step(controls);
  }
  expect(fdm.position.y).toBeGreaterThan(580);
  expect(fdm.worldVelocity.y).toBeGreaterThan(15);
  expect(error(fdm, aim)).toBeLessThan(2);
  expect(Math.abs(fdm.position.x)).toBeLessThan(0.1);
});

it('commits to one turn direction for a rear aim even with noise across the 180 degree seam', () => {
  const { fdm, instructor, controls } = pilot();
  const aim = new Vec3(0, 0, 1);
  for (let i = 0; i < 12 / FIXED_STEP; i++) {
    instructor.steer(fdm, i % 2 ? 0.00001 : -0.00001, 0, 1, controls);
    if (i < 0.5 / FIXED_STEP) expect(controls.roll).toBeGreaterThan(0);
    fdm.step(controls);
    expect(fdm.position.y).toBeGreaterThan(450);
  }
  expect(error(fdm, aim)).toBeLessThan(3);
  const nose = fdm.rotation.transformVector(Vec3.FORWARD);
  expect(nose.z / Math.hypot(nose.x, nose.z)).toBeGreaterThan(0.99);
});

it('rolls upright before pulling toward a rear target and preserves bank near the vertical', () => {
  const { fdm, instructor, controls } = pilot();
  fdm.rotation.setFromAxisAngle(Vec3.FORWARD, 180);
  instructor.steer(fdm, 0, 0, 1, controls);
  expect(controls.pitch).toBeLessThanOrEqual(0);
  expect(Math.abs(controls.roll)).toBeGreaterThan(0.5);
  fdm.rotation.setFromAxisAngle(Vec3.RIGHT, 90);
  instructor.steer(fdm, 0, 0, -1, controls);
  expect(Number.isFinite(controls.pitch + controls.roll + controls.yaw)).toBe(true);
});

it('levels the wings smoothly when the aim returns to the nose and tolerates invalid aim', () => {
  const { fdm, instructor, controls } = pilot();
  fdm.rotation.mul(new Quat().setFromAxisAngle(Vec3.FORWARD, 60));
  for (let i = 0; i < 4 / FIXED_STEP; i++) {
    const aim = fdm.rotation.transformVector(Vec3.FORWARD);
    instructor.steer(fdm, aim.x, aim.y, aim.z, controls);
    fdm.step(controls);
    expect(Math.abs(fdm.rates.x)).toBeLessThan(4);
  }
  const right = fdm.rotation.transformVector(Vec3.RIGHT);
  const up = fdm.rotation.transformVector(Vec3.UP);
  expect(Math.abs(Math.atan2(-right.y, up.y) * 180 / Math.PI)).toBeLessThan(4);
  for (const aim of [[0, 0, 0], [NaN, 0, 0], [Infinity, 0, 0]]) {
    instructor.steer(fdm, aim[0], aim[1], aim[2], controls);
    expect(Number.isFinite(controls.pitch + controls.roll + controls.yaw)).toBe(true);
  }
});

it('coordinates rightward sideslip by yawing the nose toward the velocity', () => {
  const { fdm, instructor, controls } = pilot();
  fdm.velocity.y = 8;
  fdm.step(controls);
  const aim = fdm.rotation.transformVector(Vec3.FORWARD);
  instructor.steer(fdm, aim.x, aim.y, aim.z, controls);
  expect(fdm.beta).toBeGreaterThan(0);
  expect(controls.yaw).toBeGreaterThan(0);
});
