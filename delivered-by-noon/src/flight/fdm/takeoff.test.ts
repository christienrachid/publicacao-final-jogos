import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { BoundingBox, Entity, KEY_CONTROL, KEY_S, KEY_SHIFT, KEY_W, Vec3 } from 'playcanvas';
import { getBounds, Logger, NodeIO, Verbosity } from '@gltf-transform/core';
import { bindSceneAirplane } from '../airplane';
import { createFlightController } from '../flight';
import { AIRPORT, createWorldPhysics } from '../world-data';
import { createFlightState, type FlightContext } from '../types';

let bounds:BoundingBox;
beforeAll(async()=>{
  const doc=await new NodeIO().setLogger(new Logger(Verbosity.ERROR)).read('public/models/a29.glb');
  const b=getBounds(doc.getRoot().listScenes()[0]);
  bounds=new BoundingBox(new Vec3(...b.min.map((v,i)=>(v+b.max[i])/2)),new Vec3(...b.max.map((v,i)=>(v-b.min[i])/2)));
});
afterEach(()=>vi.unstubAllGlobals());
function parked(mouse=false,flying=false) {
  const keys=new Set<number>(),state=createFlightState(),canvas={};state.vehicle='a29';state.controlMode=mouse?'mouse':'keyboard';
  const app={graphicsDevice:{canvas},keyboard:{isPressed:(key:number)=>keys.has(key),wasPressed:()=>false}} as unknown as FlightContext['app'];
  const root=new Entity('A29',app);
  Object.assign(root,{render:{enabled:true,meshInstances:[{node:root,mesh:{aabb:bounds}}]}});
  const {model,cleanup}=bindSceneAirplane(app,root);
  const world=createWorldPhysics();
  const ctx={app,state,world,plane:model} as unknown as FlightContext;
  const module=createFlightController(ctx,{id:'a29-pista',kind:'a29',x:AIRPORT.x,y:AIRPORT.y+(flying?6:0),z:AIRPORT.z,heading:AIRPORT.heading,...(flying?{speed:50}:{})});
  const h=AIRPORT.heading*Math.PI/180;
  Object.assign(state,{aimX:Math.sin(h),aimY:0,aimZ:-Math.cos(h)});
  if(mouse)vi.stubGlobal('document',{pointerLockElement:canvas});
  return {state,keys,module,world,destroy:()=>{cleanup();root.destroy();}};
}
it.each([false,true])('takes off with Shift using the actual GLB hitbox (mouse=%s)',mouse=>{
  const s=parked(mouse);s.keys.add(KEY_SHIFT);
  try {
    for(let i=0;i<10*120;i++){s.module.update(1/120);expect(s.state.crashed,JSON.stringify(s.state)).toBe(false);}
    expect(s.state.speed).toBeGreaterThan(38);expect(s.state.heightAboveGround).toBeGreaterThan(5);
  } finally {s.destroy();}
});
it.each([KEY_W,KEY_S])('does not accelerate on the runway with pitch key %s',key=>{
  const s=parked();s.keys.add(key);
  try {
    for(let i=0;i<120;i++)s.module.update(1/120);
    expect(s.state.throttle).toBe(0);expect(s.state.speed).toBe(0);expect(s.state.crashed).toBe(false);
    s.keys.clear();s.keys.add(KEY_SHIFT);for(let i=0;i<120;i++)s.module.update(1/120);
    s.keys.clear();s.keys.add(key);for(let i=0;i<60;i++)s.module.update(1/120);
    expect(s.state.throttle).toBeCloseTo(.5,5);
  } finally {s.destroy();}
});
it('uses Shift/Ctrl to increase/reduce runway throttle at the same rate as flight',()=>{
  const s=parked();
  try {
    s.keys.add(KEY_SHIFT);for(let i=0;i<120;i++)s.module.update(1/120);
    expect(s.state.throttle).toBeCloseTo(.5,5);
    s.keys.clear();s.keys.add(KEY_CONTROL);for(let i=0;i<60;i++)s.module.update(1/120);
    expect(s.state.throttle).toBeCloseTo(.25,5);expect(s.state.crashed).toBe(false);
  } finally {s.destroy();}
});
it('keeps held W parked instead of accelerating and diving into the runway after liftoff',()=>{
  const s=parked();s.keys.add(KEY_W);
  try {
    let time=0;
    while(time<12&&!s.state.crashed){s.module.update(1/120);time+=1/120;}
    expect(s.state.crashed).toBe(false);expect(s.state.speed).toBe(0);expect(s.state.throttle).toBe(0);
  } finally {s.destroy();}
});
it('lands the actual GLB gently and rolls to a stop with Ctrl instead of automatically taking off again',()=>{
  const s=parked(false,true),pitch=s.state.pitch-1.5;let landed=false;
  try {
    for(let i=0;i<10*120;i++) {
      s.keys.clear();s.keys.add(KEY_CONTROL);
      if(!landed) {
        if(s.state.pitch>pitch+.5)s.keys.add(KEY_W);
        if(s.state.pitch<pitch-.5)s.keys.add(KEY_S);
      }
      s.module.update(1/120);
      expect(s.state.crashed,JSON.stringify(s.state)).toBe(false);
      if(s.state.heightAboveGround<=.11)landed=true;
    }
    expect(landed).toBe(true);expect(s.state.heightAboveGround).toBeLessThan(.11);expect(s.state.speed).toBe(0);
  } finally {s.destroy();}
});
it('still crashes on an actual nose-down ground impact with the loaded GLB',()=>{
  const s=parked(false,true);s.keys.add(KEY_W);
  try {
    for(let i=0;i<4*120&&!s.state.crashed;i++)s.module.update(1/120);
    expect(s.state.crashed).toBe(true);
  } finally {s.destroy();}
});
