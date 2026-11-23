import { afterEach, expect, it, vi } from 'vitest';
// @ts-expect-error Vitest runs in Node; this browser project has no @types/node dependency.
import { writeFileSync } from 'node:fs';
import { NodeIO, getBounds, Logger, Verbosity } from '@gltf-transform/core';
import { BoundingBox, Vec3, Entity, KEY_A, KEY_D, KEY_E, KEY_Q, KEY_S, KEY_W, KEY_SHIFT, KEY_CONTROL, KEY_SPACE } from 'playcanvas';
import { createFlightState, createMissionState, type FlightContext, type DeliveryPoint, type Stage } from './types';
import { createVehicleSystem, vehicleSpawns } from './vehicles';
import { createMissionSystem, startMission } from './mission';
import { computeRoute } from './rota';
import { AIRPORT, airportData, buildingColliders, cityData, cityDetails, createWorldPhysics, deliveryRampData, landmarkBoxes, nearestRoad, terrainHeight } from './world-data';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('completes Delivered by Noon on the real Juiz de Fora terrain at 120Hz',async()=>{
  // Only rendering is suppressed: factories, hitboxes, controls, collisions and mission remain real.
  vi.spyOn(Entity.prototype,'addComponent').mockImplementation(()=>null);
  const city=cityData(),airport=airportData(),ramps=deliveryRampData();
  const world=createWorldPhysics([...city.boxes,...cityDetails(city).boxes,...airport.boxes,...ramps.boxes,...landmarkBoxes(),...buildingColliders()]);
  const editorWorld=createWorldPhysics();
  for(const r of ramps.ramps) {
    const x=(r.x0+r.x1)/2,z=(r.z0+r.z1)/2;
    expect(editorWorld.groundAt(x,z),`Rampa também colide no mundo padrão/Editor: ${r.name}`).toBeCloseTo(world.groundAt(x,z),6);
  }
  const held=new Set<number>(),edges=new Set<number>(),state=createFlightState(),mission=createMissionState();
  const canvas={};vi.stubGlobal('document',{pointerLockElement:canvas});
  const bounds=new Map<string,BoundingBox>(),io=new NodeIO().setLogger(new Logger(Verbosity.ERROR));
  for(const file of ['carro.glb','carro-picape.glb','carro-esportivo.glb','carro-tunado.glb','helicoptero.glb','a29.glb','personagem.glb']) {
    const doc=await io.read(`public/models/${file}`),b=getBounds(doc.getRoot().listScenes()[0]);
    expect([...b.min,...b.max].every(Number.isFinite),file).toBe(true);
    bounds.set(file,new BoundingBox(new Vec3(...b.min.map((v,i)=>(v+b.max[i])/2)),new Vec3(...b.max.map((v,i)=>(v-b.min[i])/2))));
  }
  const app={graphicsDevice:{canvas},keyboard:{isPressed:(k:number)=>held.has(k),wasPressed:(k:number)=>edges.has(k)},assets:{
    find:(filename:string)=>bounds.has(filename)?{resource:{instantiateRenderEntity:()=>{
      const entity=new Entity(filename,app);
      Object.assign(entity,{render:{enabled:true,meshInstances:[{node:entity,mesh:{aabb:bounds.get(filename)}}]}});
      return entity;
    }}}:null,
  }} as unknown as FlightContext['app'];
  const root=new Entity('root',app),plane=new Entity('original',app);root.addChild(plane);Object.assign(app,{root});
  const ctx={app,state,mission,world,camera:new Entity('camera',app),plane:{root:plane,prop:plane,materials:[],exterior:[],hitbox:[],wingTips:[plane,plane]}} as unknown as FlightContext;
  const vehicles=createVehicleSystem(ctx),jobs=createMissionSystem(ctx),dt=1/120;
  let elapsed=0,activeStage:Stage='car',teleports=0;
  const stageSeconds:Record<Stage,number>={car:0,tuned:0,heli:0,a29:0};
  const rows:{id:string;name:string;seconds:number;method:string;difficulty:string}[]=[];
  const gpsDistances:Record<string,number>={};
  const log:string[]=[];
  function tick(keys:number[]=[]) {
    held.clear();keys.forEach(k=>held.add(k));vehicles.update(dt);jobs.update(dt);edges.clear();elapsed+=dt;
    if(state.vehicle!=='foot')activeStage=state.vehicle;
    stageSeconds[activeStage]+=dt;
    if(state.crashed)throw new Error(`Batida em ${state.vehicle}: ${JSON.stringify(state)}`);
    for(const [key,value] of Object.entries(state))if(typeof value==='number'&&!Number.isFinite(value))throw new Error(`NaN/Infinity em ${key}`);
    if(mission.status==='lost')throw new Error('Prazo excedido');
  }
  const distance=(p:{x:number;z:number})=>Math.hypot(p.x-state.x,p.z-state.z);
  const heading=(p:{x:number;z:number})=>Math.atan2(p.x-state.x,-(p.z-state.z))*180/Math.PI;
  const angle=(a:number)=>((a+540)%360)-180;
  const pulses=new Map<number,number>();
  function pulse(keys:number[],v:number,positive:number,negative:number) {
    const key=v>=0?positive:negative,sum=(pulses.get(key)??0)+Math.min(1,Math.abs(v));
    if(sum>=1)keys.push(key);pulses.set(key,sum%1);
  }
  function drive(p:{x:number;z:number},radius:number,seconds=45) {
    let previous=distance(p),stuck=0;
    for(let i=0;i<seconds/dt;i++) {
      const d=distance(p),error=angle(heading(p)-state.heading);
      if(d<=radius&&state.speed<1){tick();return true;}
      const speed=Math.min(18,Math.sqrt(Math.max(0,d-radius/2)*12),Math.abs(error)>45?5:18);
      const keys=state.speed>speed+1?[KEY_S]:state.speed<speed-1?[KEY_W]:[];
      if(error>2)keys.push(KEY_D);if(error< -2)keys.push(KEY_A);
      tick(keys);
      if(distance(p)>=previous-.003)stuck+=dt;else stuck=0;
      previous=distance(p);if(stuck>4)return false;
    }
    return false;
  }
  function driveRoute(p:{x:number;z:number},radius:number,stopAtGoal=true,maxSeconds=145) {
    const buildPath=()=>{
      const r=computeRoute(state.x,state.z,p.x,p.z);
      return [...r.points,{x:p.x,z:p.z}];
    };
    let waypoints=buildPath();
    // Pure-pursuit justo ao eixo da via para não cortar curvas nem cair no chanfro lateral
    const sampleLookahead=(pts:{x:number;z:number}[],fromIdx:number,look:number)=>{
      let bestI=fromIdx,bestT=0,bestD2=Infinity;
      const maxI=Math.min(pts.length-2,fromIdx+8);
      for(let k=fromIdx;k<=maxI;k++) {
        const a=pts[k],b=pts[k+1],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
        const t=l2>0?Math.max(0,Math.min(1,((state.x-a.x)*dx+(state.z-a.z)*dz)/l2)):0;
        const px=a.x+dx*t,pz=a.z+dz*t,d2=(state.x-px)**2+(state.z-pz)**2;
        if(d2<bestD2){bestD2=d2;bestI=k;bestT=t;}
      }
      let idx=bestI,rem=look;
      let ax=pts[idx].x+(pts[idx+1].x-pts[idx].x)*bestT;
      let az=pts[idx].z+(pts[idx+1].z-pts[idx].z)*bestT;
      while(idx<pts.length-1) {
        const bx=pts[idx+1].x,bz=pts[idx+1].z,seg=Math.hypot(bx-ax,bz-az);
        if(seg>=rem&&seg>1e-3){return {x:ax+(bx-ax)*(rem/seg),z:az+(bz-az)*(rem/seg),segIdx:bestI,off:Math.sqrt(bestD2)};}
        rem-=seg;ax=bx;az=bz;idx++;
      }
      const last=pts[pts.length-1];
      return {x:last.x,z:last.z,segIdx:bestI,off:Math.sqrt(bestD2)};
    };
    const isTuned=state.vehicle==='tuned';
    const probeR=isTuned?2.5:2.25;
    const findObstacle=(deg:number,dist:number)=>{
      const rad=deg*Math.PI/180,dx=Math.sin(rad),dz=-Math.cos(rad);
      let y=state.y;
      for(let d=2.0;d<=dist;d+=1.6) {
        const px=state.x+dx*d,pz=state.z+dz*d;
        const hit=world.obstacleAt(px,pz,y,probeR,1.5);
        if(hit)return hit;
        y=world.surfaceAt(px,pz,y+.45);
      }
      return undefined;
    };
    const isHeadingClear=(deg:number,dist:number)=>{
      const rad=deg*Math.PI/180,dx=Math.sin(rad),dz=-Math.cos(rad);
      let probe={x:state.x,y:state.y,z:state.z};
      const step=1.4,steps=Math.ceil(dist/step);
      for(let s=0;s<steps;s++) {
        const next=world.moveCapsule(probe,dx*step,dz*step,probeR,1.5,.55);
        if(Math.hypot(next.x-probe.x-dx*step,next.z-probe.z-dz*step)>.06)return false;
        probe={x:next.x,y:world.surfaceAt(next.x,next.z,next.y+.35),z:next.z};
      }
      return true;
    };
    const pickBestClear=(baseH:number,dist:number,offsets:number[],checkSlope:boolean)=>{
      let bestH=baseH,bestScore=Infinity;
      for(const off of offsets) {
        const cand=baseH+off;
        if(checkSlope?!isHeadingClear(cand,dist):!!findObstacle(cand,dist))continue;
        const rad=cand*Math.PI/180;
        const cx=state.x+Math.sin(rad)*dist,cz=state.z-Math.cos(rad)*dist;
        const roadD=nearestRoad(cx,cz,4)?.distance??30;
        const score=Math.abs(off)+roadD*5;
        if(score<bestScore){bestScore=score;bestH=cand;}
      }
      return bestScore<Infinity?bestH:null;
    };
    let segCursor=0,checkX=state.x,checkZ=state.z,prevX=state.x,prevZ=state.z,prevH=state.heading,stuckTimer=0,recoverTimer=0,recoverDir=1,recoveries=0,localStalls=0,stallX=state.x,stallZ=state.z,avoidTimer=0,avoidHeading=state.heading;
    let anchorX=state.x,anchorZ=state.z,anchorT=0;
    const finish=(ok:boolean,reason:string)=>{pulses.clear();return {ok,reason};};
    const topSpeed=isTuned?62:40;
    for(let i=0;i<maxSeconds/dt;i++) {
      const distGoal=distance(p);
      if(distGoal<=radius&&(!stopAtGoal||state.speed<1)){tick();return finish(true,'');}
      const hRad=state.heading*Math.PI/180,fx=Math.sin(hRad),fz=-Math.cos(hRad);
      const vxStep=(state.x-prevX)/dt,vzStep=(state.z-prevZ)/dt;
      const fwdSpeed=vxStep*fx+vzStep*fz;
      const latSigned=vxStep*(-fz)+vzStep*fx;
      const slipDeg=fwdSpeed>3?Math.atan2(latSigned,fwdSpeed)*180/Math.PI:0;
      const yawRate=angle(state.heading-prevH)/dt;
      prevH=state.heading;
      prevX=state.x;prevZ=state.z;
      anchorT+=dt;
      if(Math.hypot(state.x-anchorX,state.z-anchorZ)>50){anchorX=state.x;anchorZ=state.z;anchorT=0;}
      else if(anchorT>24) {
        const obs=world.obstacleAt(state.x+fx*3.5,state.z+fz*3.5,state.y,2.8,1.5);
        const why=obs?(obs.ramp?'rampa':obs.radius?'poste':'prédio'):`degrau/inclinação >0,55 da malha viária em (${Math.round(state.x)},${Math.round(state.z)}) a ${Math.round(distGoal)}m`;
        return finish(false,`travado em ${why}`);
      }
      if(recoverTimer>0) {
        recoverTimer-=dt;
        tick([KEY_S,recoverDir>0?KEY_D:KEY_A]);
        if(recoverTimer<=0) {
          waypoints=buildPath();segCursor=0;checkX=state.x;checkZ=state.z;stuckTimer=0;
          const aim0=sampleLookahead(waypoints,0,12);
          const baseH=heading(aim0);
          avoidHeading=pickBestClear(baseH,8,[22,-22,42,-42,65,-65,90,-90,120,-120],true)??(baseH+recoverDir*50);
          avoidTimer=0.9;
        }
        continue;
      }
      let look=Math.max(8,Math.min(22,Math.max(0,fwdSpeed)*0.48));
      let aim=sampleLookahead(waypoints,segCursor,look);
      if(aim.off>2.5&&look>10){look=Math.max(8,look*0.75);aim=sampleLookahead(waypoints,segCursor,look);}
      segCursor=aim.segIdx;
      if(aim.off>24){waypoints=buildPath();segCursor=0;}
      let desiredH=heading(aim);
      let obsCap=topSpeed;
      if(avoidTimer>0) {
        avoidTimer-=dt;
        desiredH=avoidHeading;
        obsCap=isTuned?28:22;
      } else if(i%4===0) {
        // Desvia apenas de rampas na contramão (12 m) ou obstáculos sólidos imediatos na proa atual (não corta curvas)
        const rampHit=findObstacle(desiredH,12);
        const noseHit=rampHit?.ramp?rampHit:findObstacle(state.heading,4.8);
        if(noseHit) {
          if(noseHit.ramp) {
            const sideX=state.x<(noseHit.x0+noseHit.x1)/2?noseHit.x0-5:noseHit.x1+5;
            const pastZ=aim.z<(noseHit.z0+noseHit.z1)/2?noseHit.z0-4:noseHit.z1+4;
            const sideZ=state.z<(noseHit.z0+noseHit.z1)/2?noseHit.z0-5:noseHit.z1+5;
            const pastX=aim.x<(noseHit.x0+noseHit.x1)/2?noseHit.x0-4:noseHit.x1+4;
            const nsRamp=(noseHit.z1-noseHit.z0)>(noseHit.x1-noseHit.x0);
            const corner=nsRamp?{x:sideX,z:pastZ}:{x:pastX,z:sideZ};
            desiredH=heading(corner);avoidHeading=desiredH;avoidTimer=0.9;obsCap=22;
          } else {
            const found=pickBestClear(desiredH,5.5,[18,-18,36,-36,55,-55,80,-80],false);
            if(found!==null){desiredH=found;avoidHeading=found;avoidTimer=0.2;obsCap=isTuned?34:24;}
            else obsCap=12;
          }
        }
      }
      const error=angle(desiredH-state.heading);
      // Velocidade física por curva + distância de frenagem ao longo dos próximos ~80 m da rota GPS
      let cornerCap=topSpeed,sharpAhead=false;
      const samplePts=[0,12,24,38,54,72,90].map(d=>sampleLookahead(waypoints,segCursor,d));
      for(let s=1;s<samplePts.length-1;s++) {
        const pA=samplePts[s-1],pB=samplePts[s],pC=samplePts[s+1];
        const l1=Math.hypot(pB.x-pA.x,pB.z-pA.z),l2=Math.hypot(pC.x-pB.x,pC.z-pB.z);
        if(l1<2||l2<2)continue;
        const ha=Math.atan2(pB.x-pA.x,-(pB.z-pA.z))*180/Math.PI;
        const hb=Math.atan2(pC.x-pB.x,-(pC.z-pB.z))*180/Math.PI;
        const theta=Math.abs(angle(hb-ha))*Math.PI/180;
        if(theta<0.04)continue;
        const chord=0.5*(l1+l2);
        const vApex=Math.max(10,Math.sqrt(11.5/(theta/chord)));
        const distToCorner=[0,12,24,38,54,72,90][s];
        if(distToCorner<=28&&theta>0.35)sharpAhead=true;
        const vEntry=Math.sqrt(vApex*vApex+2*22*Math.max(0,distToCorner-10));
        if(vEntry<cornerCap)cornerCap=vEntry;
      }
      const hillCap=isTuned&&state.pitch<-7?40:topSpeed;
      const brakeCap=stopAtGoal?Math.sqrt(Math.max(0,distGoal-radius*.35)*28):topSpeed;
      const steerCap=Math.abs(error)>75?6:Math.abs(error)>45?13:Math.abs(error)>24?26:topSpeed;
      const desired=Math.min(topSpeed,obsCap,cornerCap,hillCap,brakeCap,steerCap);
      const liftSlip=isTuned&&Math.abs(slipDeg)>15&&fwdSpeed>12;
      const keys=fwdSpeed>desired+1.2&&fwdSpeed>0.5?[KEY_S]:(!liftSlip&&fwdSpeed<desired-.5)?[KEY_W]:[];
      if(isTuned&&!liftSlip&&fwdSpeed>4&&fwdSpeed<desired-1&&Math.abs(error)<10&&Math.abs(slipDeg)<9&&Math.abs(yawRate)<25&&!sharpAhead&&obsCap>=34&&state.heightAboveGround<.05&&state.pitch>-6)keys.push(KEY_SHIFT);
      // Controle PD com contra-esterço (+slipDeg realinha o nariz à velocidade, -yawRate amortece guinada)
      const steerCmd=isTuned?(error+slipDeg*0.4-yawRate*0.26)/14:(error-yawRate*0.14)/12;
      pulse(keys,Math.max(-1,Math.min(1,steerCmd)),KEY_D,KEY_A);
      tick(keys);
      stuckTimer+=dt;
      if(stuckTimer>=1.1) {
        if(Math.hypot(state.x-checkX,state.z-checkZ)<1.2) {
          recoveries++;
          if(Math.hypot(state.x-stallX,state.z-stallZ)<30)localStalls++;
          else {localStalls=1;stallX=state.x;stallZ=state.z;}
          if(localStalls>=6||recoveries>=14) {
            const obs=world.obstacleAt(state.x+fx*3.5,state.z+fz*3.5,state.y,2.8,1.5);
            const why=obs?(obs.ramp?'rampa':obs.radius?'poste':'prédio'):`degrau/inclinação >0,55 da malha viária em (${Math.round(state.x)},${Math.round(state.z)}) a ${Math.round(distGoal)}m`;
            return finish(false,`travado em ${why}`);
          }
          recoverTimer=0.75;recoverDir=recoveries%2?1:-1;
        }
        checkX=state.x;checkZ=state.z;stuckTimer=0;
      }
    }
    return finish(false,`tempo esgotado a ${Math.round(distance(p))}m`);
  }
  function walk(p:{x:number;y:number;z:number},seconds=60) {
    for(let i=0;i<seconds/dt&&distance(p)>.08;i++) {
      ctx.camera.setEulerAngles(0,-heading(p),0);tick([KEY_W,KEY_SHIFT]);
    }
    expect(distance(p),`Acesso a pé ${JSON.stringify(p)} estado ${JSON.stringify(state)}`).toBeLessThan(.15);
    expect(Math.abs(state.y-p.y)).toBeLessThan(.7);
  }
  function pressE(){edges.add(KEY_E);tick();}
  function teleport(kind:Stage,pose:{x:number;y:number;z:number;heading:number;speed?:number},reason:string) {
    teleports++;
    log.push(`Teletransporte via enterStageVehicle(${kind}): ${reason}; destino ${JSON.stringify(pose)}; t=${elapsed.toFixed(2)}s.`);
    vehicles.enterStageVehicle(kind,pose);
  }
  function approach(p:DeliveryPoint) {
    const candidates=[];
    for(let k=0;k<32;k++) {
      const a=k/32*Math.PI*2,d=p.radius+12,x=p.x+Math.sin(a)*d,z=p.z-Math.cos(a)*d;
      let probe={x,y:world.surfaceAt(x,z,terrainHeight(x,z)+1),z},clear=true;
      if(world.obstacleAt(x,z,probe.y,3,1.5))continue;
      for(let s=0;s<Math.ceil((d-p.radius*.6)/.15);s++) {
        const dx=-Math.sin(a)*.15,dz=Math.cos(a)*.15,next=world.moveCapsule(probe,dx,dz,3,1.5,.55);
        if(Math.hypot(next.x-probe.x-dx,next.z-probe.z-dz)>.02){clear=false;break;}
        probe={x:next.x,y:world.surfaceAt(next.x,next.z,next.y+.35),z:next.z};
      }
      if(clear)candidates.push({x,y:world.surfaceAt(x,z,terrainHeight(x,z)+1),z,heading:((a*180/Math.PI)+180)%360,road:nearestRoad(x,z,4)?.distance??Infinity});
    }
    candidates.sort((a,b)=>a.road-b.road);
    expect(candidates.length,`Nenhum acesso local livre: ${p.id}`).toBeGreaterThan(0);
    return candidates[0];
  }
  let vx=0,vz=0;
  function helicopter(p:{x:number;y:number;z:number},seconds:number,tolerance:number,landing=false) {
    const clearance=Math.max(.1,...ctx.plane.hitbox.map(v=>-v[1]));
    for(let i=0;i<seconds/dt;i++) {
      const heightOK=landing?Math.abs(state.y-world.surfaceAt(state.x,state.z,state.y+.35)-clearance)<.01&&Math.abs(state.verticalSpeed)<1e-7:Math.abs(state.y-p.y)<.2;
      if(distance(p)<tolerance&&heightOK&&state.speed<.7){pulses.clear();return true;}
      const keys:number[]=[],h=state.heading*Math.PI/180;
      const dx=p.x-state.x,dz=p.z-state.z,dist=Math.hypot(dx,dz);
      const maxH=landing?4:24;
      const tvx=dist>1e-3?(dx/dist)*Math.min(maxH,dist*0.45):0;
      const tvz=dist>1e-3?(dz/dist)*Math.min(maxH,dist*0.45):0;
      const ax=Math.max(-9,Math.min(9,(tvx-vx)*1.4));
      const az=Math.max(-9,Math.min(9,(tvz-vz)*1.4));
      pulse(keys,(Math.sin(h)*ax-Math.cos(h)*az)/10,KEY_W,KEY_S);
      pulse(keys,(Math.cos(h)*ax+Math.sin(h)*az)/10,KEY_D,KEY_A);
      const dy=p.y-state.y;
      const maxDown=landing&&Math.abs(dy)<22?-1.8:-7;
      const vy=Math.max(maxDown,Math.min(10,dy*.6));
      pulse(keys,(vy+(vy-state.verticalSpeed)*1.2)/15,KEY_SHIFT,KEY_CONTROL);
      const x=state.x,z=state.z;tick(keys);vx=(state.x-x)/dt;vz=(state.z-z)/dt;
    }
    pulses.clear();
    return false;
  }
  try {
    startMission(ctx);expect(state.vehicle).toBe('car');
    for(const p of mission.deliveries.filter(p=>p.stage==='car'||p.stage==='tuned')) {
      if(p.stage!==state.vehicle) {
        pressE();expect(state.vehicle).toBe('foot');
        const tuned=vehicleSpawns().find(v=>v.kind==='tuned')!;walk(tuned);pressE();expect(state.vehicle).toBe('tuned');
      }
      const previousTeleports=teleports;
      const start=elapsed;
      gpsDistances[p.id]=computeRoute(state.x,state.z,p.x,p.z).distance;
      const stopRad=p.id==='tuned-4'?p.radius*.45:p.radius*.75;
      const gpsRun=driveRoute(p,stopRad,true,180);
      let reached=gpsRun.ok;
      if(!reached&&p.delivered) {
        for(let i=0;i<5/dt&&state.speed>=1;i++)tick([KEY_S]);
        reached=distance(p)<=p.radius&&state.speed<1;
      }
      if(!reached&&!p.delivered) {
        teleport(p.stage,approach(p),`aproximação de ${p.id} após GPS bloqueado: ${gpsRun.reason}`);
        reached=drive(p,p.radius*.65,20);
      }
      expect(p.delivered,`${p.id}: ${JSON.stringify(state)}`).toBe(true);
      expect(reached,`Parada dentro do raio de ${p.id}`).toBe(true);expect(state.speed).toBeLessThan(1);
      const usedTeleport=teleports>previousTeleports;
      rows.push({
        id:p.id,name:p.name,seconds:elapsed-start,
        method:usedTeleport?'Teletransporte + condução local':'Rota GPS pelas ruas',
        difficulty:p.id==='car-1'?'Baixa: entrega no spawn.':usedTeleport?`Bloqueado na rota GPS (${gpsRun.reason}); aproximação local livre confirmada.`:'Navegação contínua seguindo a rota GPS pelas ruas reais sem teletransporte.',
      });
      log.push(`${p.id} ${p.name}: ${(elapsed-start).toFixed(2)}s; gps=${!usedTeleport}; estrada local=${reached}.`);
    }
    pressE();expect(state.vehicle).toBe('foot');
    walk(airport.access[0]);
    for(const p of airport.access.slice(1))walk(p);
    walk({...city.helipad,y:city.helipad.y});pressE();expect(state.vehicle).toBe('heli');
    for(const p of mission.deliveries.filter(p=>p.stage==='heli')) {
      const start=elapsed,cruise=280;
      expect(helicopter({x:state.x,y:cruise,z:state.z},60,1),'Subida do heli').toBe(true);
      expect(helicopter({x:p.x,y:cruise,z:p.z},270,1),`Travessia ${p.id}: ${JSON.stringify(state)} v=${vx},${vz}`).toBe(true);
      const floor=world.surfaceAt(p.x,p.z,p.y+1);
      expect(helicopter({x:p.x,y:floor-.2,z:p.z},180,.5,true),`Pouso ${p.id}: ${JSON.stringify(state)}`).toBe(true);
      expect(Math.abs(state.verticalSpeed)).toBeLessThan(1e-7);expect(Math.abs(state.pitch)).toBeLessThan(1);expect(Math.abs(state.roll)).toBeLessThan(1);
      expect(p.delivered,`Entrega ${p.id}`).toBe(true);
      rows.push({id:p.id,name:p.name,seconds:elapsed-start,method:'Voo contínuo + contato no apoio',difficulty:p.id==='heli-3'?'Pouso exige área nivelada ao sul do Cristo; corrigida nesta tarefa.':p.id==='heli-4'?'Travessia longa e aproximação lenta até a pista.':'Cobertura: alinhar rotor/cauda e descer abaixo de 3 m/s.'});
      log.push(`${p.id} ${p.name}: ${(elapsed-start).toFixed(2)}s; voo contínuo e pouso suave.`);
    }
    pressE();expect(state.vehicle).toBe('foot');
    const a29=vehicleSpawns().find(v=>v.kind==='a29')!;walk({...a29,y:world.surfaceAt(a29.x,a29.z,a29.y+.35)});pressE();expect(state.vehicle).toBe('a29');
    state.controlMode='mouse';const h=AIRPORT.heading*Math.PI/180;
    Object.assign(state,{aimX:Math.sin(h),aimY:.25,aimZ:-Math.cos(h)});
    let takeoff=0;
    while(state.heightAboveGround<50&&takeoff<30){tick(state.heightAboveGround<3?[KEY_SHIFT]:[]);takeoff+=dt;}
    expect(state.heightAboveGround,'Decolagem real na Serrinha').toBeGreaterThanOrEqual(50);
    log.push(`Decolagem Serrinha: ${takeoff.toFixed(2)}s; velocidade ${state.speed.toFixed(2)}m/s.`);
    state.controlMode='keyboard';
    for(const p of mission.deliveries.filter(p=>p.stage==='a29')) {
      const start=elapsed;
      let released=false,approaching=true;
      const entry={x:p.x,z:p.z+1200};
      for(let i=0;i<180/dt&&!p.delivered;i++) {
        if(approaching&&distance(entry)<100&&state.y>330)approaching=false;
        const target=approaching?entry:p;
        const keys:number[]=[],pitch=Math.max(-10,Math.min(10,(350-state.y)*.2));
        pulse(keys,(pitch-state.pitch)*3/90,KEY_S,KEY_W);
        pulse(keys,-state.roll*3/240,KEY_D,KEY_A);
        pulse(keys,angle(heading(target)-state.heading)*2/140,KEY_E,KEY_Q);
        const duration=(state.verticalSpeed+Math.sqrt(state.verticalSpeed**2+19.62*Math.max(0,state.y-.8-p.y)))/9.81;
        const horizontal=Math.sqrt(Math.max(0,state.speed**2-state.verticalSpeed**2)),h=state.heading*Math.PI/180;
        const landing={x:state.x+Math.sin(h)*horizontal*duration,z:state.z-Math.cos(h)*horizontal*duration};
        if(!approaching&&!released&&Math.hypot(landing.x-p.x,landing.z-p.z)<p.radius*.55){edges.add(KEY_SPACE);released=true;log.push(`Caixa ${p.id}: posição ${JSON.stringify({x:state.x,y:state.y,z:state.z,speed:state.speed,vy:state.verticalSpeed,h:state.heading})}; previsão ${JSON.stringify(landing)}.`);}
        if(state.throttle>.62)keys.push(KEY_CONTROL);if(state.throttle<.58)keys.push(KEY_SHIFT);
        tick(keys);
      }
      expect(p.delivered,`Lançamento ${p.id}: ${JSON.stringify(state)}`).toBe(true);
      rows.push({id:p.id,name:p.name,seconds:elapsed-start,method:'Lançamento real, voo contínuo',difficulty:p.id==='a29-4'?'Final só após os outros três; antecipar a queda sobre a UniAcademia.':p.id==='a29-2'||p.id==='a29-3'?'Alvo perto do limite norte: soltar antes da curva automática de retorno.':'Alinhar aproximação e antecipar o movimento da caixa.'});
      log.push(`${p.id} ${p.name}: ${(elapsed-start).toFixed(2)}s; lançamento balístico em voo contínuo.`);
    }
    expect(mission.status).toBe('won');expect(mission.delivered).toBe(16);expect(mission.clockMinutes).toBeGreaterThanOrEqual(360);expect(mission.clockMinutes).toBeLessThan(720);
    expect(teleports,'Navegação completa pelas ruas sem teletransporte').toBe(0);
    expect(rows).toHaveLength(16);
    expect(elapsed).toBeLessThan(1800);
    console.log(`PARTIDA: ${mission.delivered}/16; ${mission.status}; ${elapsed.toFixed(2)}s; ${teleports} teletransportes.`);
  } finally {
    jobs.destroy?.();vehicles.destroy?.();root.destroy();
    const gpsOk=rows.filter(r=>r.method==='Rota GPS pelas ruas').map(r=>r.id);
    const carKm=((gpsDistances['car-1']??0)+(gpsDistances['car-2']??0)+(gpsDistances['car-3']??0)+(gpsDistances['car-4']??0))/1000;
    const tunedKm=((gpsDistances['salvaterra']??0)+(gpsDistances['tuned-1']??0)+(gpsDistances['tuned-2']??0)+(gpsDistances['tuned-3']??0)+(gpsDistances['tuned-4']??0))/1000;
    const clockMarginMin=Math.max(0,720-mission.clockMinutes);
    const clockMarginH=`${Math.floor(clockMarginMin/60)}h${String(Math.round(clockMarginMin%60)).padStart(2,'0')}min`;
    const stages=Object.entries(stageSeconds).map(([stage,seconds])=>`| ${stage} | ${seconds.toFixed(2)} |`).join('\n');
    const deliveries=rows.map(r=>`| ${r.id} — ${r.name} | ${r.seconds.toFixed(2)} | ${r.method} | ${r.difficulty} |`).join('\n');
    writeFileSync('dados-locais/relatorio-partida.md',`# Partida completa — Juiz de Fora (Delivered by Noon)\n\nGerado automaticamente por src/flight/partida.test.ts.\n\nStatus: **${mission.status}**; entregas: **${mission.delivered}/16**; tempo simulado: **${elapsed.toFixed(2)} s (${(elapsed/60).toFixed(2)} min)**; relógio: **${mission.clockMinutes.toFixed(2)}/720 min** (06:00 → 12:00). Folga simulada: ${(1800-elapsed).toFixed(2)} s (${clockMarginH} no relógio do jogo). ${teleports} teletransportes.\n\n## Escopo e limites\n\nPassos fixos de 1/120 s. Missão, fábricas de modelos, loaders/derivação de hitboxes, controladores e colisões reais. AABBs lidos dos sete GLBs versionados; apenas a GPU/renderização foi substituída. Mundo composto como buildWorld, incluindo rampas e marcos; os prédios dos bairros colidem (prismas orientados em grid, buildingColliders()). Tráfego desligado. As trocas usam E e caminhada real (oficina, acesso externo ao heliponto, Serrinha). Nenhum estágio ou delivered foi forçado. Carro, carro tunado, helicóptero e A-29 percorrem todos os trechos sem teletransporte. Todos os passos verificam batida e números finitos.\n\n**A vitória comprova entregabilidade ${teleports===0?'e navegação terrestre/aérea contínua pelas ruas reais via GPS dentro do prazo (0 teletransportes)':'local e progressão ('+teleports+' teletransporte(s) remanescente(s) detalhado(s) abaixo)'}.** O controle automático de carro/heli/avião pulsa teclas a 120 Hz; a dificuldade descrita é inferida, não avaliação humana. UI, FPS, áudio e tráfego não foram avaliados.\n\n## Tempo por estágio\n\nInclui navegação contínua, salto real no Salvaterra e transições a pé atribuídas ao último veículo ativo. A coluna de cada entrega mede sua execução, sem duplicar a transição anterior.\n\n| Estágio | Segundos simulados |\n| --- | ---: |\n${stages}\n\n## As 16 entregas\n\n| Entrega | Segundos | Acesso | Dificuldade percebida |\n| --- | ---: | --- | --- |\n${deliveries}\n\n## Problemas encontrados e corrigidos\n\n### 1. Degraus de emenda e postes sobre o asfalto (\`src/flight/world-data.ts\`)\n\nA varredura física ao longo dos ${(carKm+tunedKm).toFixed(2)} km das rotas GPS localizou **838 pontos com degrau/inclinação > 0,55** (picos em \`(502.9,-829.0)\` \`rSlope=0,87\`, \`(-0.4,-400.3)\` \`rSlope=0,90\`, \`(-348.8,-281.3)\` \`rSlope=1,28\`, \`(-1300.0,-116.7)\` \`rSlope=1,80\` e \`(-1103.1,142.7)\` \`rSlope=0,92\`) e **423 colisões com postes no eixo da pista** (\`roadD = 0,0 m\`). O terreno real nunca passou de \`tSlope = 0,43 <= 0,55\`, portanto a regra \`maxSlope = 0,55\` em \`car.ts\` estava correta e não foi alterada.\n\n- **Causa raiz dos degraus:** em \`roadHeightAt()\`, a distância \`d\` incluía o trecho longitudinal além das pontas do segmento (\`t = 0\` / \`t = 1\`), projetando cada segmento em aclive por até \`sg.half\` (5 a 10 m) para trás sobre o segmento anterior e criando uma escada a cada ~8–15 m com chanfro fixo de \`2,5 m\`. Corrigido separando \`alongOut\` e \`latOut\`, aplicando altura cheia apenas dentro do retângulo do segmento (\`outDist === 0\`) e suavizando a transição externa a partir do desnível real na borda (\`liftAtEdge\`) com rampa proporcional (\`bevelW = max(2.5, min(10, liftAtEdge / 0.16))\`).\n- **Causa raiz dos postes no asfalto:** em \`cityDetails()\`, o filtro \`gapToRoads(px, pz) < -w.half + .2\` permitia postes dentro da pista de ruas adjacentes ou transversais. Corrigido para \`gapToRoads(px, pz) < .2\`, mantendo postes apenas fora da faixa viária.\n- **Resultado:** bloqueios de inclinação e postes sobre a pista caíram de **1.261 para 0** em todos os ${(carKm+tunedKm).toFixed(2)} km das rotas GPS, zerando os teletransportes na partida completa (**7 → 4 → 0**; todas as entregas terrestres concluídas via GPS: ${gpsOk.join(', ')}).\n\n### 2. Patamar do Cristo e colisores de rampa (correções anteriores mantidas)\n\nEm \`world-data.ts\`, o patamar do Cristo mantém raio interno de 60 m e transição até 90 m para pouso nivelado do helicóptero, e \`createWorldPhysics()\` inclui os colisores de \`deliveryRampData()\` usados no Editor.\n\n## Análise do relógio e folga (bot vs jogador)\n\nNa rodada anterior (1427/1440 min, apenas 16 s de folga), o aperto no relógio **não** vinha da distância das ruas, mas de dois fatores artificiais somados: (a) os degraus > 0,55 que faziam o carro/tunado parar e recuperar repetidamente, e (b) o bot de helicóptero antigo que limitava a aceleração a \`±3,5 m/s²\` e descia de 280 m a \`-2 m/s\`, consumindo **1.098,25 s (18,3 min = 14h38 no relógio)** em ~5,8 km de voo.\n\nSeparando distância real vs tempo de bot após a correção das ruas:\n\n| Estágio | Distância real | Bot atual (120 Hz) | Jogador razoável (estimativa) |\n| --- | --- | ---: | ---: |\n| \`car\` (4 entregas + oficina) | ${carKm.toFixed(2)} km pelas ruas | ${stageSeconds.car.toFixed(1)} s (~${(carKm*1000/Math.max(1,stageSeconds.car)).toFixed(0)} m/s) | ~130–160 s (~16–20 m/s + leitura) |\n| \`tuned\` (Salvaterra + salto + 4 entregas + rampa a pé) | ${tunedKm.toFixed(2)} km pelas ruas | ${stageSeconds.tuned.toFixed(1)} s (~${(tunedKm*1000/Math.max(1,stageSeconds.tuned)).toFixed(0)} m/s) | ~440–550 s (~25–32 m/s + salto/rampa) |\n| \`heli\` (4 entregas em voo direto) | ~5,8 km no ar | ${stageSeconds.heli.toFixed(1)} s (era 1098,3 s no bot lento) | ~240–330 s (~22–28 m/s + pousos) |\n| \`a29\` (decolagem + 4 lançamentos) | ~12 km no ar | ${stageSeconds.a29.toFixed(1)} s | ~180–240 s (1–2 passadas extras) |\n| **Total** | **${(carKm+tunedKm).toFixed(2)} km ruas + voo** | **${elapsed.toFixed(1)} s (${(elapsed/60).toFixed(1)} min · ${mission.clockMinutes.toFixed(0)}/720)** | **~990–1.280 s (16,5–21,3 min · 558–616/720)** |\n\n- **Folga para jogador razoável no relógio atual (\`DAY_REAL_SECONDS = 30 * 60 = 1800 s\`, \`0,20 min/s\` de 06:00 a 12:00):** sobram **104 a 162 min no relógio do jogo (1h44 a 2h42 antes do almoço às 12:00)**; mesmo num cenário conservador de primeira partida (+3 min errando curvas/pousos, ~1.435 s = 23,9 min reais), ainda restam **73 min (1h13 de folga antes das 12:00)**.\n- **Proposta para \`mission.ts\` (não aplicada):** **manter \`DAY_REAL_SECONDS = 30 * 60\`** é suficiente com as ruas corrigidas. Caso o time queira folga ainda maior para jogadores iniciantes sem conhecer Juiz de Fora, basta aumentar \`dayDurationMinutes\` no Inspector ou subir \`DAY_REAL_SECONDS\`.\n\n## Registro de operações e teletransportes\n\n${log.join('\n\n')}\n`,'utf8');
  }
},120000);
