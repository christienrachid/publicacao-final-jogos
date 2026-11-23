import { describe, expect, it, vi } from 'vitest';
import { Entity, KEY_E, KEY_R, KEY_W, type AppBase } from 'playcanvas';
import { createWorldPhysics, cityData, airportData, AIRPORT, HANGAR, terrainHeight } from './world-data';
import { CarDynamics } from './car';
import { FootDynamics } from './foot';
import { nearestVehicle, vehicleSpawns, createVehicleSystem } from './vehicles';
import { startMission, createMissionSystem, CLOCK_START_MINUTES } from './mission';
import { createMissionState, createFlightState, STAGE_ORDER, type FlightContext } from './types';

function presentationSimulator() {
  const keys=new Set<number>(),state=createFlightState();state.controlMode='keyboard';
  const app={keyboard:{isPressed:(key:number)=>keys.has(key),wasPressed:(key:number)=>keys.has(key)}} as unknown as FlightContext['app'];
  const root=new Entity('root',app),plane=new Entity('original',app);root.addChild(plane);Object.assign(app,{root});
  const ctx={app,state,mission:createMissionState(),camera:new Entity('camera',app),world:createWorldPhysics(),
    plane:{root:plane,prop:plane,exterior:[],materials:[],hitbox:[],wingTips:[plane,plane]}} as unknown as FlightContext;
  const system=createVehicleSystem(ctx);startMission(ctx);
  return {ctx,state,keys,system};
}

it.each(STAGE_ORDER)('presentation enters %s at its parked position or supplied pose, respecting mission locks',kind=>{
  const s=presentationSimulator();
  try {
    if(kind!=='car') {
      const before={...s.state};s.system.enterStageVehicle(kind,{x:20,y:1000,z:30,heading:90});
      expect(s.state).toEqual(before);expect(s.ctx.mission!.message).toContain('primeiro');
    }
    s.ctx.mission!.stage=kind;s.system.enterStageVehicle(kind);
    const parked=vehicleSpawns().find(p=>p.kind===kind)!;
    expect(s.state.vehicle).toBe(kind);expect(s.state.x).toBe(parked.x);expect(s.state.z).toBe(parked.z);
    expect(s.state.y).toBeCloseTo(s.ctx.world.groundAt(parked.x,parked.z)+(kind==='a29'||kind==='heli'?.1:0));
    s.system.enterStageVehicle(kind,{x:20,y:1000,z:30,heading:90,...(kind==='a29'?{speed:70}:{})});
    expect(s.state.vehicle).toBe(kind);expect(s.state.x).toBe(20);expect(s.state.y).toBe(1000);expect(s.state.z).toBe(30);expect(s.state.heading).toBeCloseTo(90);
    expect(s.ctx.plane.root.getPosition().y).toBe(1000);
    if(kind==='heli'){s.system.update(1/60);expect(s.state.y).toBeCloseTo(1000,1);expect(s.state.crashed).toBe(false);}
    startMission(s.ctx);expect(s.state.vehicle).toBe('car');expect(s.state.x).toBe(vehicleSpawns()[0].x);
  } finally {s.system.destroy?.();}
});

it('presentation A29 starts flying at the requested speed and R restores its runway parking',()=>{
  const s=presentationSimulator();
  try {
    s.ctx.mission!.stage='a29';s.system.enterStageVehicle('a29',{x:0,y:1000,z:0,heading:90,speed:70});
    expect(s.state.speed).toBeCloseTo(70);expect(s.state.throttle).toBe(.6);
    for(let i=0;i<60;i++)s.system.update(1/60);
    expect(s.state.x).toBeGreaterThan(60);expect(s.state.y).toBeGreaterThan(990);expect(s.state.crashed).toBe(false);
    s.keys.add(KEY_R);s.system.update(1/60);s.keys.clear();
    const home=vehicleSpawns().find(p=>p.kind==='a29')!;
    expect(s.state.x).toBe(home.x);expect(s.state.z).toBe(home.z);expect(s.state.speed).toBe(0);expect(s.state.throttle).toBe(0);
  } finally {s.system.destroy?.();}
});

vi.mock('./models',()=>({buildVehicleModel:(_app:unknown,kind:string,_variant:number,parent:Entity)=>{
  const root=new Entity(kind,_app as AppBase);parent.addChild(root);
  const prop=new Entity('prop',_app as AppBase);root.addChild(prop);
  return {root,prop,exterior:[],wingTips:[root,root],materials:[],hitbox:[[0,0,0],[0,2,0]]};
}}));
const obstacle={x0:4,x1:6,z0:-100,z1:100,top:30};
const tick=(seconds:number,step:()=>void)=>{for(let i=0;i<seconds*120;i++)step();};

