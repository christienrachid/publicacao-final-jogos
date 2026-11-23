// Tests for the port of JSBSim FGTable/FGStandardAtmosphere/FGPropagate; LGPL-2.1, JSBSim-Team.
import { describe, expect, it } from 'vitest';
import { Vec3 } from 'playcanvas';
import aircraft from './aircraft-pc7.json';
import a29 from './aircraft-a29.json';
import { standardAtmosphere } from './atmosphere';
import { FIXED_STEP, FlightDynamics, type FlightControls } from './model';
import { lookup1, lookup2 } from './table';

const neutral: FlightControls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 };
function flying(arcade = 1): FlightDynamics {
  const fdm = new FlightDynamics(arcade);
  fdm.reset(0, 500, 0, 0, 70, 0.6);
  return fdm;
}

describe('JSBSim table port', () => {
  it('interpolates linear/bilinear tables and clamps all boundaries', () => {
    const table = [[0, 10], [2, 30], [5, 60]];
    expect(lookup1(table, 1)).toBe(20);
    expect(lookup1(table, -100)).toBe(10);
    expect(lookup1(table, 100)).toBe(60);
    const grid = { rows: [0, 2], columns: [0, 4], values: [[0, 8], [4, 12]] };
    expect(lookup2(grid, 1, 2)).toBe(6);
    expect(lookup2(grid, -1, 9)).toBe(8);
    expect(lookup2(grid, 9, -1)).toBe(4);
    expect(() => lookup1(table, NaN)).toThrow(RangeError);
  });

  it('preserves source polar knots and valid converted SI geometry', () => {
    expect(lookup1(aircraft.tables.Lift_alpha, 0.27)).toBeCloseTo(1.7471);
    expect(aircraft.span).toBeCloseTo(10.399776);
    expect(aircraft.engine.powerWatts).toBeGreaterThan(400000);
    for (const table of Object.values(aircraft.tables)) {
      const rows = Array.isArray(table) ? table.map(row => row[0]) : table.rows;
      for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThan(rows[i - 1]);
      if (!Array.isArray(table)) {
        expect(table.values).toHaveLength(rows.length);
        for (const row of table.values) expect(row).toHaveLength(table.columns.length);
      }
    }
  });

  it('keeps PC-7 data and scales A-29 mass, geometry, power and estimated inertias', () => {
    expect(a29.emptyMass).toBe(3200);
    expect(a29.maximumMass).toBe(5400);
    expect(a29.area).toBe(19.4);
    expect(a29.span).toBe(11.1);
    expect(a29.chord * a29.span).toBeCloseTo(a29.area);
    expect(a29.engine.powerWatts / 745.6998715822702).toBeCloseTo(1600);
    expect(a29.maximumSpeed * 3.6).toBeCloseTo(590);
    expect(a29.tables).toEqual(aircraft.tables);
    for (let i = 0; i < 3; i++) expect(a29.inertia[i]).toBeGreaterThan(aircraft.inertia[i]);
  });
});

describe('standard atmosphere', () => {
  it('matches ISA sea level, tropopause and isothermal layer', () => {
    expect(standardAtmosphere(0).density).toBeCloseTo(1.225, 3);
    expect(standardAtmosphere(11000).density).toBeCloseTo(0.3648, 3);
    expect(standardAtmosphere(20000).density).toBeCloseTo(0.0889, 3);
    expect(standardAtmosphere(2500).density).toBeLessThan(standardAtmosphere(0).density);
    expect(() => standardAtmosphere(Infinity)).toThrow(RangeError);
  });
});

