import { Color, Entity, KEY_SPACE, StandardMaterial } from 'playcanvas';
import { createMissionState, STAGE_ORDER, type DeliveryPoint, type FlightContext, type FlightModule, type Stage, type VehicleKind } from './types';
import { AIRPORT, CRISTO_IMPERADOR, MARCOS, UNIACADEMIA, WORKSHOP, airportData, cityData, roadStop, terrainHeight } from './world-data';

export const DAY_REAL_SECONDS = 30 * 60;
export const CLOCK_START_MINUTES = 6 * 60; // 06:00
export const CLOCK_END_MINUTES = 12 * 60; // 12:00 (almoço)
export const CLOCK_SPAN_MINUTES = CLOCK_END_MINUTES - CLOCK_START_MINUTES;
export const CLOCK_MINUTES_PER_SECOND = CLOCK_SPAN_MINUTES / DAY_REAL_SECONDS;
const restartHandlers = new WeakMap<FlightContext, Set<() => void>>();
const stageNames: Record<Stage,string> = {car:'carro',tuned:'esportivo',heli:'helicóptero',a29:'A-29'};

export function onMissionRestart(ctx:FlightContext,handler:()=>void) {
  let handlers=restartHandlers.get(ctx);
  if(!handlers)restartHandlers.set(ctx,handlers=new Set());
  handlers.add(handler);
  return ()=>handlers!.delete(handler);
}

export function deliveryPoints():DeliveryPoint[] {
  // Juiz de Fora: cada entrega fica no lugar real (jf-mundo.json), na rua, na laje ou no ar sobre o alvo.
  const city=cityData(),access=airportData(city.helipad).access[0];
  const ground=(x:number,z:number)=>terrainHeight(x,z);
  const roof=(name:keyof typeof MARCOS)=>{
    const [x,z]=MARCOS[name];
    return [...city.boxes].filter(b=>b!==city.tower&&b.top-ground((b.x0+b.x1)/2,(b.z0+b.z1)/2)>=7)
      .sort((a,b)=>Math.hypot((a.x0+a.x1)/2-x,(a.z0+a.z1)/2-z)-Math.hypot((b.x0+b.x1)/2-x,(b.z0+b.z1)/2-z))[0];
  };
  const points:DeliveryPoint[]=[];
  const add=(stage:Stage,name:string,x:number,y:number,z:number,radius:number,leadsToNext=false,airDrop=false)=>{
    points.push({id:`${stage}-${points.filter(p=>p.stage===stage).length+1}`,stage,name,x,y,z,radius,leadsToNext,airDrop,delivered:false});
  };
  const street=(stage:Stage,name:string,place:keyof typeof MARCOS,radius:number,maxClass=3)=>{
    const p=roadStop(place,maxClass);add(stage,name,p.x,ground(p.x,p.z),p.z,radius);
  };
  const a=roof('santaHelena'),b=roof('santaCecilia');
  const cristo=CRISTO_IMPERADOR,cx=cristo.x,cz=cristo.z+18;
  const air=(name:string,place:keyof typeof MARCOS,radius:number)=>{const [x,z]=MARCOS[place];add('a29',name,x,ground(x,z),z,radius,false,true);};
  street('car','Mario, o Encanador','centro',11);
  street('car','Pizzaria do Luigi','granbery',11);
  street('car','CJ, na Grove Street','altoDosPassos',11);
  add('car','Oficina do Lamar (onde está o esportivo)',WORKSHOP.x,WORKSHOP.y,WORKSHOP.z,11,true);
  street('tuned','Rancho do Arthur Morgan','salvaterra',13);
  const mirante=roadStop('cristo');add('tuned','Mirante do Steve',mirante.x,ground(mirante.x,mirante.z),mirante.z,15);
  street('tuned','Jonesy, no Ônibus de Batalha','estadio',20);
  add('tuned','Torre do Ganon (base do heliponto)',access.x,access.y,access.z,12,true);
  add('heli','Princesa Zelda, na cobertura',(a.x0+a.x1)/2,a.top,(a.z0+a.z1)/2,14);
  add('heli','Capitão Price, na laje',(b.x0+b.x1)/2,b.top,(b.z0+b.z1)/2,14);
  add('heli','Creeper no Pico (Cristo do Imperador)',cx,ground(cx,cz),cz,24);
  add('heli','Hangar do Tommy Vercetti (no aeroporto)',AIRPORT.x-22,AIRPORT.y,AIRPORT.z,12,true);
  air('Toad, na Ilha do Cogumelo','ufjf',85);
  air('Trevor, em Sandy Shores','industrial',85);
  air('Peely, fugindo da Tempestade','linhares',85);
  add('a29','UniAcademia: entrega final, o próprio jogo',UNIACADEMIA.x,UNIACADEMIA.y,UNIACADEMIA.z,70,false,true);
  return points;
}

export function startMission(ctx:FlightContext) {
  const mission=ctx.mission??=createMissionState();
  const deliveries=deliveryPoints();
  Object.assign(mission,createMissionState(),{status:'playing',clockMinutes:CLOCK_START_MINUTES,deliveries,total:deliveries.length});
  for(const restart of restartHandlers.get(ctx)??[])restart();
}

export function canEnterVehicle(ctx:FlightContext,kind:VehicleKind) {
  if(kind==='foot'||!ctx.mission)return true;
  const mission=ctx.mission;
  if(STAGE_ORDER.indexOf(kind)<=STAGE_ORDER.indexOf(mission.stage))return true;
  mission.message=`Termine as entregas do ${stageNames[mission.stage]} primeiro`;
  mission.messageTimer=4;
  return false;
}

