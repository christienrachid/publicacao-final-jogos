// JSBSim FGRotor-derived rotor force integration; Jon S. Berndt, Thomas Kreitler / JSBSim-Team.
// SPDX-License-Identifier: LGPL-2.1-or-later. See LICENSE-JSBSim.txt; arcade assists are original adaptations.
import { Quat, Vec3 } from 'playcanvas';
import { FIXED_STEP } from './model';
import { Rotor } from './rotor';
import { standardAtmosphere } from './atmosphere';
import aircraft from './aircraft-md500.json';

export interface HeliControls { forward:number; right:number; yaw:number; collective:number }
export const HELI_ASSISTS={cyclicGain:2.7,attitudeTime:.45,verticalTime:1.2,maximumClimb:15,
  maximumSpeed:80,horizontalDamping:.08,hoverDamping:.8,powerMultiplier:3,yawRate:90,yawGovernor:1};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const G=9.80665;
export class HeliDynamics {
  readonly position=new Vec3();readonly velocity=new Vec3();readonly rotation=new Quat();
  readonly mainRotor=new Rotor(aircraft.main);readonly tailRotor=new Rotor(aircraft.tail);
  heading=0;pitch=0;roll=0;yawRate=0;crashed=false;grounded=false;
  private readonly air=standardAtmosphere(0);
  reset(x:number,y:number,z:number,heading:number) {
    this.position.set(x,y,z);this.velocity.set(0,0,0);this.heading=heading;
    this.pitch=this.roll=this.yawRate=0;this.crashed=this.grounded=false;this.rotation.setFromEulerAngles(0,-heading,0);
    const rho=standardAtmosphere(y,this.air).density;
    this.mainRotor.reset(aircraft.mass*G,rho);this.tailRotor.reset(this.mainRotor.torque/aircraft.tailArm,rho);
  }
  step(input:HeliControls,groundAt:(x:number,z:number)=>number,clearance:number) {
    if(!Object.values(input).every(Number.isFinite))throw new RangeError('Invalid helicopter controls');
    const dt=FIXED_STEP,a=HELI_ASSISTS;
    const forward=clamp(input.forward,-1,1),right=clamp(input.right,-1,1),collective=clamp(input.collective,-1,1);
    const blend=1-Math.exp(-dt/a.attitudeTime);
    this.pitch+=(-forward*20-this.pitch)*blend;this.roll+=(right*20-this.roll)*blend;
    const h=this.heading*Math.PI/180,magnitude=Math.hypot(this.pitch,this.roll);
    const tilt=Math.min(55,magnitude*a.cyclicGain)*Math.PI/180;
    const f=magnitude? -this.pitch/magnitude*Math.sin(tilt):0,r=magnitude?this.roll/magnitude*Math.sin(tilt):0;
    const nx=Math.sin(h)*f+Math.cos(h)*r,ny=Math.cos(tilt),nz=-Math.cos(h)*f+Math.sin(h)*r;
    const rho=standardAtmosphere(this.position.y,this.air).density;
    const axial=this.velocity.x*nx+this.velocity.y*ny+this.velocity.z*nz;
    const transverse=Math.sqrt(Math.max(0,this.velocity.lengthSq()-axial*axial));
    // Hover trim compensates tilted-disc lift loss; neutral collective brakes vertical drift.
    const demand=aircraft.mass*Math.max(0,G+(collective*a.maximumClimb-this.velocity.y)/a.verticalTime)/ny;
    this.mainRotor.step(this.mainRotor.collectiveFor(demand,axial,transverse,rho),axial,transverse,rho,dt);
    const powerScale=Math.min(1,aircraft.enginePower*a.powerMultiplier/Math.max(1,this.mainRotor.power));
    const thrust=Math.max(0,this.mainRotor.thrust)*powerScale,torque=this.mainRotor.torque*powerScale;
    const targetYaw=clamp(input.yaw,-1,1)*a.yawRate*Math.PI/180;
    const tailDemand=(torque+aircraft.yawInertia*(targetYaw-this.yawRate)/dt)/aircraft.tailArm;
    this.tailRotor.step(this.tailRotor.collectiveFor(tailDemand,0,0,rho),0,0,rho,dt);
    const physicalYaw=this.yawRate+(this.tailRotor.thrust*aircraft.tailArm-torque)/aircraft.yawInertia*dt;
    // Arcade rate governor preserves the established 90deg/s pedals; rotor torque is computed before assistance.
    this.yawRate=physicalYaw+(targetYaw-physicalYaw)*a.yawGovernor;
    this.heading=(this.heading+this.yawRate*dt*180/Math.PI+360)%360;
    const horizontal=Math.hypot(this.velocity.x,this.velocity.z),damping=forward||right?a.horizontalDamping:a.hoverDamping;
    const drag=.5*rho*aircraft.dragArea*horizontal/aircraft.mass+damping;
    const tailTrim=this.tailRotor.thrust-torque/aircraft.tailArm;
    this.velocity.x+=(thrust*nx/aircraft.mass-drag*this.velocity.x-Math.cos(h)*tailTrim/aircraft.mass)*dt;
    this.velocity.z+=(thrust*nz/aircraft.mass-drag*this.velocity.z-Math.sin(h)*tailTrim/aircraft.mass)*dt;
    this.velocity.y+=(thrust*ny/aircraft.mass-G)*dt;
    const speed=Math.hypot(this.velocity.x,this.velocity.z);
    if(speed>a.maximumSpeed){this.velocity.x*=a.maximumSpeed/speed;this.velocity.z*=a.maximumSpeed/speed;}
    this.velocity.y=clamp(this.velocity.y,-a.maximumClimb,a.maximumClimb);
    if(this.velocity.lengthSq()<1e-16)this.velocity.set(0,0,0);
    this.position.addScaled(this.velocity,dt);
    this.position.x=clamp(this.position.x,-2980,2980);this.position.z=clamp(this.position.z,-2980,2980);
    if(this.position.y>2500){this.position.y=2500;this.velocity.y=Math.min(0,this.velocity.y);}
    const floor=groundAt(this.position.x,this.position.z)+clearance;this.grounded=false;
    if(this.position.y<=floor) {
      const penetration=floor-this.position.y;
      const hardDrop=this.velocity.y<-6;
      const hardHorizontal=Math.hypot(this.velocity.x,this.velocity.z)>22;
      const extremeTilt=Math.abs(this.pitch)>60||Math.abs(this.roll)>60;
      const wallImpact=penetration>1.5;
      if(wallImpact||hardDrop||extremeTilt||hardHorizontal) {
        this.crashed=true;
      } else {
        this.position.y=floor;
        if(this.velocity.y<0)this.velocity.y=0;
        const slide=Math.exp(-dt*6);
        this.velocity.x*=slide;this.velocity.z*=slide;
        if(this.velocity.lengthSq()<1e-4)this.velocity.set(0,0,0);
        if(collective<=0&&this.velocity.y<=.05)this.grounded=true;
      }
    }
    this.rotation.setFromEulerAngles(this.pitch,-this.heading,-this.roll);
  }
}
