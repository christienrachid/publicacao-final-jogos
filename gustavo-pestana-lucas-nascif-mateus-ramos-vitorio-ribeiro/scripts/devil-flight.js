export const GUARD_THRESHOLD=.25;
export const GUARD_HEAL_RATE=.015;
export const GUARD_HEAL_CAP=.60;
export const FINAL_SHIFT_DURATION=4;
export const DUST_HEIGHT=110;
export const DUST_HALF_WIDTH=58;
export const DIVE_DURATION=.45;

const GUARDS=[['sentinel',5545],['specter',6910],['crawler',5765],
 ['lancer',7140],['specter',5985],['sentinel',7360]];
export const GUARD_TOTAL=GUARDS.length;
const GUARD_PREPARE=.72, GUARD_RISE=.90, GUARD_INTERVAL=.22;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const ease=t=>{ t=clamp(t,0,1);return t*t*(3-2*t); };
const mix=(a,b,t)=>a+(b-a)*t;
const CENTER=6460;
const LEFT=5485, RIGHT=7420;

const RECOVERY_SECONDS={dive:1.5,gust:.72,guard:1.5};
export const flightRecoverySeconds=kind=>RECOVERY_SECONDS[kind];

function open(e,kind,target,ground) {
 e.flight={kind,stage:'rise',t:0,fromX:e.x,fromY:e.y,target,healed:0};
 e.vx=e.vy=0;
 e.onGround=false;
 e.state='flight';
 e.t=0;
 e.atk=null;
 e.y=Math.min(e.y,ground);
}

export function summonGuard(e,ground) {
 e.guardUsed=true;
 open(e,'guard',CENTER,ground);
 e.flight.stage='prepare';
 e.flight.spawned=0;
}

export function guardCount(world) {
 return world.enemies.filter(e=>e.finalGuard&&!e.dead).length;
}

export function guardSceneProgress(e) {
 const f=e?.flight;
 if(f?.kind!=='guard')return null;
 if(f.stage==='prepare')return f.t/(GUARD_PREPARE+GUARD_RISE);
 if(f.stage==='rise')return Math.min(1,(GUARD_PREPARE+f.t)/(GUARD_PREPARE+GUARD_RISE));
 return null;
}

function stage(e,next) {
 const f=e.flight;
 f.stage=next;
 f.t=0;
 f.fromX=e.x;
 f.fromY=e.y;
}

function knockdown(e,api,kind,direction=0) {
 const f=e.flight;
 e.y=api.ground;
 e.onGround=true;
 api.impact(e,kind,direction);
 stage(e,'recover');
 f.recover=flightRecoverySeconds(f.kind);
}

function healGuard(e,world,dt){
 if(!guardCount(world))return;
 const f=e.flight;
 const amount=Math.max(0,Math.min(e.maxHp*GUARD_HEAL_RATE*dt,
  e.maxHp*GUARD_HEAL_CAP-f.healed,e.maxHp-e.hp));
 e.hp+=amount;
 f.healed+=amount;
}

