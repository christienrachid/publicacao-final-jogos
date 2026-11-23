import { expect, it, vi } from 'vitest';
import { Vec3, Entity, KEY_W, KEY_R, KEY_SHIFT, KEY_D, KEY_Q } from 'playcanvas';
import { HeliDynamics } from './heli';
import { AircraftGround, RUNWAY_SPAWN, safeTouchdown } from './ground';
import { FlightDynamics, FIXED_STEP } from './model';
import { AIRPORT, HANGAR, createWorldPhysics } from '../world-data';
import { createFlightController } from '../flight';
import { createFlightState, type FlightContext } from '../types';
const controls={forward:0,right:0,yaw:0,collective:0};
const tick=(seconds:number,step:()=>void)=>{for(let i=0;i<seconds/FIXED_STEP;i++)step();};

it('hovers 30 seconds with <2m drift, moves forward >20m/s in 3s and turns 180 degrees in 2s',()=>{
  const h=new HeliDynamics();h.reset(0,100,0,0);
  tick(30,()=>h.step(controls,()=>0,1.2));expect(h.position.distance(new Vec3(0,100,0))).toBeLessThan(2);
  tick(3,()=>h.step({...controls,forward:1},()=>0,1.2));expect(-h.velocity.z).toBeGreaterThan(20);const forwardSpeed=-h.velocity.z;
  h.reset(0,100,0,0);tick(2,()=>h.step({...controls,yaw:-1},()=>0,1.2));expect(h.heading).toBeCloseTo(180,5);
  console.log('Heli: hover drift=0m; forward after3s='+forwardSpeed+'; yaw after2s='+h.heading);
});

it('heli soft landing survives and hard or tilted impact crashes',()=>{
  const h=new HeliDynamics();h.reset(0,1.21,0,0);h.velocity.y=-2;
  h.step(controls,()=>0,1.2);expect(h.grounded).toBe(true);expect(h.crashed).toBe(false);
  // Toque leve inclinado durante decolagem/pouso (até ~60°) apenas apoia/escorrega, sem explodir
  h.reset(0,1.21,0,0);h.roll=22;h.pitch=-18;h.velocity.y=-3.5;
  h.step(controls,()=>0,1.2);expect(h.crashed).toBe(false);
  // Queda forte a 10 m/s explode
  h.reset(0,1.21,0,0);h.velocity.y=-10;h.step(controls,()=>0,1.2);expect(h.crashed).toBe(true);
  // Inclinação extrema (> 60°) explode
  h.reset(0,1.21,0,0);h.roll=65;h.velocity.y=-2;h.step(controls,()=>0,1.2);expect(h.crashed).toBe(true);
});

it('heli controller takes off with forward tilt and lands gently without exploding, but crashes on a 10 m/s drop',()=>{
  const pressed=new Set<number>();
  const state=createFlightState();state.vehicle='heli';state.controlMode='keyboard';
  const app={keyboard:{isPressed:(k:number)=>pressed.has(k),wasPressed:()=>false}} as unknown as FlightContext['app'];
  const hitbox:[number,number,number][]=[[-1.3,0,-1.8],[1.3,0,-1.8],[-1.3,0,1.3],[1.3,0,1.3],[0,2.6,0]];
  const ctx={app,state,world:createWorldPhysics([],10),plane:{root:new Entity('heli',app),prop:new Entity('prop',app),hitbox}} as unknown as FlightContext;
  const module=createFlightController(ctx,{id:'heli-pad',kind:'heli',x:0,y:10.1,z:0,heading:0});

  // Decola inclinando para frente (W + Shift): esquis raspam na laje sem explodir
  pressed.add(KEY_SHIFT);pressed.add(KEY_W);
  for(let i=0;i<90;i++){module.update(1/60);expect(state.crashed).toBe(false);}
  expect(state.y).toBeGreaterThan(12);

  // Pousa devagar soltando o coletivo e descendo suavemente
  pressed.clear();
  for(let i=0;i<30;i++){module.update(1/60);expect(state.crashed).toBe(false);}

  // Queda brusca a ~10 m/s explode ao atingir o chão
  const fall=new HeliDynamics();
  fall.reset(0,12,0,0);fall.velocity.y=-10;
  for(let i=0;i<30&&!fall.crashed;i++)fall.step(controls,()=>10,0.1);
  expect(fall.crashed).toBe(true);
});

