import {ART} from './art-metrics.js';
import {enemyArt} from './enemy-animation.js';
// World units. Artwork is rendered at 2/3 world scale. Locomotion hulls
// deliberately remain independent from the anatomically registered hurt regions.
export {HERO_DRAW,runFrame} from './hero-animation.js';
import {heroArt,heroFrame} from './hero-animation.js';
import {HERO_ART} from './hero-metrics.js';
const placed=(x,y,face,r)=>({x:x+(face>0?r[0]:-r[0]-r[2]),y:y+r[1],w:r[2],h:r[3]});
export function heroHurt(h){return heroArt(h).hurt.map(r=>placed(h.x,h.y,h.face,r));}
export function enemyHurt(e){return (enemyArt(e)??ART[e.type]).hurt.map(r=>placed(e.x,e.y,-e.face,r));}
export function bounds(regions){const x=Math.min(...regions.map(r=>r.x)),y=Math.min(...regions.map(r=>r.y));return{x,y,w:Math.max(...regions.map(r=>r.x+r.w))-x,h:Math.max(...regions.map(r=>r.y+r.h))-y};}
export function rectHit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
export function regionsHit(a,b){return a.some(r=>b.some(q=>rectHit(r,q)));}
export function heroAim(h){const r=heroHurt(h)[1]??heroHurt(h)[0];return{x:r.x+r.w/2,y:r.y+r.h*.4};}
export function muzzle(e){const m=(enemyArt(e)??ART[e.type]).muzzle;return{x:e.x-m[0]*e.face,y:e.y+m[1]};}

function pointSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-ax-t*dx,py-ay-t*dy);}
function segmentRect(s,r){
 const [ax,ay,bx,by]=s;let lo=0,hi=1;
 for(const [p,d,mn,mx]of [[ax,bx-ax,r.x,r.x+r.w],[ay,by-ay,r.y,r.y+r.h]]){
  if(Math.abs(d)<1e-9){if(p<mn||p>mx)return false;continue;}
  let a=(mn-p)/d,b=(mx-p)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return false;
 }return true;
}
export function capsuleHit(s,r){
 if(segmentRect(s,r))return true;
 const [ax,ay,bx,by,rad]=s;
 const dist=(x,y)=>Math.hypot(Math.max(r.x-x,0,x-r.x-r.w),Math.max(r.y-y,0,y-r.y-r.h));
 return Math.min(dist(ax,ay),dist(bx,by),...[[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]].map(([x,y])=>pointSeg(x,y,ax,ay,bx,by)))<=rad;
}
// The blade and its painted swept arc, measured in the original attack frame.
// One common anatomy scale is applied to every action in each form.
export function swordSweep(h,ultimate=false,fromX=h.x){
 const pose=(ultimate?'ult-':'')+(h.state==='dash'?'dash':'attack');
 const frame=['attack','dash'].includes(h.state)&&Number.isFinite(h.t)?heroFrame(h,pose):1;
 const paths=HERO_ART[pose][frame].blade;
 const caps=paths.map(([a,b,c,d,r])=>[h.x+a*h.face,h.y+b,h.x+c*h.face,h.y+d,r]);
 // Trace both blade endpoints between consecutive painted poses. This keeps
 // close-range contacts in the swing instead of testing only the extended tip.
 if(frame>0){const old=HERO_ART[pose][frame-1].blade[0],now=paths[0];if(old&&now){
  for(const n of [0,2])caps.push([h.x+old[n]*h.face,h.y+old[n+1],h.x+now[n]*h.face,h.y+now[n+1],Math.max(old[4],now[4])]);
 }}
 if(fromX!==h.x)for(const c of [...caps])caps.push([c[0]+fromX-h.x,c[1],c[2],c[3],c[4]]);
 return caps;
}
export function swordHits(h,e,ultimate=false,fromX=h.x){return swordSweep(h,ultimate,fromX).some(c=>enemyHurt(e).some(r=>capsuleHit(c,r)));}
export function enemyStrike(e,a){
 if(a.leap)return enemyHurt(e);
 const body=bounds(enemyHurt(e)),anchor=muzzle(e);
 // Reach/duration/damage remain from ATK; lift the strike to the weapon hand.
 const height=a.h||130,center=anchor.y;
 return [{x:e.face>0?body.x+body.w*.45:body.x+body.w*.55-a.w,y:center-height*.5,w:a.w,h:height}];
}
export function projectileHit(p,h,oldX=p.x,oldY=p.y){
 const length=p.type==='arrow'?32:0,radius=p.type==='arrow'?4:p.r,angle=Math.atan2(p.vy,p.vx);
 const s=[oldX-Math.cos(angle)*length,oldY-Math.sin(angle)*length,p.x+Math.cos(angle)*length,p.y+Math.sin(angle)*length,radius];
 return heroHurt(h).some(r=>capsuleHit(s,r));
}
