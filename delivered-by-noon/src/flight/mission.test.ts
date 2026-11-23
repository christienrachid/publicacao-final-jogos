import { afterEach, expect, it, vi } from 'vitest';
import { Entity, KEY_SPACE, KEY_SHIFT, KEY_W, KEY_D } from 'playcanvas';
import { canEnterVehicle, CLOCK_END_MINUTES, CLOCK_MINUTES_PER_SECOND, CLOCK_START_MINUTES, createMissionSystem, DAY_REAL_SECONDS, startMission } from './mission';
import { createFlightState, createMissionState, STAGE_ORDER, type DeliveryPoint, type FlightContext } from './types';
import { CarDynamics, createCarController, getCarNitro } from './car';
import { AIRPORT, HANGAR, createWorldPhysics } from './world-data';

afterEach(()=>vi.restoreAllMocks());
function setup() {
  const keys=new Set<number>(),state=createFlightState(),mission=createMissionState();
  const app={keyboard:{wasPressed:(key:number)=>keys.has(key)}} as unknown as FlightContext['app'];
  const root=new Entity('root',app),plane=new Entity('plane',app);root.addChild(plane);
  let ground=0;
  const ctx={app,state,mission,plane:{root:plane},world:{groundAt:()=>ground}} as unknown as FlightContext;
  const module=createMissionSystem(ctx);
  const at=(p:DeliveryPoint,height=0)=>Object.assign(state,{x:p.x,y:p.y+height,z:p.z,speed:0,verticalSpeed:0,heightAboveGround:height,crashed:false});
  const deliver=(p:DeliveryPoint)=>{
    state.vehicle=p.stage;at(p,p.airDrop?5:p.stage==='heli'?1:0);
    ground=p.y;
    if(p.airDrop){keys.add(KEY_SPACE);module.update(.01);keys.clear();for(let i=0;i<100&&!p.delivered;i++)module.update(.05);}
    else module.update(.01);
  };
  return {ctx,state,mission,module,keys,at,deliver,setGround:(y:number)=>{ground=y;}};
}

it('starts at 06:00, ignores invalid time, advances at constant scale and loses at 12:00',()=>{
  const s=setup();expect(s.mission.status).toBe('intro');s.module.update(100);expect(s.mission.clockMinutes).toBe(CLOCK_START_MINUTES);
  startMission(s.ctx);s.module.update(60);expect(s.mission.clockMinutes).toBeCloseTo(CLOCK_START_MINUTES+60*CLOCK_MINUTES_PER_SECOND);
  const clock=s.mission.clockMinutes;
  for(const dt of [0,-1,NaN,Infinity])s.module.update(dt);expect(s.mission.clockMinutes).toBe(clock);
  s.module.update(DAY_REAL_SECONDS);expect(s.mission.clockMinutes).toBe(CLOCK_END_MINUTES);expect(s.mission.status).toBe('lost');
  const score=s.mission.score;s.module.update(60);expect(s.mission.score).toBe(score);
});

it('counts a slow delivery inside the radius, not outside, airborne or at speed 8',()=>{
  const s=setup();startMission(s.ctx);const p=s.mission.deliveries[0];
  s.at(p);s.state.x+=p.radius+.1;s.module.update(.01);expect(p.delivered).toBe(false);
  s.at(p,4);s.module.update(.01);expect(p.delivered).toBe(false);
  s.at(p);s.state.speed=8;s.module.update(.01);expect(p.delivered).toBe(false);
  s.state.speed=7.99;s.state.x+=p.radius;s.module.update(.01);expect(p.delivered).toBe(true);
  expect(s.mission.delivered).toBe(1);expect(s.mission.score).toBeGreaterThan(100);
  s.module.update(.01);expect(s.mission.delivered).toBe(1);
});

it('loads only the available vehicle stage and highlights the closest pending delivery',()=>{
  const s=setup();startMission(s.ctx);const p=s.mission.deliveries[2];s.at(p);s.state.speed=12;s.module.update(.01);
  expect(s.mission.carrying).toBe('car');expect(s.mission.nextDeliveryId).toBe(p.id);
  s.state.vehicle='foot';s.module.update(.01);expect(s.mission.carrying).toBeNull();expect(s.mission.nextDeliveryId).toBeNull();
  s.state.vehicle='heli';s.module.update(.01);expect(s.mission.carrying).toBeNull();expect(canEnterVehicle(s.ctx,'heli')).toBe(false);
  expect(s.mission.message).toContain('carro primeiro');
});

