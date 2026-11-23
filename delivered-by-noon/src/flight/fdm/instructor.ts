// Mouse guidance for the JSBSim FGPropagate-derived body frame; LGPL-2.1, JSBSim-Team.
import { Quat, Vec3 } from 'playcanvas';
import type { FlightControls, FlightDynamics } from './model';

export const INSTRUCTOR = {
  maxBank: 65 * Math.PI / 180,
  bankToHeading: 1.7,
  rollP: 1.8,
  rollD: 0.35,
  pitchP: 1.5,
  pitchD: 0.35,
  yawP: 8,
  yawD: 0.25,
  slipP: 0.1,
  coordination: 1,
  manualTrim: 0.35,
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export class MouseInstructor {
  private readonly inverse = new Quat();
  private readonly aim = new Vec3();
  private readonly local = new Vec3();
  private readonly forward = new Vec3();
  private readonly right = new Vec3();
  private readonly up = new Vec3();
  private heading = 0;
  private bank = 0;
  private turnDirection = 1;

  reset(heading: number): void {
    this.heading = heading * Math.PI / 180;
    this.bank = 0;
    this.turnDirection = 1;
  }

  steer(fdm: FlightDynamics, x: number, y: number, z: number, out: FlightControls): void {
    fdm.rotation.transformVector(Vec3.FORWARD, this.forward);
    fdm.rotation.transformVector(Vec3.RIGHT, this.right);
    fdm.rotation.transformVector(Vec3.UP, this.up);
    this.aim.set(x, y, z);
    const length = this.aim.length();
    if (Number.isFinite(length) && length > 1e-6) this.aim.mulScalar(1 / length);
    else this.aim.copy(this.forward);
    this.inverse.copy(fdm.rotation).invert().transformVector(this.aim, this.local);
    if (Math.hypot(this.forward.x, this.forward.z) > 0.001) {
      this.heading = Math.atan2(this.forward.x, -this.forward.z);
    }
    const targetHeading = Math.hypot(this.aim.x, this.aim.z) > 0.001
      ? Math.atan2(this.aim.x, -this.aim.z) : this.heading;
    let headingError = Math.atan2(Math.sin(targetHeading - this.heading), Math.cos(targetHeading - this.heading));
    // Keep the chosen side through the ambiguous +/-180 degree seam.
    if (Math.abs(headingError) > 2.7) headingError = Math.abs(headingError) * this.turnDirection;
    else if (Math.abs(headingError) > 0.05) this.turnDirection = Math.sign(headingError);
    if (Math.hypot(this.right.y, this.up.y) > 0.001) {
      this.bank = Math.atan2(-this.right.y, this.up.y);
    }
    const bank = this.bank;
    const targetBank = clamp(headingError * INSTRUCTOR.bankToHeading, -INSTRUCTOR.maxBank, INSTRUCTOR.maxBank);
    const bankError = Math.atan2(Math.sin(targetBank - bank), Math.cos(targetBank - bank));
    // Aim describes the flight path; pointing the nose at it ignores angle of attack and causes drift.
    let pitchError = Math.atan2(this.local.y, Math.max(0.1, -this.local.z)) + clamp(fdm.alpha, -0.25, 0.25);
    if (this.local.z > 0) {
      pitchError = this.up.y > 0
        ? Math.max(0.6, pitchError) * clamp(Math.abs(bank) / INSTRUCTOR.maxBank, 0, 1) : 0;
    }
    out.roll = clamp(bankError * INSTRUCTOR.rollP - fdm.rates.x * INSTRUCTOR.rollD, -1, 1);
    out.pitch = clamp(pitchError * INSTRUCTOR.pitchP - fdm.rates.y * INSTRUCTOR.pitchD + fdm.pitchTrim, -1, 1);
    const yawAuthority = Math.max(0, Math.cos(bank)) ** 2;
    const coordinatedYaw = fdm.rates.y * Math.sin(bank) * Math.cos(bank) / (0.2 + Math.sin(bank) ** 2);
    out.yaw = clamp(this.local.x * INSTRUCTOR.yawP * yawAuthority - fdm.rates.z * INSTRUCTOR.yawD
      + fdm.beta * INSTRUCTOR.slipP + coordinatedYaw * INSTRUCTOR.coordination, -0.7, 0.7);
  }
}
