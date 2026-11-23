import { Entity, KEY_E } from 'playcanvas';
import { buildVehicleModel, type VehicleModel } from './models';
import { extractHitboxFootprint, type HitboxFootprint } from './models/glb';
import { type CarCollider, createCarController } from './car';
import { createFootController } from './foot';
import { createFlightController } from './flight';
import { getTrafficObstacles } from './trafego';
import { AIRPORT, WORKSHOP, carSpots, cityData, createWorldPhysics, terrainHeight } from './world-data';
import { canEnterVehicle, onMissionRestart } from './mission';
import type { FlightContext, FlightModule, Stage, VehicleKind, VehicleSpawn } from './types';

type StagePose = { x:number; y:number; z:number; heading:number; speed?:number };

export function vehicleSpawns(): VehicleSpawn[] {
  const {helipad}=cityData();
  // Carros estacionados sobre vias reais do Centro de Juiz de Fora; o primeiro é onde o jogador começa.
  const cars:VehicleSpawn[]=carSpots().map((p,i)=>({id:i?`car-${i}`:'car-inicial',kind:'car' as const,x:p.x,y:terrainHeight(p.x,p.z),z:p.z,heading:Math.round(p.heading),variant:i%3}));
  return [...cars,{id:'tuned-oficina',kind:'tuned',x:WORKSHOP.x+3,y:WORKSHOP.y,z:WORKSHOP.z,heading:90,variant:2},{id:'a29-pista',kind:'a29',x:AIRPORT.x,y:AIRPORT.y,z:AIRPORT.z,heading:AIRPORT.heading},
    {id:'heli-centro',kind:'heli',x:helipad.x,y:helipad.y,z:helipad.z,heading:0}];
}

export function nearestVehicle(spawns:VehicleSpawn[],x:number,y:number,z:number) {
  let nearest:VehicleSpawn|undefined,distance=Infinity;
  for(const spawn of spawns) {
    const d=Math.hypot(spawn.x-x,spawn.y-y,spawn.z-z),range=spawn.kind==='car'||spawn.kind==='tuned'?4:8;
    if(d<=range&&d<distance){nearest=spawn;distance=d;}
  }
  return nearest;
}

