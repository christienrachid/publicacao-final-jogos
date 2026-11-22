import {VOICE_CUES} from './hero-voice-cues.js';

const BANK_FILE = 'vozes-protagonista.wav';

export function createHeroVoice(runtime, getContext) {
 const encoded = runtime.assets?.getProjectFileUrl
  ? Promise.resolve().then(() => runtime.assets.getProjectFileUrl(BANK_FILE)).then(async url => {
    const response = await fetch(url);
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
   }).catch(error => {
    console.warn('[Última Vigília] Não foi possível carregar as vozes.',error);
    return null;
   })
  : Promise.resolve(null);
 let context, gain, decoding, buffer, active, world;
 let mode='menu', volume=0, ready=false, suspended=false;

 function releaseSource(cue) {
  const source=cue.source;
  if(!source)return;
  cue.source=null;
  source.onended=null;
  source.stop();
  source.disconnect();
 }
 function clear() {
  if(active)releaseSource(active);
  active=null;
 }
 function playSlice() {
  if(!active||active.source||!buffer||context.state!=='running'||mode==='paused'||suspended)return;
  const cue=active,remaining=cue.clip.duration-cue.elapsed;
  if(remaining<=0.005){clear();return;}
  const source=context.createBufferSource();
  source.buffer=buffer;
  source.connect(gain);
  cue.source=source;
  cue.started=context.currentTime;
  source.onended=()=>{
   source.disconnect();
   if(active===cue&&cue.source===source)active=null;
  };
  source.start(0,cue.clip.start+cue.elapsed,remaining);
 }
 function unlock() {
  try{
   if(!context){
    context=getContext();
    gain=context.createGain();
    gain.gain.value=volume;
    gain.connect(context.destination);
   }
   if(context.state==='suspended')void context.resume().then(playSlice).catch(()=>{});
   decoding??=encoded.then(data=>data&&context.decodeAudioData(data)).then(decoded=>{
    buffer=decoded;
    playSlice();
   }).catch(error=>console.warn('[Última Vigília] Não foi possível reproduzir as vozes.',error))
    .finally(()=>{ready=true;});
  }catch{ready=true;}
 }
 function hold(){
  if(!active?.source)return;
  active.elapsed+=context.currentTime-active.started;
  releaseSource(active);
 }
 function setSuspended(value){
  suspended=value;
  if(value)hold();
  else playSlice();
 }
 function sync(nextWorld,nextMode,nextVolume) {
  const previousMode=mode;
  mode=nextMode;
  if(nextWorld!==world||!['play','paused','dead','story'].includes(mode)||
   (previousMode==='story')!==(mode==='story'))clear();
  world=nextWorld;
  volume=Math.max(0,Math.min(1,Number.isFinite(nextVolume)?nextVolume:0.8));
  if(gain)gain.gain.value=volume;
  if(!volume){clear();return;}
  if(mode==='paused')hold();
  else if(previousMode==='paused'&&mode==='play')playSlice();
 }
 function play(name) {
  const clip=VOICE_CUES[name];
  if(!clip||!volume||(!world&&mode!=='story')||!['play','dead','story'].includes(mode))return;
  if(active&&(active.clip.priority>clip.priority||clip.priority<2&&active.clip.priority===clip.priority))return;
  clear();
  active={clip,elapsed:0,source:null,started:0};
  if(!context)unlock();
  playSlice();
 }
 return {unlock,sync,play,setSuspended,get ready(){return ready;}};
}
