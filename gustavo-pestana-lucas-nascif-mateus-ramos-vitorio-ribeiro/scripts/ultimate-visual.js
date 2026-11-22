import {ULT_CINE as T,cinematicStage} from './ultimate-timing.js';
import {ULT_ART} from './ultimate-art.js';
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const phase=(t,a,b)=>clamp((t-a)/(b-a));
// One authored layout, repeated for every cast. Shards remain completely still.
const BROKEN=[[490,-65,-.44],[1100,85,.30],[420,280,-.48],[855,385,.42],[190,665,-.29],[680,685,.12],[1230,740,.40],[370,900,-.28],[890,890,.20]];
export function shardPose(f,n,t){
 const [x,y,angle]=BROKEN[n],p=t<T.repair?0:smooth(phase(t,T.repair,T.repaired));
 return{x:x+(f.x-x)*p,y:y+(f.y-y)*p,angle:angle*(1-p)};
}
function line(out,key,x1,y1,x2,y2,color,alpha=1,width=2){out.push({key,type:'Forma',x:x1,y:y1,w:Math.hypot(x2-x1,y2-y1),h:width,angle:Math.atan2(y2-y1,x2-x1),alpha,color});}
function glow(out,key,x1,y1,x2,y2,color,alpha,width){out.push({key,type:'Brilho',anim:'idle',x:(x1+x2)/2,y:(y1+y2)/2,w:Math.hypot(x2-x1,y2-y1)+12,h:width,angle:Math.atan2(y2-y1,x2-x1),alpha,color});}
// Sample the true polygon perimeter, keeping the aura attached during repair.
function perimeterPoint(f,u,offset){
 const edges=f.polygon.map((a,j)=>{const b=f.polygon[(j+1)%f.polygon.length];return{a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])};});
 const total=edges.reduce((sum,e)=>sum+e.length,0);let remaining=((u%1)+1)%1*total;
 for(const e of edges){
  if(remaining<=e.length){const p=remaining/e.length,nx=(e.b[1]-e.a[1])/e.length,ny=-(e.b[0]-e.a[0])/e.length;return[e.a[0]+(e.b[0]-e.a[0])*p+nx*offset,e.a[1]+(e.b[1]-e.a[1])*p+ny*offset];}
  remaining-=e.length;
 }
 return f.polygon[0];
}
function telekineticArcs(out,f,n,t,x,y,angle,strength,intensity){
 const co=Math.cos(angle),si=Math.sin(angle),age=t-T.break;
 const point=(u,offset)=>{const a=perimeterPoint(f,u,offset);return[x+a[0]*co-a[1]*si,y+a[0]*si+a[1]*co];};
 for(let orbit=0;orbit<2;orbit++){
  const u=age*(.35+strength*.12)+n*.137+orbit*.51,tail=.095+.055*strength;
  let previous=point(u,5+strength*3);
  for(let j=1;j<=9;j++){
   const next=point(u-tail*j/9,5+strength*3+Math.sin(age*13+n*2.1+j*1.8)*(1+strength*3));
   const fade=1-j/11,alpha=(.20+.76*strength)*fade*intensity;
   glow(out,`tele-aura-${n}-${orbit}-${j}`,...previous,...next,'#8e31e8',alpha*.48,12+strength*12);
   line(out,`tele-arc-${n}-${orbit}-${j}`,...previous,...next,'#bb70ff',alpha,1.7+strength*1.8);
   previous=next;
  }
  const head=point(u,5+strength*3),size=2.5+strength*3;
  out.push({key:`tele-head-${n}-${orbit}`,type:'Forma',x:head[0]-size/2,y:head[1]-size/2,w:size,h:size,angle:Math.PI/4,alpha:(.25+.7*strength)*intensity,color:'#edcbff'});
  const glint=(.2+strength*.8)*intensity;
  line(out,`tele-glint-${n}-${orbit}`,head[0],head[1]-3-strength*4,head[0],head[1]+3+strength*4,'#dca5ff',glint,1.2+strength);
 }
}
export function ultimateFrame(t,{reduceFlash=false}={}){
 if(t<0||t>=T.end)return[];
 const out=[],stage=cinematicStage(t),cutY=T.slashY;
 const image=(key,anim,x=640,y=360,w=1280,h=720,alpha=1,angle=0)=>out.push({key,type:'UltimaCena',anim,x,y,w,h,alpha,angle,color:'#ffffff'});
 out.push({key:'void',type:'Forma',x:0,y:0,w:1280,h:720,alpha:1,color:'#080510',angle:0});
 if(stage==='silencio'){const z=1+.018*smooth(phase(t,0,T.turn));image('closed','silencio',640,360,1280*z,720*z);}
 if(stage==='impacto-troca'){
  out.push({key:'shift-impact',type:'Forma',x:0,y:0,w:1280,h:720,alpha:1,color:reduceFlash?'#180d25':'#e9d7ff',angle:0});
  line(out,'shift-edge',650,-20,650,740,reduceFlash?'#b57bea':'#1e0c31',1,3);
 }
 if(stage==='reflexo')image('reflection','reflexo');
 if(t>=T.crack&&t<T.shatterImpact){
  const p=smooth(phase(t,T.crack,T.shatterImpact));
  for(const [n,path]of [[[525,500],[672,402],[734,425],[855,300]],[[603,154],[702,300],[672,402],[608,576]],[[672,402],[830,490],[880,594]]].entries())
   for(let j=0;j<path.length-1;j++)line(out,`crack-${n}-${j}`,...path[j],...path[j+1],'#e7c9ff',p*.8,1.5);
 }
 if(stage==='impacto-quebra'||stage==='impacto-reparo'){
  const breaking=stage==='impacto-quebra',key=breaking?'shatter':'reform';
  out.push({key:key+'-impact',type:'Forma',x:0,y:0,w:1280,h:720,alpha:1,color:reduceFlash?'#180d25':breaking?'#ece0ff':'#f2e7ff',angle:0});
  if(breaking){
   for(let n=0;n<7;n++){const a=n*2.39996;line(out,'break-ray-'+n,710,355,710+Math.cos(a)*950,355+Math.sin(a)*750,reduceFlash?'#b484e0':'#170a23',1,n%2?3:5);}
  }else line(out,'reform-edge',540,735,980,-20,reduceFlash?'#b484e0':'#28103d',1,5);
 }
 if(t>=T.break&&t<T.repaired){
  image('ruins','ruinas');
  const teleStrength=smooth(phase(t,T.break,T.repaired)),teleIntensity=reduceFlash?.5:1;
  for(const [n,f]of ULT_ART.fragments.entries()){
   const {angle,x,y}=shardPose(f,n,t),co=Math.cos(angle),si=Math.sin(angle);
   out.push({key:'fragment-'+n,type:'UltimaFragmento',anim:f.name,x,y,w:f.w,h:f.h,angle,alpha:1,color:'#ffffff'});
   const edgeAlpha=(.22+.68*teleStrength)*teleIntensity;
   for(let j=0;j<f.polygon.length;j++){
    const a=f.polygon[j],b=f.polygon[(j+1)%f.polygon.length],ax=x+a[0]*co-a[1]*si,ay=y+a[0]*si+a[1]*co,bx=x+b[0]*co-b[1]*si,by=y+b[0]*si+b[1]*co;
    glow(out,`edge-glow-${n}-${j}`,ax,ay,bx,by,'#8f35eb',edgeAlpha*.60,6+teleStrength*16);
    line(out,`edge-${n}-${j}`,ax,ay,bx,by,'#c487ff',edgeAlpha,1+teleStrength*2);
   }
   telekineticArcs(out,f,n,t,x,y,angle,teleStrength,teleIntensity);
  }
  // Frozen dust accents reinforce the suspended instant, without drifting pieces.
  for(let n=0;n<13;n++){
   const a=n*2.39996,radius=40+(n%5)*42;
   out.push({key:'spark-'+n,type:'Forma',x:710+Math.cos(a)*radius,y:355+Math.sin(a)*radius*1.25,w:2+n%3,h:2+n%3,angle:a,alpha:.45,color:n%3?'#bb84f3':'#f0d8ff'});
  }
 }
 if(stage==='reflexo-branco'||stage==='corte')image('white-reflection','reflexo-branco');
 if(stage==='corte'){
  const p=smooth(phase(t,T.cut,T.impact)),endX=-70+1420*p;
  const intensity=reduceFlash?.55:1;
  glow(out,'scene-cut-halo',-70,cutY,endX,cutY,'#8c36dc',.45*intensity,80);
  glow(out,'scene-cut-glow',-70,cutY,endX,cutY,'#b065f4',.75*intensity,38);
  line(out,'scene-cut-edge',-70,cutY,endX,cutY,'#c28bfa',.97,6);
  line(out,'scene-cut-core',-70,cutY,endX,cutY,'#fff0ff',1,2.2);
  // Fixed emitters along the slash; their sparks appear only after the tip passes.
  const elapsed=t-T.cut,duration=T.impact-T.cut;
  for(let n=0;n<60;n++){
   const u=(n+.7)/60.7;
   // Invert smoothstep numerically so emission remains locked to the actual tip.
   let lo=0,hi=1;for(let k=0;k<14;k++){const m=(lo+hi)/2;if(smooth(m)<u)lo=m;else hi=m;}
   const age=elapsed-(lo+hi)/2*duration;
   if(age<0||age>.52)continue;
   const life=age/.52,fade=Math.pow(1-life,1.2),side=n%2?-1:1;
   const x=-70+1420*u+(n%3-1)*age*45,y=cutY+side*(age*(90+n%7*24)+age*age*100);
   line(out,'cut-spark-'+n,x,y,x-(n%3-1)*6,y-side*(6+11*(1-life)),'#ae53ff',fade*.98*intensity,3.2);
   out.push({key:'cut-ember-'+n,type:'Forma',x,y,w:3+n%3,h:3+n%3,angle:n*.72+age*3,alpha:fade*intensity,color:'#deb3ff'});
   if(n%3===0){
    const gx=-70+1420*u,glow=Math.sin(life*Math.PI)*intensity;
    line(out,'cut-glint-h-'+n,gx-22*(1-life),cutY,gx+22*(1-life),cutY,'#e8baff',glow*.98,2.3);
    line(out,'cut-glint-v-'+n,gx,cutY-16*(1-life),gx,cutY+16*(1-life),'#b66dff',glow*.98,2.3);
   }
  }
  if(endX>-30&&endX<1310){
   line(out,'cut-tip-h',endX-25,cutY,endX+25,cutY,'#edc9ff',.96*intensity,3);
   line(out,'cut-tip-v',endX,cutY-20,endX,cutY+20,'#c283ff',.96*intensity,2.4);
  }
 }

 if(stage==='impacto'){
  const first=t<T.impact+.06;
  out.push({key:'impact',type:'Forma',x:0,y:0,w:1280,h:720,alpha:1,color:reduceFlash?'#180d25':first?'#f8efff':'#050208',angle:0});
  line(out,'impact-cut',-70,cutY,1350,cutY,first&&!reduceFlash?'#0b0413':'#edceff',1,first?9:5);
  line(out,'impact-echo',-70,cutY+17,1350,cutY-18,'#9e50e7',.65,2);
 }
 // Slow, transparent fog on the cinematic layer; its clock also freezes on pause.
 const fogAmount=stage.startsWith('impacto')?.4:1;
 out.push({key:'cine-fog-low',type:'Nevoa',anim:'idle',x:-260+t*14,y:425+Math.sin(t*.25)*12,w:1800,h:320,alpha:.20*fogAmount,color:'#b7a6ce',angle:0,originX:0,originY:0});
 out.push({key:'cine-fog-high',type:'Nevoa',anim:'idle',x:-100-t*9,y:110+Math.sin(t*.18+2)*14,w:1580,h:240,alpha:.10*fogAmount,color:'#a797ba',angle:0,originX:0,originY:0});
 // Nothing is drawn after the final black impact: the game resumes directly.
 return out.filter(c=>c.alpha>.001&&c.w>0&&c.h>0);
}
export function createUltimateRenderer(runtime){
 const items=new Map(),rgb=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
 function render(cine,mode,settings){
  for(const i of items.values())i.isVisible=false;
  if(!cine||!['play','paused'].includes(mode))return;
  let previous=null;
  for(const c of ultimateFrame(cine.t,settings)){
   let i=items.get(c.key);
   if(!i){i=runtime.objects[c.type].createInstance('Interface',c.x,c.y);items.set(c.key,i);}
   i.isVisible=true;if(c.anim&&i.animationName!==c.anim)i.setAnimation(c.anim);
   i.setPosition(c.x,c.y);i.setSize(c.w,c.h);i.angle=c.angle??0;i.opacity=c.alpha;i.colorRgb=rgb(c.color);
   if(previous)i.moveAdjacentToInstance(previous,true);previous=i;
  }
 }
 return{render};
}