describe('ground world and bodies',()=>{
  it('keeps runway flat, hangar doorway open, helipad supported and swept capsules outside walls',()=>{
    const city=cityData(),airport=airportData(city.helipad),world=createWorldPhysics([...city.boxes,...airport.boxes]);
    for(const z of [10,200,AIRPORT.z,700])expect(world.groundAt(AIRPORT.x,z)).toBeCloseTo(AIRPORT.y,8);
    expect(terrainHeight(AIRPORT.x,AIRPORT.z)).toBeCloseTo(AIRPORT.y-.05,8);
    expect(world.groundAt(city.helipad.x,city.helipad.z)).toBe(city.helipad.y);
    expect(world.obstacleAt((HANGAR.x0+HANGAR.x1)/2,HANGAR.z1-1,AIRPORT.y,.4,1.8)).toBeUndefined();
    expect(world.obstacleAt(HANGAR.x0+.5,265,AIRPORT.y,.4,1.8)).toBeDefined();
    const wall=createWorldPhysics([obstacle],3);
    const moved=wall.moveCapsule({x:0,y:3,z:0},100,0,.35,1.8);
    expect(moved.x).toBeLessThan(3.66);
    expect(wall.obstacleAt(5,0,31,.35,1.8)).toBeUndefined();
  });
  it('accelerates to arcade speed, brakes and reverses, and cannot tunnel through a building',()=>{
    const empty=createWorldPhysics([],3),car=new CarDynamics(empty);car.reset(0,3,0,90);
    tick(5,()=>car.step({drive:1,steer:0,handbrake:false},1/120));
    expect(car.speed).toBeGreaterThan(44);expect(car.x).toBeGreaterThan(100);
    tick(1.3,()=>car.step({drive:-1,steer:0,handbrake:false},1/120));
    expect(car.speed).toBeLessThan(5);
    tick(2,()=>car.step({drive:-1,steer:0,handbrake:false},1/120));expect(car.speed).toBeLessThan(-10);
    const blocked=new CarDynamics(createWorldPhysics([obstacle],3));blocked.reset(0,3,0,90);
    tick(5,()=>blocked.step({drive:1,steer:0,handbrake:false},1/120));expect(blocked.x).toBeLessThan(1.81);
    expect(blocked.roll).toBe(0);
  });
  it('walks/runs relative to camera, jumps once per press and slides against buildings',()=>{
    const foot=new FootDynamics(createWorldPhysics([obstacle],3));foot.reset(0,3,0,0);
    const input={forward:1,right:0,run:false,jump:false,heading:0};
    tick(1,()=>foot.step(input,1/120));expect(foot.z).toBeCloseTo(-4,2);
    tick(1,()=>foot.step({...input,run:true},1/120));expect(foot.z).toBeCloseTo(-12,2);
    foot.step({...input,forward:0,jump:true},1/120);expect(foot.verticalSpeed).toBeGreaterThan(5);
    tick(2,()=>foot.step({...input,forward:0,jump:true},1/120));expect(foot.y).toBeCloseTo(3,8);
    tick(5,()=>foot.step({...input,heading:90},1/120));expect(foot.x).toBeLessThan(3.66);
  });
  it('rejects uphill ground steeper than the car limit (0.55) but climbs a 0.30 ramp',()=>{
    const ramp=(slope:number)=>({x0:-10,x1:10,z0:-3,z1:3,top:slope*20,bottom:-1,ramp:{x0:-10,z0:0,x1:10,z1:0,y0:0,y1:slope*20}});
    const steep=createWorldPhysics([ramp(.8)],0),easy=createWorldPhysics([ramp(.3)],0);
    expect(steep.moveCapsule({x:-12,y:0,z:0},4,0,2.2,1.5,.55).x).toBeLessThan(-7);
    expect(easy.moveCapsule({x:-12,y:0,z:0},12,0,2.2,1.5,.55).x).toBeGreaterThan(-2);
  });
});

it('spawns an initial car, five variants, A29 and roof heli, with three-dimensional entry range',()=>{
  const spawns=vehicleSpawns();expect(spawns.filter(s=>s.kind==='car')).toHaveLength(6);
  expect(new Set(spawns.map(s=>s.id)).size).toBe(9);
  expect(new Set(spawns.filter(s=>s.id!=='car-inicial'&&s.kind==='car').map(s=>s.variant))).toEqual(new Set([0,1,2]));
  const first=spawns[0];
  expect(first.id).toBe('car-inicial');
  expect(nearestVehicle(spawns,first.x,first.y,first.z)?.id).toBe('car-inicial');
  expect(nearestVehicle(spawns,first.x,first.y+30,first.z)).toBeUndefined();
});

