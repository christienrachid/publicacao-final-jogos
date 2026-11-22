import {bossArt,bossDrawing} from './boss-animation.js';
import {ENEMY_ART} from './enemy-metrics.js';
import {ATK} from './attacks.js';
export const isCommon=e=>!!ENEMY_ART[e.type];
export function enemyPose(e){
 if(!isCommon(e))return e.type;
 if(e.dead)return 'dead';
 if(e.state==='stun'||e.state==='idle'&&e.hitFlash>0)return 'hurt';
 if(['wind','act','rec'].includes(e.state)&&e.atk)return 'attack'+Math.max(0,ATK[e.type].indexOf(e.atk));
 if(e.terrainJump&&ENEMY_ART[e.type].poses.jump)return 'jump';
 return Math.abs(e.vx)>12&&e.onGround?'walk':'idle';
}
export function enemyFrame(e,pose=enemyPose(e)){
 if(!isCommon(e))return 0;
 if(pose==='walk'){const f=Math.floor((e.walkDistance??0)/ENEMY_ART[e.type].stride*6)%6;return e.vx*e.face<0?(6-f)%6:f;}
 if(pose==='idle')return Math.floor((e.animTime??0)*2.2)%2;
 if(pose==='dead')return e.deathT<.24?0:1;
 if(pose==='hurt')return e.state==='stun'&&e.stun>.35?0:1;
 if(pose==='jump'){
  if(e.terrainJump.stage==='takeoff')return 0;
  if(e.terrainJump.stage==='land')return 3;
  return e.vy<40?1:2;
 }
 if(pose.startsWith('attack'))return e.state==='wind'?(e.t<e.atk.wind*.48?0:1):e.state==='act'?2:3;
 return 0;
}
export function enemyArt(e){return ENEMY_ART[e.type]?.poses[enemyPose(e)]?.[enemyFrame(e)]??bossArt(e);}
export function enemyDrawing(e){
 const art=ENEMY_ART[e.type];
 if(!art)return bossDrawing(e);
 const pose=enemyPose(e),frame=enemyFrame(e,pose);
 const pixelScale=art.worldHeight/art.artHeight*2/3;
 const drawing={name:e.type+'-'+pose,frame,size:art.canvas*pixelScale,top:art.worldHeight*2/3};
 if(pose==='jump'){
  drawing.width=art.jumpCanvas.size[0]*pixelScale;
  drawing.height=art.jumpCanvas.size[1]*pixelScale;
  drawing.top=art.poses.jump[frame].visualTop*2/3;
 }
 return drawing;
}