interface Drop {x:number;y:number;z:number;vx:number;vy:number;vz:number;entity?:Entity}
export function createMissionSystem(ctx:FlightContext):FlightModule {
  const mission=ctx.mission??=createMissionState();
  if(mission.clockMinutes<CLOCK_START_MINUTES)mission.clockMinutes=CLOCK_START_MINUTES;
  if(!mission.deliveries.length){mission.deliveries=deliveryPoints();mission.total=mission.deliveries.length;}
  const drops:Drop[]=[];
  let material:StandardMaterial|undefined;
  const clear=()=>{for(const drop of drops)drop.entity?.destroy();drops.length=0;};
  const unsubscribe=onMissionRestart(ctx,clear);
  function message(text:string){mission.message=text;mission.messageTimer=4;}
  function pending(stage:Stage|null=mission.carrying) {
    const points=mission.deliveries.filter(p=>p.stage===stage&&!p.delivered);
    return points.length>1?points.filter(p=>!p.leadsToNext&&p.id!=='a29-4'):points;
  }
  function deliver(point:DeliveryPoint) {
    if(point.delivered)return;
    point.delivered=true;mission.delivered++;
    const points=100+Math.floor(Math.max(0,CLOCK_END_MINUTES-mission.clockMinutes)/3);
    mission.score+=points;message(`Entregue a ${point.name.split(' — ')[0]}! +${points}`);
    if(mission.delivered===mission.total){mission.status='won';mission.carrying=null;mission.nextDeliveryId=null;clear();return;}
    if(!mission.deliveries.some(p=>p.stage===mission.stage&&!p.delivered)) {
      mission.stage=STAGE_ORDER[STAGE_ORDER.indexOf(mission.stage)+1];
      message(`${stageNames[mission.stage]} liberado! Próxima marcha do expediente.`);
    }
  }
  function loadAndTarget() {
    const kind=ctx.state.vehicle;
    mission.carrying=kind!=='foot'&&STAGE_ORDER.indexOf(kind)<=STAGE_ORDER.indexOf(mission.stage)
      &&mission.deliveries.some(p=>p.stage===kind&&!p.delivered)?kind:null;
    const nearest=pending().sort((a,b)=>Math.hypot(a.x-ctx.state.x,a.y-ctx.state.y,a.z-ctx.state.z)-Math.hypot(b.x-ctx.state.x,b.y-ctx.state.y,b.z-ctx.state.z))[0];
    mission.nextDeliveryId=nearest?.id??null;
  }
  function release() {
    if(drops.length>=8){message('Espere as caixas pousarem!');return;}
    const state=ctx.state,h=state.heading*Math.PI/180;
    const horizontal=Math.sqrt(Math.max(0,state.speed**2-state.verticalSpeed**2));
    const drop:Drop={x:state.x,y:state.y-.8,z:state.z,vx:Math.sin(h)*horizontal,vy:state.verticalSpeed,vz:-Math.cos(h)*horizontal};
    if(ctx.app.graphicsDevice&&ctx.app.systems?.render) {
      if(!material){material=new StandardMaterial();material.diffuse=new Color(.65,.36,.12);material.update();}
      drop.entity=new Entity('Encomenda do almoço',ctx.app);
      drop.entity.addComponent('render',{type:'box',material,castShadows:false});drop.entity.setLocalScale(.9,.9,.9);
      (ctx.plane.root.parent??ctx.app.root).addChild(drop.entity);drop.entity.setPosition(drop.x,drop.y,drop.z);
    }
    drops.push(drop);message('Caixa a caminho!');
  }
  return {update(dt) {
    if(!Number.isFinite(dt)||dt<=0||mission.status!=='playing')return;
    mission.messageTimer=Math.max(0,mission.messageTimer-dt);if(!mission.messageTimer)mission.message=null;
    mission.clockMinutes=Math.min(CLOCK_END_MINUTES,Math.max(CLOCK_START_MINUTES,mission.clockMinutes)+dt*CLOCK_MINUTES_PER_SECOND);
    if(mission.clockMinutes>=CLOCK_END_MINUTES){mission.status='lost';mission.carrying=null;mission.nextDeliveryId=null;message('Meio-dia! Acabou o turno — o almoço esfriou!');clear();return;}
    loadAndTarget();
    const state=ctx.state;
    if(!state.crashed) {
      if(mission.carrying==='a29') {if(ctx.app.keyboard?.wasPressed(KEY_SPACE))release();}
      else for(const p of pending()) {
        const distance=Math.hypot(p.x-state.x,p.z-state.z);
        const height=state.y-p.y;
        const canDeliver=mission.carrying==='heli'?height>=-.5&&height<10&&state.heightAboveGround<10&&Math.abs(state.verticalSpeed)<3&&state.speed<8:Math.abs(height)<3&&state.speed<8;
        if(distance<=p.radius&&canDeliver){deliver(p);break;}
      }
    }
    let remaining=dt;
    while(drops.length&&remaining>0&&mission.status==='playing') {
      const step=Math.min(remaining,1/60);remaining-=step;
      for(let i=drops.length-1;i>=0;i--) {
        const d=drops[i];d.x+=d.vx*step;d.z+=d.vz*step;d.y+=d.vy*step-4.905*step*step;d.vy-=9.81*step;
        d.entity?.setPosition(d.x,d.y,d.z);
        if(d.y<=ctx.world.groundAt(d.x,d.z)+.45) {
          d.entity?.destroy();drops.splice(i,1);
          const target=pending('a29').find(p=>Math.hypot(p.x-d.x,p.z-d.z)<=p.radius);
          if(target)deliver(target);else message('Endereço errado. A gaivota agradece!');
          if(mission.status!=='playing')break;
        }
      }
    }
    if(mission.status==='playing')loadAndTarget();
  },destroy(){unsubscribe();clear();material?.destroy();}};
}