it('starts inside the car, exits/enters on E edge, refuses fast exit and retains a parked pose',()=>{
  const pressed=new Set<number>(),edges=new Set<number>(),state=createFlightState();state.controlMode='keyboard';
  const fakeApp={} as AppBase;
  const root=new Entity('root',fakeApp),planeRoot=new Entity('original',fakeApp);root.addChild(planeRoot);
  const ctx={app:{root,keyboard:{isPressed:(key:number)=>pressed.has(key),wasPressed:(key:number)=>edges.has(key)}},
    camera:new Entity('camera',fakeApp),state,world:createWorldPhysics(),plane:{root:planeRoot,prop:new Entity('prop',fakeApp),exterior:[],materials:[],hitbox:[],wingTips:[root,root]}} as unknown as FlightContext;
  const originalEnabled=planeRoot.enabled;
  const system=createVehicleSystem(ctx);
  expect(state.vehicle).toBe('car');expect(state.speed).toBe(0);
  edges.add(KEY_E);system.update(1/60);edges.clear();expect(state.vehicle).toBe('foot');
  system.update(1/60);expect(state.nearbyVehicleId).toBe('car-inicial');
  edges.add(KEY_E);system.update(1/60);edges.clear();expect(state.vehicle).toBe('car');
  pressed.add(KEY_W);for(let i=0;i<30;i++)system.update(1/60);
  edges.add(KEY_E);system.update(1/60);edges.clear();expect(state.vehicle).toBe('car');
  pressed.clear();for(let i=0;i<180;i++)system.update(1/60);
  const parkedX=state.x;edges.add(KEY_E);system.update(1/60);edges.clear();expect(state.vehicle).toBe('foot');
  system.update(1/60);edges.add(KEY_E);system.update(1/60);edges.clear();expect(state.vehicle).toBe('car');expect(state.x).toBeCloseTo(parkedX,1);
  system.destroy?.();system.destroy?.();expect(ctx.plane.root).toBe(planeRoot);expect(planeRoot.enabled).toBe(originalEnabled);
});


it('reaches the roof helipad on foot by the exterior ramp',()=>{
  const airport=airportData(),world=createWorldPhysics(),foot=new FootDynamics(world);
  const start=airport.access[0];foot.reset(start.x,start.y,start.z,0);
  for(const target of airport.access.slice(1)) {
    let frames=0;
    while(Math.hypot(target.x-foot.x,target.z-foot.z)>.06&&frames++<4000) {
      const heading=Math.atan2(target.x-foot.x,-(target.z-foot.z))*180/Math.PI;
      foot.step({forward:1,right:0,run:true,jump:false,heading},1/120);
    }
    expect(frames,JSON.stringify({target,x:foot.x,y:foot.y,z:foot.z})).toBeLessThan(4000);
    expect(foot.y).toBeCloseTo(target.y,0);
  }
  expect(foot.y).toBeCloseTo(airport.helipad.y,0);
});

it('keeps actual drift speed available while handbraking and contains ground bodies inside the map',()=>{
  const world=createWorldPhysics([],3),car=new CarDynamics(world);car.reset(0,3,0,0);
  // Start in a slide so exit safety does not depend on the current braking tune.
  car.chassis.vx=4;car.chassis.vz=-1;
  car.step({drive:0,steer:1,handbrake:true},1/120);
  expect(car.speed).toBeLessThan(2);expect(car.movementSpeed).toBeGreaterThan(2);
  const p=world.moveCapsule({x:2980,y:world.groundAt(2980,0),z:0},10,0,.35,1.8);
  expect(p.x).toBeLessThanOrEqual(2980);
});


it('mission restart resets the moving vehicle, parked poses and all mission progress',()=>{
  const keys=new Set<number>(),state=createFlightState();state.controlMode='keyboard';
  const app={keyboard:{isPressed:(key:number)=>keys.has(key),wasPressed:()=>false}} as unknown as FlightContext['app'];
  const root=new Entity('root',app),plane=new Entity('original',app);root.addChild(plane);
  Object.assign(app,{root});
  const ctx={app,state,mission:createMissionState(),camera:new Entity('camera',app),world:createWorldPhysics(),plane:{root:plane,prop:plane,exterior:[],materials:[],hitbox:[],wingTips:[plane,plane]}} as unknown as FlightContext;
  const vehicles=createVehicleSystem(ctx),mission=createMissionSystem(ctx);startMission(ctx);
  keys.add(KEY_W);for(let i=0;i<60;i++)vehicles.update(1/60);keys.clear();
  const home=vehicleSpawns()[0];
  expect(Math.hypot(state.x-home.x,state.z-home.z)).toBeGreaterThan(1);ctx.mission!.score=999;ctx.mission!.clockMinutes=120;
  startMission(ctx);expect(state.x).toBeCloseTo(home.x,5);expect(state.z).toBeCloseTo(home.z,5);expect(state.speed).toBe(0);expect(state.vehicle).toBe('car');
  expect(ctx.mission!.score).toBe(0);expect(ctx.mission!.clockMinutes).toBe(CLOCK_START_MINUTES);expect(ctx.mission!.delivered).toBe(0);
  mission.destroy?.();vehicles.destroy?.();
});