describe('six degree of freedom flight', () => {
  it('keeps neutral flight within altitude and speed bands for 30 seconds', () => {
    const fdm = flying();
    let minY = 500, maxY = 500;
    for (let i = 0; i < 30 / FIXED_STEP; i++) {
      fdm.step(neutral);
      minY = Math.min(minY, fdm.position.y);
      maxY = Math.max(maxY, fdm.position.y);
      expect(fdm.speed).toBeGreaterThan(65);
      expect(fdm.speed).toBeLessThan(80);
      expect(fdm.rotation.length()).toBeCloseTo(1, 8);
    }
    expect(minY).toBeGreaterThan(480);
    expect(maxY).toBeLessThan(520);
    expect(Math.abs(fdm.position.x)).toBeLessThan(1);
  });

  it('completes a free elevator loop and recovers its initial heading', () => {
    const fdm = flying();
    const input = { ...neutral, pitch: 1, throttle: 1 };
    const forward = new Vec3();
    fdm.rotation.transformVector(Vec3.FORWARD, forward);
    let last = Math.atan2(forward.y, -forward.z);
    let angle = 0, inverted = false;
    for (let i = 0; i < 15 / FIXED_STEP && angle < 2 * Math.PI; i++) {
      fdm.step(input);
      fdm.rotation.transformVector(Vec3.FORWARD, forward);
      const next = Math.atan2(forward.y, -forward.z);
      angle += Math.atan2(Math.sin(next - last), Math.cos(next - last));
      last = next;
      inverted ||= fdm.rotation.transformVector(Vec3.UP).y < -0.8;
      expect(fdm.speed).toBeGreaterThan(25);
      expect(fdm.position.y).toBeGreaterThan(0);
    }
    expect(angle).toBeGreaterThanOrEqual(2 * Math.PI);
    expect(inverted).toBe(true);
    expect(forward.z).toBeLessThan(-0.9);
    expect(Math.abs(forward.x)).toBeLessThan(0.05);
  });

  it('completes an aileron roll and accepts simultaneous local commands', () => {
    const fdm = flying();
    let angle = 0, inverted = false;
    for (let i = 0; i < 8 / FIXED_STEP && angle < 2 * Math.PI; i++) {
      fdm.step({ ...neutral, roll: 1, throttle: 1 });
      angle += fdm.rates.x * FIXED_STEP;
      inverted ||= fdm.rotation.transformVector(Vec3.UP).y < -0.8;
    }
    expect(angle).toBeGreaterThanOrEqual(2 * Math.PI);
    expect(inverted).toBe(true);
    expect(fdm.rotation.transformVector(Vec3.UP).y).toBeGreaterThan(0.7);
    for (const [roll, yaw, pitch] of [[-1, -1, 0], [1, 1, 0], [-1, 0, -1], [1, 0, 1]]) {
      const mixed = flying();
      for (let i = 0; i < 12; i++) mixed.step({ ...neutral, roll, yaw, pitch });
      expect(mixed.rates.x * roll).toBeGreaterThan(0.2);
      if (yaw) expect(mixed.rates.z * yaw).toBeGreaterThan(0.02);
      if (pitch) expect(mixed.rates.y * pitch).toBeGreaterThan(0.1);
    }
  });

  it('resets velocities/rates and rejects non-finite controls', () => {
    const fdm = flying();
    fdm.step({ ...neutral, pitch: 1, roll: 1 });
    fdm.reset(0, 500, 0, 90, 70, 0.6);
    expect(fdm.rates.length()).toBe(0);
    expect(fdm.worldVelocity.x).toBeCloseTo(70);
    expect(fdm.worldVelocity.y).toBeCloseTo(0);
    expect(() => fdm.step({ ...neutral, yaw: NaN })).toThrow(RangeError);
  });

  it('loses control authority without airflow and does not trim a stalled aircraft nose-up', () => {
    const slow = flying(0), fast = flying(0);
    slow.velocity.set(0, 0, 0);
    const command = { ...neutral, pitch: 1, roll: 1, yaw: 1, throttle: 0 };
    slow.step(command);
    fast.step(command);
    expect(slow.rates.length()).toBeLessThan(fast.rates.length() * 0.001);
    slow.reset(0, 500, 0, 0, 70, 0.6);
    slow.velocity.set(30, 0, 0);
    slow.step(neutral);
    expect(slow.stalled).toBe(true);
    expect(Math.abs(slow.rates.y)).toBeLessThan(0.002);
    expect(slow.pitchTrim).toBe(0);
  });

  it('starts pitching down near the ceiling before the safety clamp is needed', () => {
    const fdm = flying();
    fdm.position.y = 2450;
    fdm.rotation.setFromAxisAngle(Vec3.RIGHT, 90);
    fdm.velocity.set(70, 0, 0);
    fdm.worldVelocity.set(0, 70, 0);
    fdm.step(neutral);
    expect(fdm.position.y).toBeLessThan(2500);
    expect(fdm.rates.y).toBeLessThan(-0.01);
  });
});
