// Port of spacejack/carphysics2d public/js/Car.js (1266b154), Mike Linkovich, 2015.
// Based on Marco Monster's Car Physics for Games. SPDX-License-Identifier: MIT.
// Original notice: LICENSE-carphysics2d.txt. Adaptations: SI axes, FWD/RWD, arcade assistance.
export interface CarSpecification {
  mass:number; frontAxle:number; rearAxle:number; cgHeight:number; inertiaScale:number;
  driveAxle:'front'|'rear'; grip:number; lockGrip:number; engineForce:number; brakeForce:number;
  handbrakeForce:number; cornerFront:number; cornerRear:number; airDrag:number; rollingDrag:number;
  weightTransfer:number; maximumSpeed:number; steeringGain:number; cornerSpeedCap?:number; highSpeedCorner?:number;
}
export const HATCH:CarSpecification={mass:1100,frontAxle:.95,rearAxle:1.5,cgHeight:.48,inertiaScale:1.6,
  driveAxle:'front',grip:2.4,lockGrip:.2,engineForce:26000,brakeForce:11550,handbrakeForce:15400,
  cornerFront:8,cornerRear:8.5,airDrag:.45,rollingDrag:6,weightTransfer:.12,maximumSpeed:45,steeringGain:1};
export const COUPE:CarSpecification={mass:1350,frontAxle:1.45,rearAxle:1.15,cgHeight:.5,inertiaScale:1.8,
  driveAxle:'rear',grip:2.8,lockGrip:.13,engineForce:46000,brakeForce:14175,handbrakeForce:18900,
  cornerFront:9,cornerRear:9,airDrag:.5,rollingDrag:8,weightTransfer:.15,maximumSpeed:65,steeringGain:1.15,cornerSpeedCap:58,highSpeedCorner:.35};
export interface CarAssists { tractionControl:number; nitroGrip:number; lateralAcceleration:number; steeringTime:number; yawDamping:number; yawResponse:number; gripResponse:number; brakeBoost:number }
export interface TireInput {drive:number;steer:number;handbrake:boolean;boost:number}
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));