it('A29 taxis, takes off naturally and touches down softly on runway but crashes on hard/off-runway impact',()=>{
  const world=createWorldPhysics([]),fdm=new FlightDynamics(),ground=new AircraftGround(world.groundAt,1.65);
  const s=RUNWAY_SPAWN;fdm.reset(s.x,s.y+1.65,s.z,0,.1,0);ground.park(fdm,0);
  const input={pitch:0,roll:0,yaw:0,throttle:1};
  let time=0;while(ground.grounded&&time<10){ground.step(fdm,input,false);time+=FIXED_STEP;}
  expect(time).toBeLessThan(10);expect(ground.grounded).toBe(false);expect(fdm.speed).toBeGreaterThan(37);
  tick(1,()=>{ground.step(fdm,input,false);fdm.step({...input,pitch:.05});});
  expect(fdm.position.y).toBeGreaterThan(s.y+3);
  fdm.reset(s.x,s.y+1.64,0,0,50,.2);fdm.worldVelocity.set(0,-2,-50);
  ground.contact(fdm,0,2,s.y);expect(ground.grounded).toBe(true);expect(ground.crashed).toBe(false);
  expect(fdm.position.y).toBeCloseTo(s.y+1.65);
  ground.grounded=false;fdm.worldVelocity.y=-8;ground.contact(fdm,0,0,s.y);expect(ground.crashed).toBe(true);
  expect(safeTouchdown(-2,0,0,false,50)).toBe(false);
  expect(safeTouchdown(-2,20,0,true,50)).toBe(false);
  console.log('A29 takeoff: '+time.toFixed(2)+'s, speed='+fdm.speed.toFixed(1));
});


it('does not mistake entering a building sideways for a heli landing',()=>{
  const h=new HeliDynamics();h.reset(0,10,0,90);h.velocity.x=10;
  h.step(controls,x=>x>0?100:0,1.2);
  expect(h.crashed).toBe(true);expect(h.position.y).toBeLessThan(20);
});

it('flies the full A29 controller from a runway spawn without disabling the model',()=>{
  const state=createFlightState(),pressed=new Set([KEY_SHIFT]);state.controlMode='keyboard';
  const app={keyboard:{isPressed:(key:number)=>pressed.has(key),wasPressed:()=>false}} as unknown as FlightContext['app'];
  const root=new Entity('plane',app);
  const ctx={app,state,world:createWorldPhysics([]),plane:{root,prop:new Entity('prop',app),hitbox:[[-5,0,0],[5,0,0],[0,-1.65,0]]}} as unknown as FlightContext;
  const spawn={...RUNWAY_SPAWN,id:'test',kind:'a29' as const};
  const module=createFlightController(ctx,spawn);
  let seconds=0;
  while(state.heightAboveGround<3&&seconds<8){module.update(1/60);seconds+=1/60;expect(state.crashed).toBe(false);}
  pressed.clear();expect(seconds).toBeLessThan(8);expect(state.speed).toBeGreaterThan(37);
  for(let i=0;i<60;i++)module.update(1/60);
  expect(state.crashed).toBe(false);expect(state.y).toBeGreaterThan(spawn.y+3);
});


it('checks every A29 contact before accepting wheel landing, independent of hitbox ordering',()=>{
  for(const hitbox of [[[0,-1.65,0],[5,0,0]],[[5,0,0],[0,-1.65,0]]]) {
    const state=createFlightState();state.controlMode='keyboard';
    const app={keyboard:{isPressed:()=>false,wasPressed:()=>false}} as unknown as FlightContext['app'];
    const ctx={app,state,world:{groundAt:(x:number)=>x>4?50:4.05,isRunway:()=>true},plane:{root:new Entity('plane',app),prop:new Entity('prop',app),hitbox}} as unknown as FlightContext;
    const module=createFlightController(ctx,{id:'test',kind:'a29',x:0,y:4.05,z:0,heading:0});
    module.update(1/60);expect(state.crashed).toBe(true);
  }
});