export function updateDevilFlight(e,world,dt,api) {
 const h=world.hero;
 if(h.state==='dead')return !!e.flight;
 if (!e.flight) {
  if (!e.guardUsed && e.hp<=e.maxHp*GUARD_THRESHOLD) {
   summonGuard(e,api.ground);
   api.sound('usurpador-convoca',.87,e.x);
  } else {
   e.airCooldown=(e.airCooldown??3.6)-dt;
   if(e.state!=='idle'||!e.onGround||e.airCooldown>0)return false;
   const kind=e.airCount%2===1?'gust':'dive';
   e.airCount=(e.airCount??0)+1;
   const side=h.x>CENTER?LEFT+185:RIGHT-185;
   const target=kind==='gust'?side:clamp(e.x+(e.x<h.x?-1:1)*195,LEFT,RIGHT);
   open(e,kind,target,api.ground);
   api.sound('usurpador-asa',.79,e.x);
  }
 }

 const f=e.flight;
 const before=f.t;
 f.t+=dt;
 f.healPulse=Math.max(0,(f.healPulse??0)-dt);
 if(f.stage==='prepare'){
  e.y=mix(f.fromY,api.ground,ease(f.t/.32));
  if(f.t>=GUARD_PREPARE){
   api.sound('usurpador-asa',.91,e.x);
   stage(e,'rise');
  }
 }else if(f.stage==='rise'){
  const duration=f.kind==='guard'?GUARD_RISE:.61,p=ease(f.t/duration);
  const altitude=f.kind==='guard'?150:f.kind==='gust'?505:480;
  e.x=mix(f.fromX,f.target,p);
  e.y=mix(f.fromY,altitude,p);
  if(before<duration*.47&&f.t>=duration*.47)api.sound('usurpador-asa',.48,e.x);
  if(f.t>=duration){
   if(f.kind==='guard'){
    api.clearAttacks();
    f.spawned??=0;
    stage(e,'summon');
   }else{
    f.target=clamp(h.x,LEFT,RIGHT);
    f.dir=f.target<e.x?-1:1;
    e.face=f.dir;
    stage(e,'aim');
     if(f.kind==='dive')api.sound('usurpador-prepara',.65,e.x);
   }
  }
 }else if(f.stage==='aim'){
  if(f.t>=(f.kind==='gust'?.51:.46)){
   if(f.kind==='gust'){
    api.impact(e,'wing-gust',f.dir);
    stage(e,'settle');
   }else{
    api.sound('usurpador-mergulho',.90,e.x);
    stage(e,'dive');
   }
  }
 }else if(f.stage==='dive'){
  const p=clamp(f.t/DIVE_DURATION,0,1);
  e.x=mix(f.fromX,f.target,p);
  e.y=mix(f.fromY,api.ground,p*p);
  if(!f.hit&&api.diveHit(e))f.hit=true;
  if(p>=1)knockdown(e,api,'dive');
 }else if(f.stage==='settle'){
  const p=ease(f.t/.57);
  e.y=mix(f.fromY,api.ground,p);
  if(p>=1)knockdown(e,api,'soft');
 }else if(f.stage==='summon'){
  if(f.spawned<GUARDS.length&&f.t>=f.spawned*GUARD_INTERVAL){
   const [type,x]=GUARDS[f.spawned++];
   api.guard(type,x);
   api.sound('usurpador-guardiao',.61,x);
   f.healPulse=.19;
  }
  healGuard(e,world,dt);
  if(f.spawned===GUARDS.length)stage(e,'guard');
 }else if(f.stage==='guard'){
  if(guardCount(world)>0){
   healGuard(e,world,dt);
   e.y=150+Math.sin(f.t*3)*19;
  }else stage(e,'warning');
 }else if(f.stage==='warning'){
  if(f.t>=.95)stage(e,'drop');
 }else if(f.stage==='drop'){
  const p=clamp(f.t/.45,0,1);
  e.y=mix(f.fromY,api.ground,p*p);
  if(p>=1)knockdown(e,api,'dust-slam');
 }else if(f.stage==='recover'&&f.t+1e-7>=f.recover){
  e.flight=null;
  e.airCooldown=5.3;
  e.state='idle';
  e.t=0;
  e.cd=.45;
 }
 return true;
}

export function devilUntargetable(e) {
 const f=e.flight;
 return e.state==='finalShift'||(f?.kind==='guard'&&f.stage!=='recover');
}

export function dustTouches(h, oldX, wave, previousRadius, ground) {
 if(h.y<=ground-DUST_HEIGHT)return false;
 const from=oldX-wave.x, to=h.x-wave.x;
 const a=wave.dir?wave.dir*from:Math.abs(from);
 const b=wave.dir?wave.dir*to:Math.abs(to);
 const closest=!wave.dir&&from*to<=0?0:Math.min(a,b);
 return Math.max(a,b)>=previousRadius-DUST_HALF_WIDTH&&
  closest<=wave.radius+DUST_HALF_WIDTH;
}
