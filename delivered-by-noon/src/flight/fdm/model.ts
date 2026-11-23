// Derived from JSBSim FGAerodynamics, FGAccelerations, FGPropagate and FGPropeller;
// aircraft/pc7/pc7.xml rescaled to an estimated A-29; LGPL-2.1, JSBSim-Team.
import { Quat, Vec3 } from 'playcanvas';
import aircraft from './aircraft-a29.json';
import { standardAtmosphere } from './atmosphere';
import { lookup1, lookup2 } from './table';

export const FIXED_STEP = 1 / 120;
export const ARCADE = 1;
export const ARCADE_TUNING = {
  rollRate: 240 * Math.PI / 180,
  pitchRate: 90 * Math.PI / 180,
  yawRate: 140 * Math.PI / 180,
  controlTime: 0.02,
  rateTime: 0.02,
  pathTime: 0.025,
  acceleration: 20,
  maximumSpeed: 160,
  stallSpeed: 25,
  recoverySpeed: 35,
  recoveryAcceleration: 30,
  recoveryPitchRate: 25 * Math.PI / 180,
};
export const ASSISTS = {
  mass: 0.9,
  power: 1.3,
  throttleExponent: 4,
  drag: 0.65,
  maneuverLift: 2,
  rollAuthority: 3,
  pitchAuthority: 0.7,
  yawAuthority: 1.8,
  controlTime: 0.07,
  stallRecovery: 0.35,
  ceilingStart: 2300,
  ceilingEnd: 2500,
  ceilingMoment: 5,
  overspeedDrag: 0.25,
};

export interface FlightControls {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
}