it('starts at a parked aircraft pose but resets to its immutable runway/helipad anchor',()=>{
  for(const kind of ['a29','heli'] as const) {
    let reset=false;
    const state=createFlightState();state.vehicle=kind;state.controlMode='keyboard';
    const app={keyboard:{isPressed:()=>false,wasPressed:(key:number)=>reset&&key===KEY_R}} as unknown as FlightContext['app'];
    const ctx={app,state,world:createWorldPhysics([]),plane:{root:new Entity('plane',app),prop:new Entity('prop',app),hitbox:[[0,-1,0]]}} as unknown as FlightContext;
    const home={...RUNWAY_SPAWN,kind,id:'test'},parked={...home,x:home.x+5};
    const module=createFlightController(ctx,parked,home);
    expect(state.x).toBe(parked.x);parked.x=2000;home.x=2100;reset=true;module.update(1/60);
    expect(state.x).toBe(RUNWAY_SPAWN.x);
  }
});

it('heli ignores mouse mode/aim even with pointer lock and keeps full keyboard control',()=>{
  const canvas={},pressed=new Set<number>();
  const simulator=(mode:'mouse'|'keyboard')=>{
    const state=createFlightState();state.vehicle='heli';state.controlMode=mode;state.aimX=1;state.aimY=.7;state.aimZ=1;
    const app={graphicsDevice:{canvas},keyboard:{isPressed:(key:number)=>pressed.has(key),wasPressed:()=>false}} as unknown as FlightContext['app'];
    const ctx={app,state,world:createWorldPhysics([]),plane:{root:new Entity('heli',app),prop:new Entity('prop',app),hitbox:[[0,-1,0]]}} as unknown as FlightContext;
    return {state,module:createFlightController(ctx)};
  };
  vi.stubGlobal('document',{pointerLockElement:canvas});
  try {
    const mouse=simulator('mouse'),keyboard=simulator('keyboard');
    for(let i=0;i<60;i++){mouse.module.update(1/60);keyboard.module.update(1/60);}
    expect(mouse.state.speed).toBe(0);expect(mouse.state.heading).toBe(0);expect(mouse.state.throttle).toBe(.5);
    for(const key of [KEY_W,KEY_D,KEY_Q,KEY_SHIFT])pressed.add(key);
    for(let i=0;i<120;i++){mouse.state.aimY=Math.sin(i);mouse.module.update(1/60);keyboard.module.update(1/60);}
    for(const field of ['x','y','z','heading','pitch','roll','speed','verticalSpeed','throttle'] as const)expect(mouse.state[field]).toBeCloseTo(keyboard.state[field],10);
    expect(mouse.state.speed).toBeGreaterThan(20);expect(mouse.state.throttle).toBe(1);
  } finally {vi.unstubAllGlobals();}
});

it('taxies through the hangar opening below the roof',()=>{
  const state=createFlightState();state.controlMode='keyboard';
  const app={keyboard:{isPressed:(key:number)=>key===KEY_SHIFT,wasPressed:()=>false}} as unknown as FlightContext['app'];
  const ctx={app,state,world:createWorldPhysics(),plane:{root:new Entity('plane',app),prop:new Entity('prop',app),hitbox:[[0,-1.65,0],[2,0,0],[-2,0,0]]}} as unknown as FlightContext;
  const module=createFlightController(ctx,{id:'hangar',kind:'a29',x:(HANGAR.x0+HANGAR.x1)/2,y:AIRPORT.y,z:HANGAR.z1-7,heading:0});
  for(let i=0;i<120;i++){module.update(1/60);expect(state.crashed).toBe(false);}
  expect(state.z).toBeLessThan(HANGAR.z1-10);expect(state.y).toBeLessThan(AIRPORT.y+3);
});


it('recalibrates a parked heli when the asynchronous GLB hitbox grows before its first frame',()=>{
  const state=createFlightState();state.vehicle='heli';state.controlMode='keyboard';
  const app={keyboard:{isPressed:()=>false,wasPressed:()=>false}} as unknown as FlightContext['app'];
  const hitbox:[number,number,number][]=[[0,-.1,0]];
  const ctx={app,state,world:createWorldPhysics([]),plane:{root:new Entity('heli',app),prop:new Entity('prop',app),hitbox}} as unknown as FlightContext;
  const module=createFlightController(ctx,{...RUNWAY_SPAWN,id:'heli',kind:'heli'});
  hitbox[0]=[0,-2,0];module.update(1/60);
  expect(state.crashed).toBe(false);expect(state.y).toBeCloseTo(RUNWAY_SPAWN.y+2);
});
