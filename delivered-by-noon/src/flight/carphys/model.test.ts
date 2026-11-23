// Tests for the MIT carphysics2d port, Mike Linkovich / Marco Monster; see LICENSE-carphysics2d.txt.
import { expect, it } from 'vitest';
import { TireDynamics, HATCH, COUPE } from './model';
import { CAR_ASSISTS, CarDynamics } from '../car';
import { createWorldPhysics } from '../world-data';
const dt=1/120;
function run(car:TireDynamics,seconds:number,input={drive:1,steer:0,handbrake:false,boost:1}) {
  let distance=0;for(let i=0;i<seconds/dt;i++){car.step(input,dt);distance+=car.speed*dt;}return distance;
}
it('uses 1100kg FWD and 1350kg RWD, accelerates/brakes over bounded arcade distances and transfers weight',()=>{
  expect(HATCH.mass).toBe(1100);expect(HATCH.driveAxle).toBe('front');expect(COUPE.mass).toBe(1350);expect(COUPE.driveAxle).toBe('rear');
  const car=new TireDynamics(HATCH,CAR_ASSISTS);car.reset(0);const staticFront=car.frontLoad;
  const accelerationDistance=run(car,5);expect(car.forwardSpeed).toBe(45);expect(accelerationDistance).toBeGreaterThan(100);expect(accelerationDistance).toBeLessThan(190);
  expect(car.frontLoad).toBeLessThanOrEqual(staticFront+.1);
  let time=0,distance=0;while(car.forwardSpeed>.5&&time<5){car.step({drive:-1,steer:0,handbrake:false,boost:1},dt);time+=dt;distance+=car.speed*dt;}
  expect(time).toBeLessThan(1.5);expect(distance).toBeGreaterThan(10);expect(distance).toBeLessThan(50);
  console.log('Car metrics:',JSON.stringify({acceleration5s:accelerationDistance,brakingSeconds:time,brakingMetres:distance}));
});
it('corners with finite forces, bounded yaw and conserved axle load',()=>{
  const car=new TireDynamics(HATCH,CAR_ASSISTS);car.reset(0);run(car,2);
  run(car,5,{drive:.3,steer:.7,handbrake:false,boost:1});
  expect(Number.isFinite(car.heading+car.vx+car.vz+car.slipFront+car.slipRear)).toBe(true);
  expect(Math.abs(car.heading)).toBeGreaterThan(.2);expect(Math.abs(car.yawRate)).toBeLessThanOrEqual(2.2);
  expect(car.frontLoad+car.rearLoad).toBeCloseTo(HATCH.mass*9.81,8);
});
it('locks rear grip and produces visible RWD sideslip under the handbrake',()=>{
  const car=new TireDynamics(COUPE,CAR_ASSISTS);car.reset(0);run(car,5,{drive:1,steer:0,handbrake:false,boost:1.65});
  let slip=0,lateral=0;
  for(let i=0;i<120;i++){car.step({drive:0,steer:1,handbrake:true,boost:1},dt);slip=Math.max(slip,Math.abs(car.slipRear));lateral=Math.max(lateral,Math.abs(car.lateralSpeed));}
  console.log('Drift metrics:',JSON.stringify({slipRadians:slip,lateralSpeed:lateral}));
  expect(slip).toBeGreaterThan(.15);expect(lateral).toBeGreaterThan(3);
});
it('rejects nonfinite physics input',()=>{
  const car=new TireDynamics(HATCH,CAR_ASSISTS);car.reset(0);
  expect(()=>car.step({drive:NaN,steer:0,handbrake:false,boost:1},dt)).toThrow(RangeError);
});

it('nitro improves the launch instead of consuming its charge against an unchanged traction cap',()=>{
  const normal=new TireDynamics(COUPE,CAR_ASSISTS),boost=new TireDynamics(COUPE,CAR_ASSISTS);normal.reset(0);boost.reset(0);
  const a=run(normal,2.5),b=run(boost,2.5,{drive:1,steer:0,handbrake:false,boost:1.65});
  expect(boost.speed).toBeGreaterThan(normal.speed+2);expect(b).toBeGreaterThan(a+3);
  console.log('Nitro metrics:',JSON.stringify({normalSpeed:normal.speed,boostSpeed:boost.speed,normalDistance:a,boostDistance:b}));
});
it('publishes a compass heading in 0..360 even after multiple left turns',()=>{
  const car=new CarDynamics(createWorldPhysics([]));car.reset(0,3,0,0);car.chassis.heading=-20;
  car.step({drive:0,steer:0,handbrake:false},dt);expect(car.heading).toBeGreaterThanOrEqual(0);expect(car.heading).toBeLessThan(360);
});