it('unlocks stages in order, accepts hovering heli and wins only after all 16 deliveries',()=>{
  const s=setup();startMission(s.ctx);expect(s.mission.total).toBe(16);
  for(const stage of STAGE_ORDER) {
    expect(s.mission.stage).toBe(stage);expect(canEnterVehicle(s.ctx,stage)).toBe(true);
    for(const p of s.mission.deliveries.filter(p=>p.stage===stage))s.deliver(p);
  }
  expect(s.mission.delivered).toBe(16);expect(s.mission.status).toBe('won');expect(s.mission.clockMinutes).toBeGreaterThanOrEqual(CLOCK_START_MINUTES);expect(s.mission.clockMinutes).toBeLessThan(CLOCK_END_MINUTES);
  expect(s.mission.deliveries.every(p=>p.delivered)).toBe(true);
});

it('only accepts heli deliveries below ten metres above the destination',()=>{
  const s=setup();startMission(s.ctx);s.mission.stage='heli';s.state.vehicle='heli';
  const p=s.mission.deliveries.find(p=>p.stage==='heli')!;
  s.at(p,10);s.module.update(.01);expect(p.delivered).toBe(false);
  s.at(p,9.9);s.state.verticalSpeed=-10;s.module.update(.01);expect(p.delivered).toBe(false);
  s.state.verticalSpeed=0;s.state.heightAboveGround=20;s.module.update(.01);expect(p.delivered).toBe(false);
  s.state.heightAboveGround=9.9;s.module.update(.01);expect(p.delivered).toBe(true);
});

it('requires an actual falling box inside the airdrop radius and clears it on restart',()=>{
  const s=setup();startMission(s.ctx);s.mission.stage='a29';s.state.vehicle='a29';
  const p=s.mission.deliveries.find(p=>p.airDrop)!;s.setGround(p.y);s.at(p,5);
  s.module.update(1);expect(p.delivered).toBe(false);
  s.state.x+=p.radius+1;s.keys.add(KEY_SPACE);s.module.update(.01);s.keys.clear();s.module.update(2);expect(p.delivered).toBe(false);
  s.at(p,5);s.keys.add(KEY_SPACE);s.module.update(.01);s.keys.clear();s.module.update(2);expect(p.delivered).toBe(true);
  s.at(p,20);s.keys.add(KEY_SPACE);s.module.update(.01);s.keys.clear();startMission(s.ctx);
  s.module.update(3);expect(s.mission.delivered).toBe(0);expect(s.mission.score).toBe(0);expect(s.mission.stage).toBe('car');
});

it('creates a visible crate and releases its entity/material on destruction',()=>{
  const s=setup();startMission(s.ctx);s.mission.stage='a29';s.state.vehicle='a29';
  const app=s.ctx.app as unknown as {graphicsDevice:object;systems:{render:object}};
  app.graphicsDevice={};app.systems={render:{}};
  const add=vi.spyOn(Entity.prototype,'addComponent').mockImplementation(()=>null);
  s.at(s.mission.deliveries.find(p=>p.airDrop)!,100);s.keys.add(KEY_SPACE);s.module.update(.01);
  expect(add).toHaveBeenCalledWith('render',expect.objectContaining({type:'box'}));
  const parent=s.ctx.plane.root.parent!;expect(parent.children.some(e=>e.name==='Encomenda do almoço')).toBe(true);
  s.module.destroy?.();expect(parent.children.some(e=>e.name==='Encomenda do almoço')).toBe(false);
});

it('tuned car is faster and drains/refills nitro',()=>{
  const flat=createWorldPhysics([],3),normal=new CarDynamics(flat),tuned=new CarDynamics(flat,true);
  for(const car of [normal,tuned])car.reset(0,3,0,0);
  for(let i=0;i<600;i++)for(const car of [normal,tuned])car.step({drive:1,steer:0,handbrake:false,nitro:true},1/120);
  expect(tuned.speed).toBeCloseTo(65);expect(normal.speed).toBeCloseTo(45);expect(tuned.nitro).toBe(0);
  for(let i=0;i<120;i++)tuned.step({drive:0,steer:0,handbrake:false},1/120);expect(tuned.nitro).toBeGreaterThan(.17);
});


