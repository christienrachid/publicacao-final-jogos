import {inFinalArena} from './game-core.js';
import {guardSceneProgress} from './devil-flight.js';

const MENU_THEME = 'musica-menu.ogg';
const MENU_AMBIENCE = 'musica-ambiente-menu.ogg';
const FINAL_BOSS_THEME = 'musica-chefe-final.ogg';
const FINAL_FORM_START = 55;
const phaseTrack = index => `musica-fase-${String(index + 1).padStart(2, '0')}.ogg`;

export function createMusicPlayer(runtime, getContext) {
 let context, gain, selection, active, ambienceBuffer, phaseBuffer, finalFormBuffer;
 let paused = false, suspended = false, volume = 0;

 function load(file) {
  const existing = file === MENU_AMBIENCE ? ambienceBuffer : phaseBuffer?.file === file && phaseBuffer.promise;
  if (existing) return existing;
  const promise = Promise.resolve().then(async () => {
   const url = await runtime.assets.getProjectFileUrl(file);
   const response = await fetch(url);
   if (!response.ok) throw Error(`HTTP ${response.status}`);
   return context.decodeAudioData(await response.arrayBuffer());
  }).catch(error => {
   console.warn(`[Última Vigília] Não foi possível carregar ${file}.`, error);
   return null;
  });
  if (file === MENU_AMBIENCE) ambienceBuffer = promise;
  // The long menu theme lives only in its current selection.
  else if (file !== MENU_THEME) phaseBuffer = {file, promise};
  return promise;
 }

 function stop(keepPosition = false) {
  if (!active) return;
  const {track, source, started} = active;
  active = null;
  if (keepPosition) track.offset += context.currentTime - started;
  source.onended = null;
  source.stop();
  source.disconnect();
 }

 function play() {
  const track = selection;
  if (!context || context.state !== 'running' || !track || paused || suspended || active || track.loading) return;
  if (!track.buffer) {
   track.loading = true;
   if (track.file === MENU_THEME) void load(MENU_AMBIENCE);
   const request=track.key==='final-form'?(finalFormBuffer??=load(MENU_THEME)):load(track.file);
   void request.then(buffer => {
    if (selection !== track) return;
    if (!buffer && track.file === MENU_THEME) {
     selection = {key: 'menu', file: MENU_AMBIENCE, offset: 0};
     play();
    } else if (buffer) {
     track.loading = false;
     track.buffer = buffer;
     play();
    }
   });
   return;
  }
  const source = context.createBufferSource();
  source.buffer = track.buffer;
  source.loop = track.key!=='menu'||track.file!==MENU_THEME;
  const loopStart = track.key==='final-form'&&track.buffer.duration>FINAL_FORM_START?FINAL_FORM_START:0;
  if(loopStart)source.loopStart=loopStart;
  source.connect(gain);
  active = {track, source, started: context.currentTime};
  source.onended = () => {
   if (active?.source !== source) return;
   source.disconnect();
   active = null;
   if (track.file === MENU_THEME && selection === track) {
    selection = {key: 'menu', file: MENU_AMBIENCE, offset: 0};
    play();
   }
  };
  const offset=source.loop?loopStart+track.offset%(track.buffer.duration-loopStart):Math.min(track.offset,track.buffer.duration);
  source.start(0, offset);
 }

 function unlock() {
  try {
   if (!context) {
    context = getContext();
    gain = context.createGain();
    gain.gain.value = volume;
    gain.connect(context.destination);
   }
   if (context.state !== 'running') void context.resume().then(play).catch(() => {});
   else play();
  } catch { /* navegador sem Web Audio */ }
 }

 function sync(world, mode, settings) {
  let key;
  const finalHall=inFinalArena(world)&&!world.arenaDone;
  if(mode==='menu')key='menu';
  else if(['play','paused','dead','finalPrompt'].includes(mode))key=finalHall?
    (world.boss?.phase===2?'final-form':'chefe-final'):world?.li;
  if(finalHall&&world.finalShift&&context)finalFormBuffer??=load(MENU_THEME);
  if(!finalHall)finalFormBuffer=null;
  if (key !== selection?.key) {
   stop();
   if(key===undefined)selection=null;
   else{
    const file=key==='menu'||key==='final-form'?MENU_THEME:key==='chefe-final'?FINAL_BOSS_THEME:phaseTrack(key);
    selection={key,file,offset:0};
   }
  }
  paused = mode === 'paused';
  if (paused) stop(true);
  const cinematicVolume=world?.finalShift ? .045 : guardSceneProgress(world?.boss)!==null ? .18 : world?.cine ? .38 : 1;
  const amount=mode==='play' ? cinematicVolume : mode==='finalPrompt' ? .65 : 1;
  const nextVolume = settings.master * settings.music * amount;
  if (nextVolume !== volume) {
   volume = nextVolume;
   if (gain) gain.gain.setTargetAtTime(volume, context.currentTime, .04);
  }
  play();
 }

 function setSuspended(value) {
  suspended = value;
  if (value) stop(true);
  else play();
 }

 return {unlock, sync, setSuspended};
}
