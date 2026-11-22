// Visual-only selectors. Gameplay collision, damage, speed and clocks are in
// game-core.js and retain their existing values.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const loopFrame=(clock,fps=12)=>((Math.floor(clock*fps)%4)+4)%4;
export function sourceFamily(source){
 if(source==='drowned')return 'water';
 if(['smith','devil'].includes(source))return 'fire';
 if(source==='herald')return 'holy';
 if(['eclipse','nameless','specter'].includes(source))return 'crimson';
 if(['archivist','acolyte'].includes(source))return 'void';
 return 'stone';
}
export function projectileVisual(p,clock){
 const kind=p.type==='arrow'?'arrow':p.type==='water'?'orb-water':p.type==='fire'?'orb-fire':p.source==='herald'?'orb-holy':'orb-void';
 return {name:kind,frame:loopFrame(4-(p.life??4)),width:p.type==='arrow'?54:84,height:p.type==='arrow'?16:84,angle:Math.atan2(p.vy,p.vx)};
}
export function hazardVisual(z,state){
 let family=z.style==='spike'?'bone':z.style==='water'?'water':z.style==='holy'?'holy':z.style==='fire'?'fire':sourceFamily(z.source??state.boss?.type??state.lv.arena[0]);
 if(z.type==='flame')family=z.color?.startsWith('220,40')?'crimson':'fire';
 const warn=Number.isFinite(z.t)&&z.t<z.warn;
 const age=Number.isFinite(z.t)?z.t-z.warn:state.time;
 let name,width,height;
 if(warn){name='warning-'+family;width=z.w?z.w*2/3:140*2/3;height=32;}
 else if(z.type==='wave'){name='wave-'+(family==='bone'?'stone':family==='void'?'crimson':family==='holy'?'stone':family);width=80*(z.dir??1);height=95;}
 else if(z.type==='flame'){name='flame-'+family;width=z.w*2/3;height=120;}
 else {name=family==='bone'?'spike-bone':family==='fire'?'pillar-fire':family==='holy'?'pillar-holy':'pillar-void';width=100;height=210;}
 const frame=warn?clamp(Math.floor(clamp(z.t/Math.max(.001,z.warn),0,1)*4),0,3):z.type==='pillar'?clamp(Math.floor(age/Math.max(.001,z.act??.35)*4),0,3):loopFrame(age);
 return {name,frame,width,height,opacity:warn?.65+.25*clamp(z.t/z.warn,0,1):1};
}
export function trapFireVisual(phase,clock,index=0){
 const family=phase===5?'void':phase===7?'crimson':phase===8?'holy':'fire';
 return {name:'flame-'+family,frame:loopFrame(clock+index/12)};
}
export function bossSlashVisual(e){
 const f=sourceFamily(e.type),family=f==='stone'?'steel':f;
 return {name:'slash-'+family,frame:clamp(Math.floor((e.t??0)/Math.max(.001,e.atk?.act??.2)*4),0,3)};
}
export function particleVisual(p){
 const c=p.color?.toLowerCase(),age=Math.max(0,(p.max??.4)-p.life),parry=c==='#ffe080';
 return {name:parry?'parry':'spark',frame:clamp(Math.floor(age/Math.max(.001,p.max??.4)*4),0,3),parry};
}
