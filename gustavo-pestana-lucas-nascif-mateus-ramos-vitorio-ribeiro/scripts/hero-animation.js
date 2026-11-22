import {HERO_ART} from './hero-metrics.js';
export const HERO_DRAW={width:640,height:400,frames:6,fps:10};
export const runFrame=h=>Math.floor(h.walkTime*10)%6;
export function heroPose(h,ultimate=h.visualTrans??false){
 const p=h.state==='move'?(!h.onGround?'jump':Math.abs(h.vx)>20?'run':'idle'):
 h.state==='cast'?'parry':['attack','dash','dodge','parry','hurt','dead'].includes(h.state)?h.state:'idle';
 return(ultimate?'ult-':'')+p;
}
export function heroFrame(h,pose=heroPose(h),clock=h.animClock??0){
 const p=pose.replace(/^ult-/,''),t=h.t??0;
 if(p==='run')return runFrame(h);
 if(p==='idle')return Math.floor(clock*2.6)%4;
 if(p==='jump')return h.vy< -450?0:h.vy<200?1:h.vy<700?2:3;
 if(p==='attack'){const dur=[.32,.32,.45][h.combo??0];return t<.05?0:t<.13?1:t<dur-.08?2:3;}
 if(p==='dash')return t<.018?0:t<.085?1:t<.15?2:3;
 if(p==='dodge')return t<.04?0:t<.14?1:t<.25?2:3;
 if(p==='parry')return h.state==='cast'?1:t<.035?0:t<.13?1:t<.23?2:3;
 if(p==='hurt')return t<.18?0:1;
 if(p==='dead')return h.deadT<.35?0:1;
 return 0;
}
export function heroArt(h){const key=heroPose(h);return HERO_ART[key][heroFrame(h,key)];}
