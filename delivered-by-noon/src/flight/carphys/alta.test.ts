import { expect, it } from 'vitest';
import { CAR_ASSISTS } from '../car';
import { COUPE, TireDynamics, type CarSpecification } from './model';

const dt=1/120,degrees=180/Math.PI;
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
// Measured on the unmodified model with this same rig (radius in metres at 30/60/90kmh).
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
it('tuned coupe still turns at high speed without spinning',()=>{
  // Antes do ajuste (2026-11-22): 42,8 m a 150 km/h e 61,7 m a 180 km/h.
  const r150=circle(COUPE,150),r180=circle(COUPE,180);
  expect(r150.radius).toBeLessThan(38);expect(r180.radius).toBeLessThan(47);
  expect(r180.slip).toBeLessThan(8);expect(r180.speed).toBeGreaterThan(170);
});
