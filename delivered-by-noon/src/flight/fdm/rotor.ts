// Essential SI port of JSBSim FGRotor.cpp (3f153c18), calc_flow_and_thrust/calc_torque.
// Copyright (C) 2000 Jon S. Berndt; rotor model by Thomas Kreitler / JSBSim-Team.
// SPDX-License-Identifier: LGPL-2.1-or-later. See LICENSE-JSBSim.txt; modifications are supplied as TypeScript source.
export interface RotorConfiguration { radius:number;blades:number;chord:number;rpm:number;twist:number;liftCurveSlope:number;inflowLag:number }
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export class Rotor {
  readonly area:number;
  readonly tipSpeed:number;
  readonly solidity:number;
  inducedRatio=0;thrust=0;torque=0;coefficient=0;power=0;
  constructor(readonly config:RotorConfiguration) {
    this.area=Math.PI*config.radius**2;this.tipSpeed=config.rpm*Math.PI/30*config.radius;
    this.solidity=config.blades*config.chord/(Math.PI*config.radius);
  }
  reset(thrust:number,density:number) {
    this.thrust=thrust;this.coefficient=thrust/(density*this.area*this.tipSpeed**2);
    this.inducedRatio=Math.sign(thrust)*Math.sqrt(Math.abs(this.coefficient)/2);
    this.updateTorque(density,0,-this.inducedRatio);
  }
  /** Feed-forward trim for the requested thrust; cyclic tilts the resulting disc force. */
  collectiveFor(thrust:number,axialSpeed:number,horizontalSpeed:number,density:number) {
    const mu=Math.min(.7,Math.abs(horizontalSpeed)/this.tipSpeed),lambda=-axialSpeed/this.tipSpeed-this.inducedRatio;
    const k=this.config.liftCurveSlope*this.solidity/2;
    const target=thrust/(density*this.area*this.tipSpeed**2);
    return clamp((target/k-(.5+.25*mu*mu)*lambda-(.25+.25*mu*mu)*this.config.twist)
      /(1/3+.5*mu*mu-4/(9*Math.PI)*mu**3),-.7,.7);
  }
  step(collective:number,axialSpeed:number,horizontalSpeed:number,density:number,dt:number) {
    if(![collective,axialSpeed,horizontalSpeed,density,dt].every(Number.isFinite)||density<=0||dt<=0||dt>.25)throw new RangeError('Invalid rotor input');
    const c=this.config,mu=Math.min(.7,Math.abs(horizontalSpeed)/this.tipSpeed);
    let lambda=-axialSpeed/this.tipSpeed-this.inducedRatio;
    const pitch=(1/3+.5*mu*mu-4/(9*Math.PI)*mu**3)*clamp(collective,-.7,.7)+(.25+.25*mu*mu)*c.twist;
    const inflow=(.5+.25*mu*mu)*lambda;
    const ct=c.liftCurveSlope*this.solidity/2*(inflow+pitch);
    // Bound the fixed-point inflow near zero thrust; the full JSBSim transmission is outside this subset.
    const equilibrium=clamp(ct/(2*Math.hypot(mu,lambda)+1e-12),-.35,.35);
    this.inducedRatio+=(equilibrium-this.inducedRatio)*(1-Math.exp(-dt/c.inflowLag));
    lambda=-axialSpeed/this.tipSpeed-this.inducedRatio;
    this.coefficient=c.liftCurveSlope*this.solidity/2*((.5+.25*mu*mu)*lambda+pitch);
    this.thrust=density*this.area*this.tipSpeed**2*this.coefficient;
    this.updateTorque(density,mu,lambda);
    return this;
  }
  private updateTorque(density:number,mu:number,lambda:number) {
    const c=this.config,drag=.009+.3*(6*this.coefficient/(c.liftCurveSlope*this.solidity))**2;
    this.torque=Math.max(0,density*c.blades*c.chord*drag*this.tipSpeed**2*c.radius**2*(1+4.5*mu*mu)/8-this.thrust*lambda*c.radius);
    this.power=this.torque*c.rpm*Math.PI/30;
  }
}