/** Bicycle model: forward/right body velocities, clockwise yaw from north (-Z), SI units. */
export class TireDynamics {
  vx=0;vz=0;heading=0;yawRate=0;steerAngle=0;accelerationForward=0;
  forwardSpeed=0;slipFront=0;slipRear=0;frontLoad=0;rearLoad=0;
  constructor(readonly spec:CarSpecification,readonly assists:CarAssists) {}
  reset(heading:number) {
    this.stop();this.heading=heading*Math.PI/180;this.steerAngle=0;
    this.frontLoad=this.spec.mass*9.81*this.spec.rearAxle/(this.spec.frontAxle+this.spec.rearAxle);
    this.rearLoad=this.spec.mass*9.81-this.frontLoad;
  }
  stop(){this.vx=this.vz=this.yawRate=this.forwardSpeed=this.accelerationForward=0;}
  get speed(){return Math.hypot(this.vx,this.vz);}
  get lateralSpeed(){return Math.cos(this.heading)*this.vx+Math.sin(this.heading)*this.vz;}
  step(input:TireInput,dt:number,airborne=false,grade=0) {
    if(!Number.isFinite(dt)||dt<=0||dt>.25||![input.drive,input.steer,input.boost,grade].every(Number.isFinite))throw new RangeError('Invalid car integration input');
    const c=this.spec,a=this.assists,sn=Math.sin(this.heading),cs=Math.cos(this.heading);
    const u=sn*this.vx-cs*this.vz,v=cs*this.vx+sn*this.vz,base=c.frontAxle+c.rearAxle;
    const cornerAcceleration=a.lateralAcceleration+.55*Math.min(Math.abs(u),c.cornerSpeedCap??35)+(c.highSpeedCorner??0)*Math.max(0,Math.abs(u)-30);
    const safeSteer=input.handbrake?(c.driveAxle==='rear'?.45:.28):Math.min(.65,Math.atan2(cornerAcceleration*base,Math.max(u*u,1)))*c.steeringGain;
    this.steerAngle+=(clamp(input.steer,-1,1)*safeSteer-this.steerAngle)*(1-Math.exp(-dt*c.steeringGain/a.steeringTime));
    const transfer=c.weightTransfer*clamp(this.accelerationForward,-35,35)*c.cgHeight/base;
    this.frontLoad=c.mass*clamp(c.rearAxle/base*9.81-transfer,.5,9.31);this.rearLoad=c.mass*9.81-this.frontLoad;
    const direction=Math.sign(u)||Math.sign(input.drive);
    this.slipFront=Math.atan2(v+c.frontAxle*this.yawRate,Math.max(.5,Math.abs(u)))-direction*this.steerAngle;
    this.slipRear=Math.atan2(v-c.rearAxle*this.yawRate,Math.max(.5,Math.abs(u)));
    // Arcade launch assistance prevents a full nitro charge being wasted at the tire traction ceiling.
    const gripBoost=input.boost>1?a.nitroGrip:1;
    const frontGrip=c.grip*this.frontLoad*gripBoost,rearGrip=c.grip*this.rearLoad*gripBoost*(input.handbrake?c.lockGrip:1);
    const drive=clamp(input.drive,-1,1),braking=drive*u<-.2;
    const capacity=(c.driveAxle==='front'?frontGrip:rearGrip)*a.tractionControl;
    const requested=(braking?0:drive*c.engineForce*input.boost)/(1+Math.abs(u)/35);
    const traction=airborne?0:clamp(requested,-capacity,capacity);
    let fyFront=clamp(-c.cornerFront*this.slipFront*this.frontLoad,-frontGrip,frontGrip);
    let fyRear=clamp(-c.cornerRear*this.slipRear*this.rearLoad,-rearGrip,rearGrip);
    // Friction circle leaves lateral grip available under powered FWD/RWD acceleration.
    const drivenLimit=Math.sqrt(Math.max(0,capacity*capacity/(a.tractionControl*a.tractionControl)-traction*traction));
    if(c.driveAxle==='front')fyFront=clamp(fyFront,-drivenLimit,drivenLimit);else fyRear=clamp(fyRear,-drivenLimit,drivenLimit);
    if(airborne)fyFront=fyRear=0;
    // Rear-wheel lock initiates a slide; the foot-brake boost would stop it before the turn.
    const brake=airborne?0:(braking?c.brakeForce*a.brakeBoost:0)+(input.handbrake?c.handbrakeForce:0);
    let fx=traction*(c.driveAxle==='front'?Math.cos(this.steerAngle):1)-brake*Math.sign(u)-c.rollingDrag*u-c.airDrag*u*Math.abs(u)-c.mass*9.81*Math.sin(grade);
    if(!drive&&!input.handbrake&&!airborne)fx-=c.mass*2.5*Math.sign(u);
    if(brake&&fx*u<0)fx=Math.sign(fx)*Math.min(Math.abs(fx),Math.abs(u)*c.mass/dt);
    const fy=fyFront*Math.cos(this.steerAngle)+fyRear+(c.driveAxle==='front'?traction*Math.sin(this.steerAngle):0)-c.rollingDrag*v-c.airDrag*v*Math.abs(v);
    if(!drive&&Math.abs(u)<.5)fx=-u*c.mass/dt;
    this.accelerationForward=fx/c.mass;
    this.vx+=(sn*fx+cs*fy)/c.mass*dt;this.vz+=(-cs*fx+sn*fy)/c.mass*dt;
    const torque=(fyFront*Math.cos(this.steerAngle)+(c.driveAxle==='front'?traction*Math.sin(this.steerAngle):0))*c.frontAxle-fyRear*c.rearAxle;
    this.yawRate=clamp((this.yawRate+torque/(c.mass*c.inertiaScale)*dt)*Math.exp(-a.yawDamping*dt),-2.2,2.2);
    if(!airborne&&!input.handbrake) {
      // Arcade yaw follows wheel angle even when full throttle consumes the driven tires' grip.
      const target=clamp(u/base*Math.tan(this.steerAngle),-2.2*c.steeringGain,2.2*c.steeringGain);
      this.yawRate+=(target-this.yawRate)*(1-Math.exp(-dt*a.yawResponse));
    }
    if(this.speed<.5&&(!drive||input.handbrake)){this.stop();return;}
    this.heading+=this.yawRate*dt;
    if(!airborne) {
      // Redirect velocity without adding energy; the handbrake retains a wider, recoverable slide.
      const speed=this.speed,sn=Math.sin(this.heading),cs=Math.cos(this.heading);
      const side=(cs*this.vx+sn*this.vz)*Math.exp(-dt*a.gripResponse*(input.handbrake?.15:1));
      const direction=Math.sign(sn*this.vx-cs*this.vz)||Math.sign(u)||Math.sign(drive)||1;
      const forward=direction*Math.sqrt(Math.max(0,speed*speed-side*side));
      this.vx=sn*forward+cs*side;this.vz=-cs*forward+sn*side;
    }
    this.forwardSpeed=Math.sin(this.heading)*this.vx-Math.cos(this.heading)*this.vz;
    const limited=clamp(this.forwardSpeed,-12,c.maximumSpeed),correction=limited-this.forwardSpeed;
    this.vx+=Math.sin(this.heading)*correction;this.vz-=Math.cos(this.heading)*correction;this.forwardSpeed=limited;
  }
}