const G = 9.80665;
const AREA = aircraft.area;
const SPAN = aircraft.span;
const CHORD = aircraft.chord;
const MASS = (aircraft.emptyMass + aircraft.payloadMass + aircraft.fuelMass) * ASSISTS.mass;
const IX = aircraft.inertia[0] * ASSISTS.mass;
const IY = aircraft.inertia[1] * ASSISTS.mass;
const IZ = aircraft.inertia[2] * ASSISTS.mass;
const T = aircraft.tables;
const C = aircraft.constants;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Body axes follow JSBSim: X forward, Y right, Z down. World: PlayCanvas Y up, north -Z. */
export class FlightDynamics {
  readonly arcade: number;
  readonly position = new Vec3();
  readonly rotation = new Quat();
  readonly velocity = new Vec3();
  readonly rates = new Vec3();
  readonly controls: FlightControls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 };
  readonly worldVelocity = new Vec3();
  alpha = 0;
  beta = 0;
  dynamicPressure = 0;
  stalled = false;
  pitchTrim = 0;
  private readonly air = standardAtmosphere(0);
  private readonly inverse = new Quat();
  private readonly delta = new Quat();
  private readonly vector = new Vec3();
  private readonly gravity = new Vec3();
  private trimElevator = 0;

  constructor(arcade = ARCADE) {
    if (!Number.isFinite(arcade) || arcade < 0 || arcade > 1) throw new RangeError('ARCADE must be in [0, 1]');
    this.arcade = arcade;
  }

  get speed(): number { return this.velocity.length(); }

  reset(x: number, y: number, z: number, heading: number, speed: number, throttle: number): void {
    if (![x, y, z, heading, speed, throttle].every(Number.isFinite) || speed <= 0) {
      throw new RangeError('Invalid initial flight state');
    }
    this.position.set(x, y, z);
    standardAtmosphere(y, this.air);
    const requiredCL = MASS * G / (0.5 * this.air.density * speed * speed * AREA);
    const cmElevator = lookup1(T.Pitch_elevator, speed / this.air.soundSpeed);
    const alpha = clamp((requiredCL - lookup1(T.Lift_alpha, 0))
      / (4.96 - C.Lift_elevator * C.Pitch_alpha / cmElevator), -0.2, 0.2);
    const trimCL = MASS * G / (0.5 * this.air.density * aircraft.trimSpeed ** 2 * AREA);
    const trimCm = lookup1(T.Pitch_elevator, aircraft.trimSpeed / this.air.soundSpeed);
    const trimAlpha = (trimCL - lookup1(T.Lift_alpha, 0)) / (4.96 - C.Lift_elevator * C.Pitch_alpha / trimCm);
    this.trimElevator = clamp(-C.Pitch_alpha * trimAlpha / trimCm, -0.2, 0.2);
    this.rotation.setFromAxisAngle(Vec3.UP, -heading);
    this.delta.setFromAxisAngle(Vec3.RIGHT, alpha * 180 / Math.PI);
    this.rotation.mul(this.delta).normalize();
    this.velocity.set(speed * Math.cos(alpha), 0, speed * Math.sin(alpha));
    this.rates.set(0, 0, 0);
    this.controls.pitch = this.controls.roll = this.controls.yaw = 0;
    this.controls.throttle = clamp(throttle, 0, 1);
    this.alpha = alpha;
    this.beta = 0;
    this.dynamicPressure = 0.5 * this.air.density * speed * speed;
    this.stalled = speed < aircraft.stallSpeed * (1 - this.arcade) + ARCADE_TUNING.stallSpeed * this.arcade;
    this.pitchTrim = 0;
    this.updateWorldVelocity();
  }

  private updateWorldVelocity(): void {
    this.vector.set(this.velocity.y, -this.velocity.z, -this.velocity.x);
    this.rotation.transformVector(this.vector, this.worldVelocity);
  }

  /** One fixed 120 Hz step; the caller owns the accumulator and collision checks. */
  step(input: FlightControls): void {
    if (!Number.isFinite(input.pitch) || !Number.isFinite(input.roll)
      || !Number.isFinite(input.yaw) || !Number.isFinite(input.throttle)) {
      throw new RangeError('Non-finite flight controls');
    }
    const dt = FIXED_STEP;
    const controlTime = ASSISTS.controlTime * (1 - this.arcade) + ARCADE_TUNING.controlTime * this.arcade;
    const blend = 1 - Math.exp(-dt / controlTime);
    this.controls.pitch += (clamp(input.pitch, -1, 1) - this.controls.pitch) * blend;
    this.controls.roll += (clamp(input.roll, -1, 1) - this.controls.roll) * blend;
    this.controls.yaw += (clamp(input.yaw, -1, 1) - this.controls.yaw) * blend;
    this.controls.throttle += (clamp(input.throttle, 0, 1) - this.controls.throttle) * blend;
    const { x: u, y: v, z: w } = this.velocity;
    const { x: p, y: q, z: r } = this.rates;
    const speed = Math.max(0.1, Math.hypot(u, v, w));
    this.alpha = Math.atan2(w, u);
    this.beta = Math.asin(clamp(v / speed, -1, 1));
    standardAtmosphere(this.position.y, this.air);
    const qbar = this.dynamicPressure = 0.5 * this.air.density * speed * speed;
    const qs = qbar * AREA;
    const mach = speed / this.air.soundSpeed;
    const reynolds = this.air.density * speed * CHORD / (1.458e-6 * this.air.temperature ** 1.5 / (this.air.temperature + 110.4));
    const phat = p * SPAN / (2 * speed);
    const qhat = q * CHORD / (2 * speed);
    const rhat = r * SPAN / (2 * speed);
    const cmElevator = lookup1(T.Pitch_elevator, mach);
    // Fixed cruise trim fades before stall instead of demanding +1G at any attitude/airspeed.
    const trimElevator = this.trimElevator * clamp((speed - aircraft.stallSpeed * 0.5) / (aircraft.stallSpeed * 0.5), 0, 1);
    const elevator = trimElevator - this.controls.pitch * aircraft.controlLimit * ASSISTS.pitchAuthority;
    const aileron = this.controls.roll * aircraft.controlLimit * ASSISTS.rollAuthority;
    const rudder = -this.controls.yaw * aircraft.controlLimit * ASSISTS.yawAuthority;
    const maneuver = 1 + Math.abs(this.controls.pitch) * (ASSISTS.maneuverLift - 1);
    let cl = lookup1(T.Lift_alpha, this.alpha) + C.Lift_pitch_rate * qhat + C.Lift_elevator * elevator;
    // shortcut: source alpha coverage is limited; flat-plate post-stall recovery replaces absent polars.
    const postStall = clamp((Math.abs(this.alpha) - 0.3) / 0.6, 0, 1);
    cl = cl * (1 - postStall) + Math.sin(2 * this.alpha) * ASSISTS.stallRecovery * postStall;
    cl *= maneuver;
    const cd = (lookup1(T.Drag_basic, this.alpha) + C.Drag_induced * cl * cl
      + lookup1(T.Drag_beta, this.beta) + lookup1(T.Drag_mach, mach)
      + C.Drag_elevator * Math.abs(elevator)) * ASSISTS.drag
      + ASSISTS.overspeedDrag * Math.max(0, speed / aircraft.maximumSpeed - 0.9) ** 2;
    const cy = C.Side_beta * this.beta + lookup1(T.Side_roll_rate, reynolds) * phat
      + C.Side_yaw_rate * rhat + C.Side_rudder * rudder;
    const roll = lookup2(T.Roll_beta, this.alpha, reynolds) * this.beta + C.Roll_damp * phat
      + lookup2(T.Roll_yaw, this.alpha, reynolds) * rhat + lookup1(T.Roll_aileron, mach) * aileron
      + C.Roll_rudder * rudder;
    const pitch = C.Pitch_alpha * this.alpha + cmElevator * elevator + C.Pitch_damp * qhat;
    const yaw = C.Yaw_beta * this.beta + lookup1(T.Yaw_roll_rate, reynolds) * phat
      + C.Yaw_damp * rhat + C.Yaw_rudder * rudder + C.Yaw_aileron * aileron;
    const densityRatio = this.air.density / 1.225;
    const cruisePower = 0.6 ** ASSISTS.throttleExponent;
    const powerSetting = this.controls.throttle <= 0.6 ? this.controls.throttle ** ASSISTS.throttleExponent
      : cruisePower + (1 - cruisePower) * (this.controls.throttle - 0.6) / 0.4;
    const thrust = powerSetting * ASSISTS.power * densityRatio * Math.min(
      aircraft.engine.staticThrustNewtons,
      aircraft.engine.powerWatts * aircraft.engine.efficiency / Math.max(speed, 15),
    );
    const sa = Math.sin(this.alpha), ca = Math.cos(this.alpha);
    const sb = Math.sin(this.beta), cb = Math.cos(this.beta);
    const fx = qs * (-cd * ca * cb - cy * ca * sb + cl * sa) + thrust;
    const fy = qs * (-cd * sb + cy * cb);
    const fz = qs * (-cd * sa * cb - cy * sa * sb - cl * ca);
    this.inverse.copy(this.rotation).invert();
    this.vector.set(0, -G, 0);
    this.inverse.transformVector(this.vector, this.gravity);
    const pitchAuthority = qs * CHORD * -cmElevator * aircraft.controlLimit * ASSISTS.pitchAuthority;
    // Feedforward for the mouse instructor balances the existing moment, without demanding +1G.
    this.pitchTrim = Math.abs(this.alpha) < 0.35 && speed > aircraft.stallSpeed && this.gravity.y < -0.1 * G
      ? (1 - this.arcade) * clamp(-qs * CHORD * (C.Pitch_alpha * this.alpha + cmElevator * trimElevator)
        / Math.max(1, pitchAuthority), -0.5, 0.5) : 0;
    const du = fx / MASS - (q * w - r * v) - this.gravity.z;
    const dv = fy / MASS - (r * u - p * w) + this.gravity.x;
    const dw = fz / MASS - (p * v - q * u) - this.gravity.y;
    this.velocity.set(u + du * dt, v + dv * dt, w + dw * dt);
    const ceiling = clamp((this.position.y - ASSISTS.ceilingStart) / (ASSISTS.ceilingEnd - ASSISTS.ceilingStart), 0, 1)
      * clamp(this.worldVelocity.y / 20, 0, 1);
    const downPitch = Math.abs(this.gravity.y) > 0.1 * G ? this.gravity.y / G : -1;
    const l = qs * SPAN * roll;
    const m = qs * CHORD * pitch + IY * ceiling * ASSISTS.ceilingMoment * downPitch;
    const n = qs * SPAN * yaw + IZ * ceiling * ASSISTS.ceilingMoment * this.gravity.x / G;
    this.rates.set(
      clamp(p + (l - (IZ - IY) * q * r) / IX * dt, -6, 6),
      clamp(q + (m - (IX - IZ) * r * p) / IY * dt, -6, 6),
      clamp(r + (n - (IY - IX) * p * q) / IZ * dt, -6, 6),
    );
    if (this.arcade > 0) {
      // The arcade endpoint follows commanded rates, independent of aerodynamic inertia.
      const response = 1 - Math.exp(-dt / ARCADE_TUNING.rateTime);
      const recovery = clamp((ARCADE_TUNING.recoverySpeed - speed) / ARCADE_TUNING.recoverySpeed, 0, 1);
      const arcadeRoll = p + (this.controls.roll * ARCADE_TUNING.rollRate - p) * response;
      const arcadePitch = q + (this.controls.pitch * ARCADE_TUNING.pitchRate
        - recovery * ARCADE_TUNING.recoveryPitchRate + ceiling * downPitch * ASSISTS.ceilingMoment - q)
        * response;
      const arcadeYaw = r + (this.controls.yaw * ARCADE_TUNING.yawRate
        + ceiling * ASSISTS.ceilingMoment * this.gravity.x / G - r) * response;
      this.rates.x += (arcadeRoll - this.rates.x) * this.arcade;
      this.rates.y += (arcadePitch - this.rates.y) * this.arcade;
      this.rates.z += (arcadeYaw - this.rates.z) * this.arcade;
      // Fast attitude changes need path alignment too; speed retains the FDM's force/gravity work.
      const energyAcceleration = (fx * u + fy * v + fz * w) / (MASS * speed)
        + (-this.gravity.z * u + this.gravity.x * v - this.gravity.y * w) / speed;
      const boost = ARCADE_TUNING.acceleration * clamp((this.controls.throttle - 0.6) / 0.4, 0, 1)
        * clamp((ARCADE_TUNING.maximumSpeed - speed) / 20, 0, 1)
        + recovery * ARCADE_TUNING.recoveryAcceleration;
      const arcadeSpeed = clamp(speed + (energyAcceleration + boost) * dt, 0, ARCADE_TUNING.maximumSpeed);
      const nextSpeed = this.velocity.length() * (1 - this.arcade) + arcadeSpeed * this.arcade;
      const upFraction = -this.gravity.y / G;
      const alpha = clamp((MASS * G * upFraction / Math.max(qs, 1) - lookup1(T.Lift_alpha, 0))
        / (4.96 - C.Lift_elevator * C.Pitch_alpha / cmElevator), -0.2, 0.2);
      this.vector.set(nextSpeed * Math.cos(alpha), 0, nextSpeed * Math.sin(alpha));
      this.velocity.lerp(this.velocity, this.vector,
        this.arcade * (1 - Math.exp(-dt / ARCADE_TUNING.pathTime)) * clamp(speed / ARCADE_TUNING.recoverySpeed, 0, 1));
      if (this.velocity.length() > 1e-8) this.velocity.mulScalar(nextSpeed / this.velocity.length());
    }
    this.vector.set(this.rates.y, -this.rates.z, -this.rates.x);
    const rate = this.vector.length();
    if (rate > 1e-10) {
      this.delta.setFromAxisAngle(this.vector.mulScalar(1 / rate), rate * dt * 180 / Math.PI);
      this.rotation.mul(this.delta).normalize();
    }
    this.updateWorldVelocity();
    this.position.x += this.worldVelocity.x * dt;
    this.position.y += this.worldVelocity.y * dt;
    this.position.z += this.worldVelocity.z * dt;
    const stallSpeed = aircraft.stallSpeed * (1 - this.arcade) + ARCADE_TUNING.stallSpeed * this.arcade;
    this.stalled = speed < stallSpeed || Math.abs(this.alpha) > 0.35 + this.arcade * 0.2;
  }
}