/** Replaces createFlightController(ctx) in game.ts; owns all movement and vehicle models. */
export function createVehicleSystem(ctx:FlightContext):FlightModule & {enterStageVehicle(kind:Stage,pose?:StagePose):void} {
  const {app,state}=ctx;
  const physics={...createWorldPhysics(),...ctx.world};
  const original={...ctx.plane}, originalEnabled=original.root.enabled;
  const parent=original.root.parent instanceof Entity?original.root.parent:app.root;
  const spawns=vehicleSpawns();
  const homes=new Map(spawns.map(s=>[s.id,{...s}]));
  const models=new Map<string,VehicleModel>();
  for(const spawn of spawns) {
    const model=buildVehicleModel(app,spawn.kind,spawn.variant??0,parent);
    const clearance=spawn.kind==='car'||spawn.kind==='tuned'?0:Math.max(.1,...(model.hitbox??[]).map(p=>-p[1]));
    spawn.y=physics.groundAt(spawn.x,spawn.z)+clearance;
    model.root.setPosition(spawn.x,spawn.y,spawn.z);model.root.setLocalEulerAngles(0,-spawn.heading,0);
    models.set(spawn.id,model);
  }
  const person=buildVehicleModel(app,'foot',0,parent);
  person.root.enabled=false;original.root.enabled=false;
  let current:VehicleSpawn|undefined,controller:FlightModule;
  let destroyed=false;
  const carColliders: CarCollider[] = [];
  const parkedFp: HitboxFootprint = { halfWidth: 0, halfLength: 0, height: 0, centerX: 0, centerZ: 0 };
  function collectOtherCars(): ReadonlyArray<CarCollider> {
    carColliders.length = 0;
    const traffic = getTrafficObstacles();
    for (let i = 0; i < traffic.length; i++) {
      const t = traffic[i];
      carColliders.push({
        x: t.x,
        y: t.y,
        z: t.z,
        heading: t.heading ?? 0,
        halfWidth: t.halfWidth ?? t.radius,
        halfLength: t.halfLength ?? t.radius,
        height: t.height ?? 1.5,
      });
    }
    for (let i = 0; i < spawns.length; i++) {
      const sp = spawns[i];
      if (sp === current || (sp.kind !== 'car' && sp.kind !== 'tuned')) continue;
      const m = models.get(sp.id);
      const fp = extractHitboxFootprint(m?.hitbox, parkedFp);
      carColliders.push({
        x: sp.x,
        y: sp.y,
        z: sp.z,
        heading: sp.heading,
        halfWidth: fp && fp.halfWidth > 0.3 ? fp.halfWidth : 0.88,
        halfLength: fp && fp.halfLength > 0.5 ? fp.halfLength : 2.1,
        height: fp ? fp.height : 1.45,
      });
    }
    return carColliders;
  }
  function select(kind:VehicleKind,model:VehicleModel,pose:{x:number;y:number;z:number;heading:number},spawn?:VehicleSpawn & {speed?:number}) {
    controller?.destroy?.();
    state.vehicle=kind;
    Object.assign(state,{x:pose.x,y:pose.y,z:pose.z,heading:pose.heading,speed:0,verticalSpeed:0,pitch:0,roll:0,crashed:false,stall:false,nearbyVehicleId:null,nearbyVehicleKind:null});
    Object.assign(ctx.plane,model);
    model.root.enabled=true;
    model.root.setPosition(pose.x,pose.y,pose.z);model.root.setLocalEulerAngles(0,-pose.heading,0);
    const activeContext={...ctx,world:physics,plane:model};
    controller=kind==='car'||kind==='tuned'?createCarController(activeContext,physics,collectOtherCars):kind==='foot'?createFootController(activeContext,physics):createFlightController(activeContext,spawn,spawn?homes.get(spawn.id):undefined);
    state.altitude=state.y;state.heightAboveGround=Math.max(0,state.y-physics.surfaceAt(state.x,state.z,state.y+.1));
  }
  function enter(spawn:VehicleSpawn,pose?:StagePose) {
    if(!canEnterVehicle(ctx,spawn.kind))return;
    if(current)Object.assign(current,{x:state.x,y:state.y,z:state.z,heading:state.heading});
    if(pose)Object.assign(spawn,{x:pose.x,y:pose.y,z:pose.z,heading:pose.heading});
    person.root.enabled=false;current=spawn;
    select(spawn.kind,models.get(spawn.id)!,spawn,{...spawn,speed:pose?.speed});
  }
  function leave() {
    if(!current||state.speed>2||Math.abs(state.verticalSpeed)>.5)return;
    const support=physics.surfaceAt(state.x,state.z,state.y+.1);
    if(state.y-support>4)return;
    const h=state.heading*Math.PI/180;
    const distance=current.kind==='car'||current.kind==='tuned'?3.2:current.kind==='a29'?7:6;
    for(const side of [1,-1]) {
      const x=state.x+Math.cos(h)*distance*side,z=state.z+Math.sin(h)*distance*side;
      const y=physics.surfaceAt(x,z,state.y+.35);
      if(Math.abs(y-support)>.5||physics.obstacleAt(x,z,y,.35,1.8))continue;
      Object.assign(current,{x:state.x,y:state.y,z:state.z,heading:state.heading});
      const old=models.get(current.id)!;
      for(const e of old.exterior){if(e.render)e.render.enabled=true;if(e.model)e.model.enabled=true;}
      current=undefined;
      select('foot',person,{x,y,z,heading:state.heading});return;
    }
  }
  function reset() {
    current=undefined;
    for(const spawn of spawns) {
      const home=homes.get(spawn.id)!;
      Object.assign(spawn,home);
      const model=models.get(spawn.id)!;
      const clearance=spawn.kind==='car'||spawn.kind==='tuned'?0:Math.max(.1,...(model.hitbox??[]).map(p=>-p[1]));
      spawn.y=physics.groundAt(spawn.x,spawn.z)+clearance;
      model.root.enabled=true;model.root.setPosition(spawn.x,spawn.y,spawn.z);model.root.setLocalEulerAngles(0,-spawn.heading,0);
      for(const e of model.exterior){if(e.render)e.render.enabled=true;if(e.model)e.model.enabled=true;}
    }
    enter(spawns[0]);
  }
  const unsubscribe=onMissionRestart(ctx,reset);
  enter(spawns[0]);
  return {enterStageVehicle(kind,pose) {
    if(destroyed)return;
    const spawn=spawns.find(s=>s.kind===kind);
    if(spawn)enter(spawn,pose);
  },update(dt) {
    if(destroyed||!Number.isFinite(dt)||dt<=0)return;
    controller.update(dt);
    if(current)Object.assign(ctx.plane,models.get(current.id));else Object.assign(ctx.plane,person);
    if(current)Object.assign(current,{x:state.x,y:state.y,z:state.z,heading:state.heading});
    const nearby=state.vehicle==='foot'?nearestVehicle(spawns,state.x,state.y,state.z):undefined;
    state.nearbyVehicleId=nearby?.id??null;state.nearbyVehicleKind=nearby?.kind??null;
    if(app.keyboard?.wasPressed(KEY_E)) {
      if(current)leave();else if(nearby)enter(nearby);
    }
  },destroy(){
    if(destroyed)return;destroyed=true;unsubscribe();controller.destroy?.();
    const materials=new Set([...person.materials,...[...models.values()].flatMap(m=>m.materials)]);
    for(const m of models.values())m.root.destroy();person.root.destroy();
    for(const m of materials)m.destroy();
    Object.assign(ctx.plane,original);original.root.enabled=originalEnabled;
  }};
}
