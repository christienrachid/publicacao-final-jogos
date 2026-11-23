import { Vec3 } from 'playcanvas';
import { AIRPORT, isRunway } from '../world-data';
import { FIXED_STEP, type FlightControls, type FlightDynamics } from './model';

export function safeTouchdown(verticalSpeed:number,roll:number,pitch:number,onRunway:boolean,speed:number) {
  return verticalSpeed>-4&&verticalSpeed<4&&Math.abs(roll)<12&&Math.abs(pitch)<14&&(onRunway?speed<95:speed<12);
}
/** Wheel contact is separate from the unchanged aerodynamic integrator. */
export class AircraftGround {
  grounded=false;
  crashed=false;
  takeoffAssist=0;
  constructor(readonly groundAt:(x:number,z:number)=>number,public clearance:number,
    readonly runway=isRunway) {}
  park(fdm:FlightDynamics,heading:number) {
    fdm.rotation.setFromEulerAngles(0,-heading,0);fdm.velocity.set(0,0,0);fdm.worldVelocity.set(0,0,0);
    fdm.position.y=this.groundAt(fdm.position.x,fdm.position.z)+this.clearance;
    fdm.rates.set(0,0,0);fdm.stalled=false;this.grounded=true;
  }
  step(fdm:FlightDynamics,input:FlightControls,brake:boolean) {
    if(!this.grounded){this.takeoffAssist=Math.max(0,this.takeoffAssist-FIXED_STEP);return false;}
    const forward=fdm.rotation.transformVector(Vec3.FORWARD,new Vec3());
    let heading=Math.atan2(forward.x,-forward.z)*180/Math.PI;
    let speed=Math.max(0,fdm.speed+(input.throttle*14-fdm.speed*.06-(brake?25:1))*FIXED_STEP);
    if(brake)input.throttle=0;
    heading+=(input.yaw+input.roll)*Math.min(30,speed*2)*FIXED_STEP;
    const h=heading*Math.PI/180;
    const x=fdm.position.x+Math.sin(h)*speed*FIXED_STEP,z=fdm.position.z-Math.cos(h)*speed*FIXED_STEP;
    const y=this.groundAt(x,z);
    if(y>fdm.position.y-this.clearance+.3||(!this.runway(x,z)&&speed>12)) {this.crashed=true;return true;}
    fdm.position.set(x,y+this.clearance,z);fdm.rotation.setFromEulerAngles(0,-heading,0);
    fdm.velocity.set(speed,0,0);fdm.worldVelocity.set(Math.sin(h)*speed,0,-Math.cos(h)*speed);
    fdm.controls.throttle=input.throttle;fdm.stalled=false;
    if(!brake&&input.throttle>0&&speed>=38&&this.runway(x,z)) {
      fdm.reset(x,fdm.position.y+.08,z,heading,speed,input.throttle);
      fdm.rotation.setFromEulerAngles(8,-heading,0);
      fdm.velocity.set(speed,0,0);this.grounded=false;this.takeoffAssist=1.5;
    }
    return true;
  }
  contact(fdm:FlightDynamics,roll:number,pitch:number,contactHeight:number) {
    const surface=this.groundAt(fdm.position.x,fdm.position.z);
    if(contactHeight>surface+.35||!safeTouchdown(fdm.worldVelocity.y,roll,pitch,this.runway(fdm.position.x,fdm.position.z),fdm.speed)) {
      this.crashed=true;return;
    }
    const forward=fdm.rotation.transformVector(Vec3.FORWARD,new Vec3());
    const heading=Math.atan2(forward.x,-forward.z)*180/Math.PI,speed=fdm.speed;
    this.park(fdm,heading);fdm.velocity.set(speed,0,0);
  }
}
export const RUNWAY_SPAWN={x:AIRPORT.x,y:AIRPORT.y,z:410,heading:AIRPORT.heading};
