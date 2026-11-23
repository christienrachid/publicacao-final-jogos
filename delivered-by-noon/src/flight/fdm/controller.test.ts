// Integration tests for the JSBSim FGPropagate-derived controller; LGPL-2.1, JSBSim-Team.
import { afterEach, expect, it, vi } from 'vitest';
import { Entity, KEY_A, KEY_D, KEY_E, KEY_Q, KEY_R, KEY_S, KEY_W } from 'playcanvas';
import { createFlightController } from '../flight';
import { createFlightState, SPAWN, type FlightContext } from '../types';

const canvas = {};
afterEach(() => vi.unstubAllGlobals());

function simulator(keys: number[] = [], groundAt = (_x: number, _z: number) => 0, hitbox?: [number, number, number][]) {
  const pressed = new Set(keys);
  const state = createFlightState();
  state.controlMode = 'keyboard';
  const app = {
    graphicsDevice: { canvas },
    keyboard: { isPressed: (key: number) => pressed.has(key), wasPressed: (key: number) => pressed.has(key) },
  } as unknown as FlightContext['app'];
  const ctx = {
    app,
    world: { groundAt },
    plane: { root: new Entity('Plane', app), prop: new Entity('Prop', app), hitbox },
    state,
  } as unknown as FlightContext;
  return { state, pressed, module: createFlightController(ctx) };
}

it('uses the same fixed simulation steps at 30 and 60 render frames per second', () => {
  const a = simulator();
  const b = simulator();
  for (let i = 0; i < 300; i++) a.module.update(1 / 30);
  for (let i = 0; i < 600; i++) b.module.update(1 / 60);
  expect(a.state.x).toBeCloseTo(b.state.x, 8);
  expect(a.state.y).toBeCloseTo(b.state.y, 8);
  expect(a.state.z).toBeCloseTo(b.state.z, 8);
  expect(a.state.speed).toBeCloseTo(b.state.speed, 8);
  expect(a.state.altitude).toBe(a.state.y);
});

it('maps all four mixed keyboard pairs without cancelling the other axis', () => {
  for (const keys of [[KEY_A, KEY_Q], [KEY_D, KEY_E], [KEY_W, KEY_A], [KEY_S, KEY_D]]) {
    const sim = simulator(keys);
    for (let i = 0; i < 15; i++) sim.module.update(1 / 60);
    expect(Math.abs(sim.state.roll)).toBeGreaterThan(5);
    if (keys.includes(KEY_W) || keys.includes(KEY_S)) expect(Math.abs(sim.state.pitch)).toBeGreaterThan(3);
    else expect(Math.abs(sim.state.heading < 180 ? sim.state.heading : sim.state.heading - 360)).toBeGreaterThan(1);
    expect(sim.state.crashed).toBe(false);
  }
});

it('uses mouse aim, adds keyboard trim and returns to direct keyboard control', () => {
  vi.stubGlobal('document', { pointerLockElement: canvas });
  const mouse = simulator();
  const trimmed = simulator([KEY_A]);
  for (const sim of [mouse, trimmed]) {
    sim.state.controlMode = 'mouse';
    sim.state.aimX = 1;
    sim.state.aimY = 0;
    sim.state.aimZ = 0;
    for (let i = 0; i < 12; i++) sim.module.update(1 / 60);
  }
  expect(mouse.state.roll).toBeGreaterThan(trimmed.state.roll);
  expect(mouse.state.heading).toBeGreaterThan(0);
  for (let i = 0; i < 48; i++) mouse.module.update(1 / 60);
  mouse.state.controlMode = 'keyboard';
  mouse.state.aimX = -1;
  const bankAtSwitch = mouse.state.roll;
  for (let i = 0; i < 30; i++) mouse.module.update(1 / 60);
  expect(Math.abs(mouse.state.roll - bankAtSwitch)).toBeLessThan(10);
  const keyboard = simulator();
  keyboard.state.aimX = 1;
  keyboard.state.aimZ = 0;
  for (let i = 0; i < 12; i++) keyboard.module.update(1 / 60);
  expect(Math.abs(keyboard.state.roll)).toBeLessThan(0.01);
  expect(Math.abs(keyboard.state.heading)).toBeLessThan(0.01);
});

it('uses direct keyboard control without pointer lock, with no feedback from nose-following aim', () => {
  const mouse = simulator([KEY_A]);
  const keyboard = simulator([KEY_A]);
  mouse.state.controlMode = 'mouse';
  mouse.state.aimX = 1;
  mouse.state.aimZ = 0;
  for (let i = 0; i < 30; i++) {
    mouse.module.update(1 / 60);
    keyboard.module.update(1 / 60);
  }
  expect(mouse.state.roll).toBeCloseTo(keyboard.state.roll, 8);
  expect(mouse.state.pitch).toBeCloseTo(keyboard.state.pitch, 8);
  mouse.pressed.clear();
  keyboard.pressed.clear();
  for (let i = 0; i < 600; i++) {
    const pitch = mouse.state.pitch * Math.PI / 180;
    const heading = mouse.state.heading * Math.PI / 180;
    mouse.state.aimX = Math.sin(heading) * Math.cos(pitch);
    mouse.state.aimY = Math.sin(pitch);
    mouse.state.aimZ = -Math.cos(heading) * Math.cos(pitch);
    mouse.module.update(1 / 60);
    keyboard.module.update(1 / 60);
  }
  expect(mouse.state.y).toBeCloseTo(keyboard.state.y, 8);
  expect(mouse.state.speed).toBeCloseTo(keyboard.state.speed, 8);
});

it('uses the model hitbox when supplied, with the old contour as fallback', () => {
  const obstacle = (x: number) => x > 7.5 ? 500 : 0;
  const model = simulator([], obstacle, [[8, 0, 0]]);
  const fallback = simulator([], obstacle);
  model.module.update(1 / 60);
  fallback.module.update(1 / 60);
  expect(model.state.crashed).toBe(true);
  expect(fallback.state.crashed).toBe(false);
});

it('detects a wing-only obstacle and resets after two seconds or R', () => {
  const sim = simulator([], x => x > 4.8 ? 200 : 0);
  sim.module.update(1 / 60);
  expect(sim.state.crashed).toBe(true);
  expect(sim.state.speed).toBe(0);
  expect(sim.state.stall).toBe(false);
  for (let i = 0; i < 7; i++) sim.module.update(0.25);
  expect(sim.state.crashed).toBe(true);
  sim.module.update(0.25);
  expect(sim.state.crashed).toBe(false);
  expect(sim.state.y).toBe(SPAWN.y);
  sim.pressed.add(KEY_R);
  sim.module.update(1 / 60);
  expect(sim.state.z).toBe(SPAWN.z);
  expect(sim.state.speed).toBeCloseTo(SPAWN.speed);
});

it('contains a long uncontrolled flight inside the world and caps invalid/large frame times', () => {
  const sim = simulator();
  for (let i = 0; i < 80 * 30; i++) {
    sim.module.update(1 / 30);
    expect(Math.abs(sim.state.x)).toBeLessThanOrEqual(2980);
    expect(Math.abs(sim.state.z)).toBeLessThanOrEqual(2980);
    expect(sim.state.y).toBeLessThanOrEqual(2500);
  }
  const a = simulator(), b = simulator();
  a.module.update(10);
  b.module.update(0.25);
  expect(a.state).toEqual(b.state);
  const before = { ...a.state };
  for (const dt of [NaN, Infinity, -1, 0]) a.module.update(dt);
  expect(a.state).toEqual(before);
});
