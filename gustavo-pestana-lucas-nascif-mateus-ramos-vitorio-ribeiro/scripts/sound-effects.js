import {EFFECTS} from './effects-cues.js';
import {ULT_CINE} from './ultimate-timing.js';
import {guardSceneProgress} from './devil-flight.js';

const BANK = 'efeitos-da-vigilia.ogg';
const BOSS_BANK = 'efeitos-usurpador.ogg';
const AMBIENCE = ['wind','forest','water','vault','forge','vault','wind','night','vault','forge'];
const SHORT_SKIP = ULT_CINE.reveal - ULT_CINE.turn;
const clamp = value => Math.max(0, Math.min(1, value));

export function createEffects(runtime, getContext, exit) {
 const pending=[BANK,BOSS_BANK].map(file=>[file,Promise.resolve().then(async()=>{
  const url = await runtime.assets.getProjectFileUrl(file);
  const response = await fetch(url);
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
 }).catch(error => {
  console.warn(`[Última Vigília] ${file} indisponível.`,error);
  return null;
 })]);
 const buffers=new Map();
 let context, bus, loading, world, mode, volume=0, suspended=false;
 let cinematic, cinematicPlayback, ambience, brazier;
 const live = new Set();
 const variation = new Map();
 const recent = new Map();

 function stop(part) {
  if (!part || part.stopped) return;
  part.stopped=true;
  part.source.onended=null;
  part.source.stop();
  part.disconnect();
 }

 function sample(name, {level=1,pan=0,loop=false,elapsed=0,category='world'}={}) {
  const choices=EFFECTS[name];
  if (!choices || !volume || suspended || !context || context.state!=='running') return null;
  const previous=variation.get(name);
  const next=previous===undefined?0:(previous+1)%choices.length;
  const [start,duration,file=BANK]=choices[next];
  const buffer=buffers.get(file);
  if(!buffer||elapsed>=duration)return null;
  variation.set(name,next);
  const source=context.createBufferSource(), gain=context.createGain();
  const panner=context.createStereoPanner?.();
  source.buffer=buffer;
  gain.gain.value=loop?0:level;
  source.connect(gain);
  if (panner) {
   panner.pan.value=pan;
   gain.connect(panner);
   panner.connect(bus);
  } else gain.connect(bus);
  const part={name,source,gain,level,category,disconnect(){
   live.delete(part); source.disconnect(); gain.disconnect(); panner?.disconnect();
  }};
  source.onended=()=>{part.stopped=true;part.disconnect();};
  if (loop) {
   source.loop=true;
   source.loopStart=start;
   source.loopEnd=start+duration;
   source.start(0,start);
   gain.gain.setTargetAtTime(level, context.currentTime, .18);
  } else source.start(0,start+elapsed,duration-elapsed);
  live.add(part);
  return part;
 }

 function syncLoop(part, name, level) {
  if (part && part.name===name && level>0) {
   if (Math.abs(part.level-level)>=.012) {
    part.gain.gain.setTargetAtTime(level,context.currentTime,.16);
    part.level=level;
   }
   return part;
  }
  stop(part);
  return name && level>0 ? sample(name,{loop:true,level,category:'loop'}) : null;
 }

 function syncScene() {
  const playing=mode==='play' && !suspended && volume>0;
  const next=world?.cine;
  if (!playing || next && next!==cinematic) {
   stop(cinematicPlayback);
   cinematicPlayback=null;
  }
  cinematic=next;
  if (playing && next && !cinematicPlayback) {
   const short=next.short===true;
   const elapsed=short && next.t>=ULT_CINE.reveal ? next.t-SHORT_SKIP : next.t;
   cinematicPlayback=sample(short?'ultimate-short':'ultimate-long',{elapsed,category:'cinematic'});
  }
  const summoning=guardSceneProgress(world?.boss)!==null;
  const ambient=playing && !next && world && !world.finalShift && !summoning && world.hero.state!=='dead' ?
   (world.li===9&&world.arenaOn?'vault':AMBIENCE[world.li]) : null;
  ambience=syncLoop(ambience,ambient?'ambient-'+ambient:null,ambient?.33:0);
  const distance=world?.hero&&world.arenaDone&&!world.completed&&playing&&!next&&!world.finalShift ?
   Math.hypot((world.hero.x-exit)/1.4,(world.hero.y-940)*1.4) : Infinity;
  const warmth=clamp(1-distance/335);
  brazier=syncLoop(brazier,'brazier-fire',warmth**1.3*.82);
 }

 function unlock() {
  try {
   if (!context) {
    context=getContext();
    bus=context.createGain();
    bus.gain.value=volume;
    bus.connect(context.destination);
   }
   loading ??= Promise.all(pending.map(([file,request])=>request
    .then(data=>data&&context.decodeAudioData(data))
    .then(decoded=>{
     if(decoded)buffers.set(file,decoded);
     syncScene();
    }).catch(error=>console.warn(`[Última Vigília] Falha ao decodificar ${file}.`,error))));
   if (context.state!=='running') void context.resume().then(syncScene).catch(()=>{});
  } catch { /* navegador sem Web Audio */ }
 }

 function sync(nextWorld,nextMode,settings) {
  if (nextWorld!==world || nextMode!==mode && nextMode!=='play') {
   for (const part of live) if (part.category!=='ui') stop(part);
   cinematicPlayback=null;
   ambience=null;
   brazier=null;
   recent.clear();
  }
  world=nextWorld;
  mode=nextMode;
  const nextVolume=settings.master*settings.effects;
  if (nextVolume!==volume) {
   volume=nextVolume;
   if(bus)bus.gain.setTargetAtTime(volume,context.currentTime,.035);
  }
  syncScene();
 }

 function play(name, level=1, x=null, ui=false) {
  if(!context || !buffers.size || !volume || suspended || live.size>=18)return;
  const dx=Number.isFinite(x)&&world ? x-world.hero.x : 0;
  level*=clamp(1-Math.abs(dx)/1550)**1.25;
  if (level<.025) return;
  const now=context.currentTime;
  if(now-(recent.get(name)??-Infinity)<(ui?.065:.047))return;
  const part=sample(name,{level,pan:Math.max(-.78,Math.min(.78,dx/950)),category:ui?'ui':'world'});
  if(part)recent.set(name,now);
 }

 function setSuspended(value) {
  suspended=value;
  if(value){
   for(const part of live)stop(part);
   cinematicPlayback=ambience=brazier=null;
  }else syncScene();
 }

 return {unlock,sync,play,setSuspended};
}