it('keeps each handoff delivery and the final city airdrop until the other three are complete',()=>{
  const s=setup();startMission(s.ctx);
  for(const stage of STAGE_ORDER) {
    s.mission.stage=stage;const points=s.mission.deliveries.filter(p=>p.stage===stage),last=points[3];
    s.deliver(last);expect(last.delivered).toBe(false);expect(s.mission.nextDeliveryId).not.toBe(last.id);
    for(const point of points.slice(0,3))s.deliver(point);
    s.deliver(last);expect(last.delivered).toBe(true);
  }
});


it('tuned jumps hit the real hangar ceiling and fall back below it instead of landing on top',()=>{
  const world=createWorldPhysics(),car=new CarDynamics(world,true),hx=(HANGAR.x0+HANGAR.x1)/2;
  car.reset(hx,AIRPORT.y+10.25,257.5,0);car.airborne=true;car.verticalSpeed=8;
  let maxY=car.y;
  for(let i=0;i<480;i++) {
    car.step({drive:0,steer:0,handbrake:false},1/120);maxY=Math.max(maxY,car.y);
  }
  expect(maxY).toBeLessThan(AIRPORT.y+10.45);expect(car.y).toBeCloseTo(AIRPORT.y);expect(car.airborne).toBe(false);
});


it('publishes the real tuned nitro to the HUD bridge and cleans it on destruction',()=>{
  const state=createFlightState();state.vehicle='tuned';state.controlMode='keyboard';state.y=3;
  const app={keyboard:{isPressed:(key:number)=>key===KEY_W||key===KEY_SHIFT}} as unknown as FlightContext['app'];
  const root=new Entity('tuned',app),world=createWorldPhysics([]);
  const ctx={app,state,world,plane:{root,wheels:[],hitbox:[]}} as unknown as FlightContext;
  const controller=createCarController(ctx,world);
  for(let i=0;i<120;i++)controller.update(1/120);
  expect(getCarNitro(state)).toBeCloseTo(.6,4);
  expect((state as typeof state&{nitro?:number}).nitro).toBe(getCarNitro(state));
  controller.destroy?.();expect((state as typeof state&{nitro?:number}).nitro).toBeUndefined();
});


it('car and tuned ignore mouse mode/aim and retain keyboard steering, throttle, nitro and brakes',()=>{
  for(const kind of ['car','tuned'] as const) {
    const pressed=new Set<number>();
    const simulator=(mode:'mouse'|'keyboard')=>{
      const state=createFlightState();state.vehicle=kind;state.controlMode=mode;state.y=3;state.aimX=1;state.aimZ=1;
      const app={keyboard:{isPressed:(key:number)=>pressed.has(key)}} as unknown as FlightContext['app'];
      const root=new Entity(kind,app),world=createWorldPhysics([]);
      const ctx={app,state,world,plane:{root,wheels:[],hitbox:[]}} as unknown as FlightContext;
      return {state,module:createCarController(ctx,world)};
    };
    const mouse=simulator('mouse'),keyboard=simulator('keyboard');
    for(let i=0;i<30;i++){mouse.module.update(1/60);keyboard.module.update(1/60);}
    expect(mouse.state.heading).toBe(0);
    for(const key of [KEY_W,KEY_D,KEY_SHIFT])pressed.add(key);
    for(let i=0;i<90;i++){mouse.state.aimX=Math.sin(i);mouse.state.aimZ=Math.cos(i);mouse.module.update(1/60);keyboard.module.update(1/60);}
    expect(mouse.state.speed).toBeGreaterThan(10);expect(mouse.state.heading).toBeGreaterThan(10);
    pressed.clear();pressed.add(KEY_SPACE);
    for(let i=0;i<60;i++){mouse.module.update(1/60);keyboard.module.update(1/60);}
    for(const field of ['x','y','z','heading','pitch','roll','speed','verticalSpeed','throttle'] as const)expect(mouse.state[field]).toBeCloseTo(keyboard.state[field],10);
    expect(getCarNitro(mouse.state)).toBe(getCarNitro(keyboard.state));
    mouse.module.destroy?.();keyboard.module.destroy?.();
  }
});
