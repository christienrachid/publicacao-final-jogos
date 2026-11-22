import {BOSS_ART} from './boss-metrics.js';
import {ATK} from './attacks.js';
import {DIVE_DURATION} from './devil-flight.js';
const atFrame=(count,progress)=>Math.max(0,Math.min(count-1,Math.floor(count*progress)));
const swordPlanted=e=>!e.dead&&e.type==='devil'&&e.phase===2&&e.flight?.stage==='recover'&&e.flight.kind!=='gust';
const plantedArt={
 hurt:[[-131,-430,141,106],[-169,-352,230,118],[-99,-294,205,139],[-237,-211,125,208],[16,-232,130,232]],
 muzzle:[-65,-196]
};
const plantedDrawing={name:'devil2-flight-planted',width:530,height:530*824/1152,top:361};
export function bossKey(e){return e.type==='devil'&&e.phase===2?'devil2':e.type;}
export function bossPose(e){
 if(e.dead)return 'dead';
 if(e.state==='stun'||e.state==='idle'&&e.hitFlash>0)return 'hurt';
 if(['wind','act','rec'].includes(e.state)&&e.atk)return 'attack'+Math.max(0,ATK[e.type].indexOf(e.atk));
 return Math.abs(e.vx)>12&&e.onGround?'walk':'idle';
}
export function bossFrame(e,pose=bossPose(e)){
 const art=BOSS_ART[bossKey(e)];if(!art)return 0;
 if(pose==='walk'){const f=Math.floor((e.walkDistance??0)/art.stride*6)%6;return e.vx*e.face<0?(6-f)%6:f;}
 if(pose==='idle')return Math.floor((e.animTime??0)*2.2)%2;
 if(pose==='dead')return e.deathT<.24?0:1;
 if(pose==='hurt')return e.state==='stun'&&e.stun>.35?0:1;
 if(pose.startsWith('attack'))return e.state==='wind'?(e.t<e.atk.wind*.48?0:1):e.state==='act'?2:3;
 return 0;
}
export function bossArt(e){
 if(swordPlanted(e))return plantedArt;
 return BOSS_ART[bossKey(e)]?.poses[bossPose(e)]?.[bossFrame(e)];
}
export function bossDrawing(e){
 if(!e.dead&&e.type==='devil'){
  if(e.state==='finalShift'&&!e.revealing)return {name:'devil-kneeling',frame:0,width:349,height:365,top:365};
  if(swordPlanted(e))return {...plantedDrawing,frame:Math.floor(e.flight.t*12)%12};
  const f=e.flight;
  if(f||e.revealing||e.wingReveal>0){
   const airborne=e.revealing?Math.min(1,(e.wingOpening??0)*1.6):1;
   const frame=e.revealing?atFrame(16,airborne):Math.floor((e.animTime??0)*21)%16;
   const drawing={name:'devil2-airborne',frame,width:806*(.74+.26*airborne),height:532,top:490};
   if(!f)return drawing;
   const {stage,t,kind}=f;
   const choose=(pose,count,p)=>({...drawing,name:'devil2-flight-'+pose,frame:atFrame(count,p),width:806});
   if(stage==='prepare')return choose('land',6,1-t/.72);
   if(stage==='aim')return choose('wind',8,t/(kind==='gust'?.51:.46));
   if(stage==='dive')return choose('dive',12,t/DIVE_DURATION);
   if(stage==='drop')return choose('dive',12,t/.45);
   if(stage==='recover')return choose('land',6,t/Math.min(.58,f.recover??.58));
   return drawing;
  }
 }
 const key=bossKey(e),art=BOSS_ART[key];
 if(!art)return null;
 const unit=art.worldHeight/art.artHeight*2/3;
 return {name:key+'-'+bossPose(e),frame:bossFrame(e),size:art.canvas*unit,
  width:art.drawSize[0]*unit,height:art.drawSize[1]*unit,top:art.worldHeight*2/3};
}
