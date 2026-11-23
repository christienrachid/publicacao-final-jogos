import { expect, it } from 'vitest';
import { CAR_ASSISTS } from '../car';
import { COUPE, HATCH, TireDynamics, type CarSpecification } from './model';

const dt=1/120,degrees=180/Math.PI;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
// Measured on the unmodified model with this same rig (radius in metres at 30/60/90kmh).
const before={hatch:{radii:[5.0374,19.1872,48.6176],powered:[4.5426,21.5993,53.0331],corner:1.4},
  tuned:{radii:[4.9574,18.2623,43.5408],powered:[3.8703,14.1576,55.8639],corner:1.375}};
function moving(spec:CarSpecification,kmh:number) {
  const car=new TireDynamics(spec,CAR_ASSISTS);car.reset(0);car.vz=-kmh/3.6;car.forwardSpeed=kmh/3.6;return car;
}
function circle(spec:CarSpecification,kmh:number,powered=false) {
  const car=moving(spec,kmh),speed=kmh/3.6;
  let length=0,angle=0,previous=0,slip=0;
  for(let i=0;i<8/dt;i++) {
    // Constant-speed rig preserves direction/slip while isolating full-throttle tire loading.
    if(powered){car.vx*=speed/car.speed;car.vz*=speed/car.speed;}
    car.step({drive:powered?1:clamp(.1+(speed-car.speed)*.7,0,1),steer:1,handbrake:false,boost:1},dt);
    const course=Math.atan2(car.vx,-car.vz),delta=Math.atan2(Math.sin(course-previous),Math.cos(course-previous));
    previous=course;
    if(i>3/dt){length+=car.speed*dt;angle+=delta;slip=Math.max(slip,Math.abs(Math.atan2(car.lateralSpeed,car.forwardSpeed))*degrees);}
  }
  return {radius:length/Math.abs(angle),slip,speed:car.speed*3.6};
}
function corner(spec:CarSpecification) {
  const car=moving(spec,40);let time=0,minSpeed=40,slip=0;
  while(time<5&&Math.atan2(car.vx,-car.vz)<Math.PI/2) {
    car.step({drive:clamp(.1+(40/3.6-car.speed)*.7,0,1),steer:1,handbrake:false,boost:1},dt);time+=dt;
    minSpeed=Math.min(minSpeed,car.speed*3.6);slip=Math.max(slip,Math.abs(Math.atan2(car.lateralSpeed,car.forwardSpeed))*degrees);
  }
  return {seconds:time,minKmh:minSpeed,slip};
}
it('measures constant-speed turning radius, 40kmh corner and stability for both cars',()=>{
  const results=[];
  for(const [name,spec] of [['hatch',HATCH],['tuned',COUPE]] as const) {
    const radii=[30,60,90].map(kmh=>circle(spec,kmh)),turn=corner(spec);
    const powered=[30,60,90].map(kmh=>circle(spec,kmh,true));
    console.log('CURVA',name,JSON.stringify({before:before[name],after:{radii,powered,corner:turn}}));
    radii.forEach((v,i)=>{
      expect(v.radius).toBeGreaterThan([3,8,16][i]);expect(v.radius).toBeLessThan([5,13,25][i]);
      expect(v.slip).toBeLessThan(8);expect(Math.abs(v.speed-[30,60,90][i])).toBeLessThan(1);
      expect(powered[i].radius).toBeLessThan(v.radius*1.15);expect(powered[i].slip).toBeLessThan(8);
      if(i>0)expect(v.radius).toBeLessThan(before[name].radii[i]*.65);
    });
    expect(turn.seconds).toBeLessThan(before[name].corner*.75);expect(turn.minKmh).toBeGreaterThanOrEqual(36);expect(turn.slip).toBeLessThan(5);
    results.push({radii,turn});
  }
  for(let i=0;i<3;i++)expect(results[1].radii[i].radius).toBeLessThan(results[0].radii[i].radius*.9);
  expect(results[1].turn.seconds).toBeLessThan(results[0].turn.seconds);
});

it('settles steering quickly, remains calm at speed and does not spin on throttle lift',()=>{
  for(const spec of [HATCH,COUPE])for(const kmh of [30,60,90]) {
    const car=moving(spec,kmh);
    for(let i=0;i<1/dt;i++)car.step({drive:1,steer:.7,handbrake:false,boost:1},dt);
    const release=car.heading;let maxSlip=0;
    for(let i=0;i<2/dt;i++) {
      car.step({drive:0,steer:0,handbrake:false,boost:1},dt);
      maxSlip=Math.max(maxSlip,Math.abs(Math.atan2(car.lateralSpeed,car.forwardSpeed))*degrees);
    }
    console.log('LIFT',spec.driveAxle,kmh,JSON.stringify({extraYaw:(car.heading-release)*degrees,maxSlip,yawRate:car.yawRate}));
    expect(Math.abs(car.heading-release)*degrees).toBeLessThan(20);expect(maxSlip).toBeLessThan(10);expect(Math.abs(car.yawRate)).toBeLessThan(.02);
    const response=moving(spec,kmh);
    for(let i=0;i<.2/dt;i++)response.step({drive:.1,steer:1,handbrake:false,boost:1},dt);
    expect(response.yawRate).toBeGreaterThan(.5);expect(response.yawRate).toBeLessThan(2.6);
    const held=moving(spec,kmh);
    for(let i=0;i<1/dt;i++)held.step({drive:1,steer:.7,handbrake:false,boost:1},dt);
    for(let i=0;i<2/dt;i++) {
      held.step({drive:0,steer:.7,handbrake:false,boost:1},dt);
      expect(Math.abs(Math.atan2(held.lateralSpeed,held.forwardSpeed))*degrees).toBeLessThan(8);
      expect(held.forwardSpeed).toBeGreaterThan(0);
    }
  }
});

it('keeps a handbrake slide visible and recovers grip after release without reversing course',()=>{
  for(const spec of [HATCH,COUPE]) {
    const car=moving(spec,60);let slip=0;
    for(let i=0;i<.6/dt;i++) {
      car.step({drive:0,steer:1,handbrake:true,boost:1},dt);
      if(car.speed>3)slip=Math.max(slip,Math.abs(Math.atan2(car.lateralSpeed,car.forwardSpeed))*degrees);
    }
    const release=car.heading;
    for(let i=0;i<1.5/dt;i++)car.step({drive:.3,steer:0,handbrake:false,boost:1},dt);
    console.log('HANDBRAKE',spec.driveAxle,JSON.stringify({peakSlip:slip,recoverySlip:Math.atan2(car.lateralSpeed,car.forwardSpeed)*degrees,extraYaw:(car.heading-release)*degrees}));
    expect(slip).toBeGreaterThan(5);expect(slip).toBeLessThan(45);
    expect(car.forwardSpeed).toBeGreaterThan(1);expect(Math.abs(car.lateralSpeed)).toBeLessThan(.2);expect(Math.abs(car.heading-release)*degrees).toBeLessThan(25);
  }
});

it('preserves speed when realigning a purely sideways body and leaves airborne momentum alone',()=>{
  const spec={...HATCH,cornerFront:0,cornerRear:0,airDrag:0,rollingDrag:0};
  for(const airborne of [false,true]) {
    const car=moving(spec,30);car.vx=10;car.vz=0;
    car.step({drive:0,steer:0,handbrake:false,boost:1},dt,airborne);
    expect(car.speed).toBeCloseTo(10,10);
    if(airborne){expect(car.vx).toBe(10);expect(car.vz).toBe(0);}else expect(car.vz).toBeLessThan(0);
  }
});
