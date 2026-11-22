// Mecânicas portadas do main.js atual da Rosebud; desenho e entrada no Construct.
import {BAL,ENEMY_TYPES,LEVELS,WEAPONS,ARMORS,potionHeal,potionPrice,enemyMaxHp,STAMINA_POTION} from './data.js';
import {ATK} from './attacks.js';
import {ULT_CINE} from './ultimate-timing.js';
import {floorTrapBox,pitTrapBox} from './trap-geometry.js';
import {createSlotStore,AUTO_KEY,makeEnvelope,readEnvelope,writeStored} from './save-slots.js';
import {validateMemory} from './campaign-memory.js';
import {heroPose,heroFrame} from './hero-animation.js';
import {heroHurt,enemyHurt,bounds,regionsHit,swordHits,swordSweep,enemyStrike,muzzle,heroAim,projectileHit,runFrame} from './combat-geometry.js';
import {FINAL_SHIFT_DURATION, GUARD_THRESHOLD, devilUntargetable, dustTouches, guardSceneProgress, summonGuard, updateDevilFlight} from './devil-flight.js';
export {BAL,ENEMY_TYPES,LEVELS,WEAPONS,ARMORS,potionHeal,potionPrice,ATK};
export const METRICS={width:7600,height:1080,ground:940,gate:5140,exit:7250};
export const FINAL_ARENA={level:9,left:5325,entry:5540,boss:6740,approach:240,stairsWidth:500,stairsHeight:250};
export const inFinalArena=world=>world?.li===FINAL_ARENA.level&&world.arenaOn;
const CONTACT = {
  crawler:'flesh', archer:'bone', lancer:'armor', sentinel:'armor', beast:'hide',
  acolyte:'cloth', specter:'void', gatekeeper:'armor', matriarch:'hide',
  drowned:'water', gravedigger:'bone', smith:'smith', archivist:'cloth',
  eclipse:'armor', nameless:'void', herald:'armor', devil:'armor',
};
const ATTACK_FOLEY = {
  crawler:'claw', beast:'charge', matriarch:'claw', lancer:'spear', drowned:'spear',
  gravedigger:'reaper-swing', smith:'hammer',
};
const VOLUME_CHANNELS = ['master','voice','music','effects'];
const CAST_SOUND = { arrow:'arrow-launch', water:'water-cast', fire:'fire-cast', orb:'arcane-cast' };
const CHARGE_SOUND = { arrow:'bow-draw', water:'water-charge', fire:'fire-charge' };
const PROJECTILE_CONTACT = { arrow:'arrow-impact', water:'water-impact', fire:'fire-burst', orb:'void-burst' };
export function createCampaign(options={}) {
const storage=options.storage ?? {getItem:()=>null,setItem:()=>{}};
const localStorage=storage;
const audio=[];
const sfx=(name,volume=1,x=null)=>audio.push({name,volume,x});
const voice=name=>audio.push({voice:name});
const voiceRandom=options.voiceRandom??Math.random;
const idleVoices=['idle-one','idle-four','idle-two','idle-five'];
const dashVoices=['dash-one','dash-two'];
const healVoices=['heal','revived'];
const parryVoices=['parry-one','parry-two'];
const shortUltVoices=['ultimate-pieces','ultimate-vanish','ultimate-cut'];
let idleSeconds=0,idleVoice=0,dashVoice=0,healVoice=0,openingVoicePending=false;
let parryVoice=0;
const ULTIMATE_FINISH_VOICE_AT=ULT_CINE.cut-0.85;
const cue=(name)=>sfx(name);
const stopEffects=()=>{},stopMusic=()=>{};
let musicWant='combat';
const keys=new Set(),pressed=new Set();
let mode='menu',G=null,story=null,lastLevel=0,uiScreen='menu';
const EPILOGUE_BLACK_DURATION=2;
let epilogueBlackRemaining=0;
const showUI=(screen)=>{uiScreen=screen};
const W=1920,H=1080,LEVEL_W=7600,GROUND=940,GRAV=2600,ARENA_X=5200;
const EXIT_GATE_X=LEVEL_W-350;
const FIXED_PITS = {
  2: [{ x: 1880, w: 720, depth: 112, platforms: [[90, 85, 200], [390, 145, 200]] }],
  5: [{ x: 3200, w: 780, depth: 112, platforms: [[90, 110, 200], [430, 170, 210]] }],
  8: [{ x: 3500, w: 820, depth: 112, platforms: [[80, 95, 220], [460, 150, 220]] }],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const SAVE_KEY = 'ultimaVigilia_construct_campaign_v1', SET_KEY = 'ultimaVigilia_construct_settings_v1';
const FINAL_SEEN_KEY = 'ultimaVigilia_final_intro_';
const maxHpFor = (armor) => BAL.baseHp + ARMORS[armor].hp;
const newCampaignId=()=>globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
function defSave() {
  return { maxCleared: 0, gold: 0, weapon: 0, armor: 0, ownedW: [0], ownedA: [0], potHp: 2, potSt: 1, energy: 0,
    hp: BAL.baseHp, ultimateUsed: false, lastShortUltVoice: null, activeRun: null,
    campaignId:newCampaignId(),finalIntroSeen:false,storyPending:null,
    stats: { kills: 0, deaths: 0, time: 0, goldTotal: 0, parries: 0 } };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || typeof s !== 'object') return null;
    const d = defSave();
    const r = { ...d, ...s, stats: { ...d.stats, ...(s.stats || {}) } };
    r.maxCleared = clamp(r.maxCleared | 0, 0, 10);
    r.gold = Math.max(0, r.gold | 0);
    r.weapon = clamp(r.weapon | 0, 0, WEAPONS.length - 1);
    r.armor = clamp(r.armor | 0, 0, ARMORS.length - 1);
    if (!Array.isArray(r.ownedW)) r.ownedW = [0];
    if (!Array.isArray(r.ownedA)) r.ownedA = [0];
    // Uma tentativa interrompida por recarga não consolida seu ouro provisório.
    if (r.activeRun && Number.isFinite(r.activeRun.goldAtStart) && Number.isFinite(r.activeRun.goldTotalAtStart)) {
      r.gold = Math.max(0, r.activeRun.goldAtStart);
      r.stats.goldTotal = Math.max(0, r.activeRun.goldTotalAtStart);
    }
    r.activeRun = null;
    r.energy = clamp(+r.energy || 0, 0, 100);
    r.potHp = clamp(r.potHp | 0, 0, 5); r.potSt = clamp(r.potSt | 0, 0, 5);
    // Vida atual persistente. Saves antigos (sem o campo) recebem vida cheia uma única vez.
    const maxHp = maxHpFor(r.armor);
    r.hp = Number.isFinite(s.hp) && s.hp > 0 ? Math.min(s.hp, maxHp) : maxHp;
    return r;
  } catch (e) { return null; }
}
let save = loadSave();
let hasSave = !!save;
if (!save) save = defSave();
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));hasSave=true;persistMemory();}catch{}}
function finalIntroWasSeen(){
  if(save.finalIntroSeen===true)return true;
  try{return localStorage.getItem(FINAL_SEEN_KEY+save.campaignId)==='1';}catch{return false;}
}
function beginStory(kind){
  story=kind;mode='story';idleSeconds=0;keys.clear();pressed.clear();
  save.storyPending=kind;
}
function beginEpilogueEnd(){
  mode='epilogueBlack';
  epilogueBlackRemaining=EPILOGUE_BLACK_DURATION;
  save.storyPending='creditos';
}
function finishStory(){
  if(!story)return false;
  const kind=story;
  story=null;save.storyPending=null;keys.clear();pressed.clear();
  if(kind==='epilogo'){
    beginEpilogueEnd();
  }else{
    mode='play';showUI('none');
    if(kind==='abertura')openingVoicePending=true;
    if(kind==='confronto'){
      save.finalIntroSeen=true;
      try{localStorage.setItem(FINAL_SEEN_KEY+save.campaignId,'1');}catch{}
      enterFinalArena();
      return true;
    }
  }
  persist();
  return true;
}
const settings = { master: 1, voice: 0.8, music: 0.6, effects: 0.8, muted: {}, shake: true, reduceFlash: false };
try {
  const stored = JSON.parse(localStorage.getItem(SET_KEY));
  if (stored) {
    for (const channel of VOLUME_CHANNELS) {
      const volume = stored[channel] ?? (channel === 'voice' ? stored.sfx : undefined);
      if (Number.isFinite(volume)) settings[channel] = clamp(volume, 0, 1);
      if (stored.muted?.[channel]===true) settings.muted[channel]=true;
    }
    if (typeof stored.shake === 'boolean') settings.shake = stored.shake;
    if (typeof stored.reduceFlash === 'boolean') settings.reduceFlash = stored.reduceFlash;
  }
} catch { /* padrão */ }
function persistSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* */ } }
function setVolume(channel, volume) {
  if (!VOLUME_CHANNELS.includes(channel) || !Number.isFinite(volume)) return;
  const next = Math.round(clamp(volume, 0, 1) * 100) / 100;
  if (settings[channel] === next) return;
  settings[channel] = next;
  persistSettings();
}
function toggleMute(channel) {
  if (!VOLUME_CHANNELS.includes(channel)) return;
  if (settings.muted[channel]) delete settings.muted[channel];
  else settings.muted[channel]=true;
  persistSettings();
}

function stats() {
  const w = WEAPONS[save.weapon], a = ARMORS[save.armor], tr = G && G.trans > 0;
  const regen = tr ? 0 : BAL.stRegen * (G?.hero?.staminaBoost > 0 ? STAMINA_POTION.multiplier : 1);
  return { dmg: w.dmg * (tr ? 1.35 : 1), maxHp: BAL.baseHp + a.hp, def: a.def, speed: BAL.speed * (tr ? 1.2 : 1), regen };
}

const BOSS_RECOMMEND = 3; // ataques mínimos por boss

// Validação explícita: todo tipo citado em LEVELS precisa existir em ENEMY_TYPES e ter ataques em ATK.
function validateCampaign() {
  for (const type of Object.keys(ENEMY_TYPES)) {
    const list = ATK[type];
    if (!Array.isArray(list) || list.length === 0) throw new Error(`Inimigo sem ataques cadastrados: ${type}`);
    for (const a of list) {
      if (!(a.wind > 0 && a.act > 0 && a.rec > 0 && a.range > 0)) throw new Error(`Ataque incompleto em ${type}`);
      if (!a.proj && !a.quake && !a.marks && !a.fireZone && !(a.w > 0 && a.h > 0)) throw new Error(`Ataque sem área em ${type}`);
    }
    if (ENEMY_TYPES[type].boss && list.filter(a => !a.counter && !a.phase2).length < BOSS_RECOMMEND) throw new Error(`Boss ${type} com menos de 3 ataques`);
  }
  const seen = new Set();
  LEVELS.forEach((level, index) => {
    for (const type of [...level.explore, ...level.arena]) {
      if (!Object.hasOwn(ENEMY_TYPES, type)) throw new Error(`Fase ${index + 1}: inimigo desconhecido (${type}).`);
    }
    if (level.explore.some(t => ENEMY_TYPES[t].boss)) throw new Error(`Fase ${index + 1}: boss na exploração.`);
    const bosses = level.arena.filter(t => ENEMY_TYPES[t].boss);
    if (bosses.length !== 1) throw new Error(`Fase ${index + 1}: a arena precisa de exatamente um boss.`);
    if (seen.has(bosses[0])) throw new Error(`Fase ${index + 1}: boss repetido (${bosses[0]}).`);
    seen.add(bosses[0]);
  });
}
validateCampaign();

function makeHero() {
  const maxHp = stats().maxHp;
  save.hp = Math.min(Number.isFinite(save.hp) && save.hp > 0 ? save.hp : maxHp, maxHp);
  return { x: 280, y: GROUND, w: 50, h: 130, vx: 0, vy: 0, onGround: true, onPlat: false, face: 1, hp: save.hp, st: BAL.baseSt,
    stDelay: 0, staminaBoost: 0, state: 'move', t: 0, walkTime: 0, lastSafeX: 280, combo: 0, comboQ: false, atkDone: false, iframes: 0, parryT: 0, dashCd: 0, dashFrom: 0,
    dashHit: new Set(), dashEnergy: 0, coyote: 0, jumpBuf: 0, dropT: 0, after: [], afterT: 0, deadT: 0, drinkKind: 'hp' };
}

function newG(li) {
  const lv = LEVELS[li];
  G = { li, lv, gateLift:0, time: 0, enemies: [], projs: [], hazards: [], traps: [], pits: [], fx: [], texts: [], solids: [], plats: [], sil: [],
    seed: Math.floor(Math.random() * 4294967296),
    gateX: ARENA_X - 60, entryOpen: false, unlockFx: 0, exploreTotal: 0, arenaOn: false, arenaDone: false, boss: null, cam: 0, shake: 0, flash: 0, flashColor: '#fff', trans: 0, cine: null,
    banner: { title: lv.name, sub: lv.intro, t: 4.5 }, brazierUsed: false, ash: [], hint: '', completed: false, ultTrail: null };
  G.hero = makeHero();
  for (let i = 0; i < 70; i++) G.ash.push({ x: rand(0, W), y: rand(0, H), vx: rand(-30, 10), vy: rand(15, 60), s: rand(1.5, 4) });
  buildLevel(li);
}

function buildLevel(li) {
  G.pits = (FIXED_PITS[li] || []).map(p => ({ ...p, platforms: p.platforms.map(v => v.slice()) }));
  G.solids = [
    { x: -100, y: 0, w: 100, h: GROUND },
    { x: LEVEL_W, y: 0, w: 100, h: GROUND },
    { x: 2800, y: GROUND - 170, w: 200, h: 170 },
  ];
  // Divide o piso: o fosso é uma abertura física, com fundo abaixo do chão.
  let groundStart = -400;
  for (const p of G.pits) {
    G.solids.push({ x: groundStart, y: GROUND, w: p.x - groundStart, h: 300 });
    G.solids.push({ x: p.x, y: GROUND + p.depth, w: p.w, h: 300 });
    groundStart = p.x + p.w;
  }
  G.solids.push({ x: groundStart, y: GROUND, w: LEVEL_W + 400 - groundStart, h: 300 });
  if (li !== 0) G.solids.push({ x: 1500, y: GROUND - 110, w: 160, h: 110 });
  const random = mulberry(G.seed);
  const choose = (list) => list[Math.floor(random() * list.length)];
  // Módulos variados fora dos fossos; seus percursos de salto são fixos.
  // Cada tripla representa posição local, altura acima do chão e largura.
  const modules = {
    broken: [[0,130,200],[245,245,200],[515,150,200]],
    canopy: [[0,170,180],[240,300,210],[530,190,180]],
    bridge: [[0,140,300],[380,140,300]],
    crypt: [[0,115,240],[310,210,220],[580,115,170]],
    forge: [[0,145,180],[220,280,210],[510,160,190]],
    shelves: [[0,110,200],[225,220,200],[450,330,210]],
    rampart: [[0,160,270],[350,285,250]],
    garden: [[0,130,180],[300,235,180],[575,140,160]],
    throne: [[0,120,210],[245,240,210],[500,120,210]],
    abyss: [[0,170,180],[250,320,200],[510,180,190]],
  };
  const themes = {
    ruins:['broken','crypt'],forest:['canopy','garden'],aqueduct:['bridge','broken'],catacombs:['crypt','shelves'],
    forge:['forge','bridge'],library:['shelves','crypt'],ramparts:['rampart','bridge'],garden:['garden','canopy'],
    throne:['throne','rampart'],abyss:['abyss','forge'],
  };
  G.plats = [];
  for (let section = 0; section < 4; section++) {
    const module = modules[choose(themes[G.lv.theme] || ['broken'])];
    const origin = 780 + section * 930 + Math.floor(random() * 85);
    const mirrored = random() > 0.5;
    for (const [x, height, w] of module) {
      const offset = mirrored ? 740 - x - w : x;
      const px = origin + offset;
      if (!nearPit(px, w, 140)) G.plats.push({ x: px, y: GROUND - height, w, h: 28 });
    }
  }
  for (const p of G.pits) for (const [dx, height, w] of p.platforms) {
    G.plats.push({ x: p.x + dx, y: GROUND - height, w, h: 28, fixedPit: true });
  }
  if(li!==FINAL_ARENA.level)G.plats.push(
    { x: ARENA_X + 450, y: 720, w: 300, h: 28 },
    { x: EXIT_GATE_X - 650, y: 740, w: 270, h: 28 }
  );
  const tpos = shuffle([1050, 1850, 2450, 3350, 4250, 4800]
    .map(x => x + Math.floor(random() * 120)).filter(x => !nearPit(x - 70, 140, 180)));
  const n = Math.min(tpos.length, 4, G.lv.traps.length * 2);
  for (let i = 0; i < n; i++) {
    const type = G.lv.traps[i % G.lv.traps.length];
    G.traps.push({ type, x: tpos[i], w: 140, t: rand(0, 3), period: type === 'spikes' ? 2.6 : 3.2, warn: 0.6, active: type === 'spikes' ? 0.9 : 1.1, on: false, warning: false });
  }
  // A lista explore controla a quantidade. Os pontos ocupam a exploração ampliada.
  // Nenhum inimigo pode nascer no fosso ou no espaço de aterrissagem das bordas.
  const sp = shuffle([1100, 1900, 2700, 3500, 4200, 4800].filter(x => !nearPit(x - 90, 180, 150)));
  G.lv.explore.forEach((t, i) => {
    let x = (sp[i % sp.length] ?? 900 + i * 250) + Math.floor(random() * 80) - 40;
    const T = ENEMY_TYPES[t];
    for (const s of G.solids) if (s.y < GROUND && s.h < 400 && x + T.w / 2 > s.x - 20 && x - T.w / 2 < s.x + s.w + 20) x = s.x - T.w / 2 - 30;
    x = clamp(x, 700, G.gateX - T.w / 2 - 40);
    x = safeExploreX(x, T.w);
    const e = makeEnemy(t, x); e.y = GROUND; e.role = 'explore';
    G.enemies.push(e);
  });
  G.exploreTotal = G.enemies.filter(e => e.role === 'explore').length;
  if (G.exploreTotal === 0) G.entryOpen = true;
  const r = mulberry(li * 977 + 13);
  for (let x = -200; x < LEVEL_W * 0.45 + W + 200; x += 120 + r() * 160) G.sil.push({ x, w: 60 + r() * 110, h: 160 + r() * 330, k: r() });
}

function nearPit(x, w = 0, margin = 0) {
  return G.pits.some(p => x + w > p.x - margin && x < p.x + p.w + margin);
}
function safeExploreX(x, w) {
  for (const p of G.pits) {
    const left = p.x - w / 2 - 120, right = p.x + p.w + w / 2 + 120;
    if (x > left && x < right) x = x < p.x + p.w / 2 ? left : right;
  }
  // Teleportes e nascimentos também precisam evitar os blocos de pedra.
  for (const s of G.solids) if (s.y < GROUND && s.h < 400 && x + w / 2 > s.x - 10 && x - w / 2 < s.x + s.w + 10) {
    x = x < s.x + s.w / 2 ? s.x - w / 2 - 12 : s.x + s.w + w / 2 + 12;
  }
  return clamp(x, 100 + w / 2, G.gateX - w / 2 - 40);
}

function makeEnemy(type, x) {
  const T = ENEMY_TYPES[type], li = G.li;
  const maxHp = enemyMaxHp(type, li);
  return { type, T, x, y: GROUND - 200, vx: 0, vy: 0, w: T.w, h: T.h, hp: maxHp, maxHp, dmgMul: T.boss ? 1 : 1 + li * 0.06,
    face:-1,state:'idle',t:0,walkDistance:0,animTime:0, cd: rand(0.8, 1.8), atk: null, stun: 0, hitFlash: 0, dead: false, deathT: 0, required: false,
    phase: 1, trapCd: 0, onGround: false, onPlat: false, summoned: false, tpX: 0, tped: false, hitDone: false, spd: 1,
    role: 'explore', chainLeft: 0, landed: false };
}

function discardRunGold() {
  if (!save.activeRun) return;
  save.gold = save.activeRun.goldAtStart;
  save.stats.goldTotal = save.activeRun.goldTotalAtStart;
  save.activeRun = null;
}
// Copia a vida atual da heroína para o save (vida persistente na campanha).
function syncHp() {
  if (G && G.hero && G.hero.state !== 'dead') save.hp = clamp(G.hero.hp, 0, stats().maxHp);
}
function equipArmor(index) {
  syncHp();
  save.armor = index;
  save.hp = Math.min(save.hp, maxHpFor(index));
  if (G && G.hero.state !== 'dead') G.hero.hp = save.hp;
}
function startLevel(li,opening=false,staminaBoost=0) {
  idleSeconds=0;openingVoicePending=false;
  story=null;save.storyPending=null;
  syncHp(); // reinício manual e troca de fase mantêm a vida atual
  discardRunGold();
  stopEffects(); stopMusic();
  save.activeRun = { li, goldAtStart: save.gold, goldTotalAtStart: save.stats.goldTotal };
  newG(li);
  G.hero.staminaBoost=staminaBoost;
  lastLevel = li;save.currentLevel=li;save.checkpoint='level';
  mode = 'play'; showUI('none'); musicWant = 'combat'; keys.clear(); pressed.clear();
  if(opening)beginStory('abertura');
  persist();
}

// ---------- Física ----------
function solidsNow() {
  const solids = G.solids.slice();
  if(G.li===FINAL_ARENA.level){
    const wallX=G.arenaOn?FINAL_ARENA.left-60:G.gateX;
    solids.push({x:wallX,y:-H,w:60,h:GROUND+H});
    if(G.arenaOn&&!G.arenaDone)solids.push({x:EXIT_GATE_X,y:-H,w:60,h:GROUND+H});
    return solids;
  }
  // Entrada da arena: fechada até limpar a exploração e trancada durante o confronto.
  if (!G.entryOpen || (!G.arenaOn && G.gateLift < 1)) solids.push({x:G.gateX-30,y:-H,w:60,h:GROUND+H});
  if (G.arenaOn && !G.arenaDone) solids.push({x:G.gateX+185-60,y:-H,w:60,h:GROUND+H});
  if (!G.arenaDone) solids.push({ x: EXIT_GATE_X, y: -H, w: 60, h: GROUND + H });
  return solids;
}
function moveBody(b, dt, drop = false, noGrav = false) {
  // Limita o deslocamento por passo para E, esquiva e golpes não pularem colisores.
  const travel = Math.max(Math.abs(b.vx), Math.abs(b.vy) + (noGrav ? 0 : GRAV * dt)) * dt;
  const steps = Math.max(1, Math.ceil(travel / 8));
  for (let i = 0; i < steps; i++) moveBodyStep(b, dt / steps, drop, noGrav);
}
function moveBodyStep(b, dt, drop = false, noGrav = false) {
  if (!noGrav) b.vy = Math.min(b.vy + GRAV * dt, 2200);
  const S = solidsNow();
  const previousX = b.x;
  b.x += b.vx * dt;
  // Inimigos reconhecem a borda; não caem nem ficam inacessíveis no fundo.
  if (b !== G.hero) for (const p of G.pits) {
    const left = p.x - b.w / 2 - 8, right = p.x + p.w + b.w / 2 + 8;
    if (b.x > left && b.x < right) {
      b.x = previousX <= left ? left : previousX >= right ? right :
        (previousX < p.x + p.w / 2 ? left : right);
      b.vx = 0;
    }
  }
  for (const s of S) {
    const r = { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h - 2 };
    if (overlap(r, s)) {
      if (b.x < s.x + s.w / 2) b.x = s.x - b.w / 2; else b.x = s.x + s.w + b.w / 2;
      b.vx = 0;
    }
  }
  const prev = b.y;
  b.y += b.vy * dt;
  b.onGround = false; b.onPlat = false;
  for (const s of S) {
    const r = { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h };
    if (overlap(r, s)) {
      if (b.vy >= 0 && prev <= s.y + 2) { b.y = s.y; b.vy = 0; b.onGround = true; }
      else if (b.vy < 0) { b.y = s.y + s.h + b.h; b.vy = 0; }
    }
  }
  if (!drop && b.vy >= 0) {
    for (const p of G.plats) {
      if (b.x + b.w / 2 > p.x && b.x - b.w / 2 < p.x + p.w && prev <= p.y + 2 && b.y >= p.y) { b.y = p.y; b.vy = 0; b.onGround = true; b.onPlat = true; }
    }
  }
}
const heroBox=h=>bounds(heroHurt(h));
const enBox=e=>bounds(enemyHurt(e));

// ---------- FX ----------
function burst(x, y, n, color, sp = 300, size = 5, life = 0.6, grav = 600) {
  for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), v = rand(sp * 0.3, sp); G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: rand(size * 0.5, size), grav }); }
}
function text(x, y, t, color = '#fff') { G.texts.push({ x, y, t, color, life: 0.9 }); }
function quake(v) { G.shake = Math.max(G.shake, v); }
function flash(a, color = '#fff') { G.flash = Math.max(G.flash, settings.reduceFlash ? Math.min(a, 0.2) : a); G.flashColor = color; }
function banner(title, sub = '', t = 3) { G.banner = { title, sub, t }; }

// ---------- Combate ----------
function gainEnergy(n) {
  if (!G || G.cine || G.trans > 0) return 0;
  const before = save.energy;
  save.energy = Math.min(100, save.energy + n);
  if (before < 100 && save.energy >= 100) sfx('ultimate-ready', .65);
  return save.energy - before;
}

function damageEnemy(e, dmg, o = {}) {
  if (e.dead || o.trap || devilUntargetable(e)) return false;
  const h = G.hero;
  let blocked = false;
  if (e.T.shield && !o.ult && !o.trap && !['stun', 'wind', 'act'].includes(e.state)) {
    if (Math.sign(h.x - e.x) === e.face) {
      blocked = true;
      dmg *= 0.15; text(e.x, e.y - e.h - 30, 'BLOQUEADO', '#9ab'); burst(e.x + e.face * 30, e.y - e.h * 0.6, 8, '#cde', 300, 4, 0.3);
      // Duelista: bloqueio frontal seguido de contra-ataque (amarelo, aparável).
      const ctr = e.T.counter && e.state === 'idle' && ATK[e.type].find(a => a.counter);
      if (ctr) { e.atk = ctr; e.state = 'wind'; e.t = 0; e.chainLeft = 0; e.tped = false; }
    }
  }
  const final=e===G.boss&&inFinalArena(G);
  if(final&&e.phase===2&&!e.guardUsed)dmg=Math.min(dmg,Math.max(0,e.hp-1));
  if (!o.ult) sfx(blocked ? 'shield-block' : 'hit-'+(CONTACT[e.type] ?? 'armor'), o.dash ? .84 : .70, e.x);
  e.hp -= dmg; e.hitFlash = 0.1;
  text(e.x + rand(-20, 20), e.y - e.h - 10, Math.round(dmg), o.ult ? '#ff4060' : '#fff');
  burst(e.x, e.y - e.h * 0.55, 8, o.ult ? '#ff3050' : '#b8a0ff', 350, 5, 0.4);
  if (!e.T.boss && e.state !== 'act') e.vx = Math.sign(e.x - h.x) * 260;
  // Boss final: duas barras de vida. Esvaziar a primeira inicia a segunda fase.
  if (e.T.final && e.phase === 1 && e.hp <= 0) {
    if(final)beginFinalShift(e);
    else {revealDevil(e); sfx('second-form',1,e.x);}
    return true;
  }
  if (final && e.phase===2 && !e.guardUsed && e.hp<=e.maxHp*GUARD_THRESHOLD) {
    summonGuard(e,GROUND);
    sfx('usurpador-convoca',.87,e.x);
    persist();
    return true;
  }
  if (e.hp <= 0) { killEnemy(e); return true; }
  if (e.type === 'herald' && !e.summoned && e.hp < e.maxHp * 0.5) {
    e.summoned = true; banner('O Arauto convoca reforços', 'Derrote-os também para abrir a saída', 2.5);
    [-250, 250].forEach(d => summonAdd('specter', e.x + d));
  }
  return true;
}

function beginFinalShift(e) {
  G.finalShift={t:0, duration:FINAL_SHIFT_DURATION};
  G.projs=[];G.hazards=[];G.banner=null;
  Object.assign(e,{hp:0,state:'finalShift',vx:0,vy:0,t:0,atk:null,y:GROUND,hitFlash:0});
  sfx('gate-close',.55,e.x);
  persist();
}

function revealDevil(e) {
  Object.assign(e,{phase:2,spd:1.3,maxHp:e.T.phaseHp[1],hp:e.T.phaseHp[1],state:'idle',
    t:0,atk:null,cd:.45,airCooldown:3.6,wingReveal:.37,onGround:true,revealing:false,wingOpening:0});
}

function updateFinalShift(dt) {
  const c=G.finalShift,e=G.boss,h=G.hero;
  const before=c.t;
  c.t+=dt;
  const release=c.duration*.78;
  const target=(e.x*.67+h.x*.33)-W/2;
  G.cam+= (clamp(target,FINAL_ARENA.left,LEVEL_W-W)-G.cam)*Math.min(1,dt*4);
  if(before<release-.68&&c.t>=release-.68)sfx('second-form',.94,e.x);
  if(before<release&&c.t>=release){
    e.revealing=true;
    burst(e.x,GROUND-315,30,'#f28e56',490,5,.65,270);
    quake(12);
  }
  if(e.revealing)e.wingOpening=clamp((c.t-release)/(c.duration-release),0,1);
  if(c.t>=c.duration){
    revealDevil(e);
    h.state='move';h.vx=0;h.t=0;h.parryT=0;h.comboQ=false;
    G.finalShift=null;
    persist();
  }
  updateFx(dt);
}

// Reforços da arena: obrigatórios para liberar a saída, limitados aos limites da arena.
function summonAdd(type, x) {
  const T = ENEMY_TYPES[type];
  const s = makeEnemy(type, clamp(x, ARENA_X + 80, EXIT_GATE_X - T.w / 2 - 10));
  s.y = GROUND; s.required = true; s.role = 'reinforce';
  burst(s.x, GROUND - 60, 20, '#ff4060', 300, 5, 0.6);
  G.enemies.push(s);
  return s;
}

const flightAPI={
  ground:GROUND,
  sound:sfx,
  clearAttacks(){
    G.projs=G.projs.filter(p=>p.source!=='devil');
    G.hazards=G.hazards.filter(z=>z.source!=='devil'&&z.type!=='wing-gust');
  },
  guard(type,x){summonAdd(type,x).finalGuard=true;},
  diveHit(e){
    if(!regionsHit(enemyHurt(e),heroHurt(G.hero)))return false;
    return hitHero(e.T.dmg*1.12,e,{unparry:true,hazard:true})==='hit';
  },
  impact(e,kind,direction){
    const heavy=kind==='dust-slam';
    if(kind==='wing-gust'){
      sfx('usurpador-rajada',.91,e.x);
    }else{
      quake(heavy?29:kind==='soft'?5:12);
      sfx(heavy?'ground-slam':'usurpador-pouso',heavy?1:kind==='soft'?.52:.79,heavy?null:e.x);
      if(heavy)sfx('usurpador-queda',.88);
      burst(e.x,GROUND-13,heavy?55:17,'#b69a82',heavy?720:410,heavy?11:6,.8,710);
    }
    if(kind==='dive'&&!e.flight.hit&&Math.abs(G.hero.x-e.x)<144&&G.hero.y>GROUND-105)
      hitHero(e.T.dmg*1.12,e,{unparry:true,hazard:true});
    if(heavy||kind==='wing-gust'){
      const limit=direction<0?e.x-FINAL_ARENA.left:direction>0?LEVEL_W-e.x:
        Math.max(e.x-FINAL_ARENA.left,LEVEL_W-e.x);
      G.hazards.push({type:kind,x:e.x,radius:0,limit,dir:direction||0,
        speed:heavy?1050:1160,dmg:e.T.dmg*(heavy?1.26:.76),hit:false,dead:false});
    }
  },
};

function killEnemy(e) {
  if (e.dead) return; // Um inimigo concede ouro e morte apenas uma vez.
  e.dead = true; e.deathT = 0; e.state = 'dead';
  const g = Math.round(e.T.gold * (1 + G.li * 0.1));
  save.gold += g; save.stats.goldTotal += g; save.stats.kills++;
  if (g > 0) text(e.x, e.y - e.h - 50, `+${g} ouro`, '#ffd36a');
  burst(e.x, e.y - e.h * 0.5, e.T.boss ? 60 : 22, G.lv.ash, 450, 7, 1);
  if (e.T.boss) { quake(20); flash(0.5); if(!G.cine)sfx('boss-fall', .87, e.x); }
  persist();
}

function hitHero(dmg, src, o = {}) {
  const h = G.hero;
  if (h.state === 'dead' || G.cine || G.finalShift || guardSceneProgress(G.boss)!==null) return 'none';
  if (h.parryT > 0 && !o.unparry) {
    if(voiceRandom()<0.25){voice(parryVoices[parryVoice]);parryVoice=1-parryVoice;}
    return 'parry';
  }
  if (h.iframes > 0 && !(o.groundPulse&&['dodge','dash'].includes(h.state))) return 'miss';
  const {def}=stats();
  dmg *= 1 - def;
  h.hp -= dmg; h.iframes = 0.6;
  if (h.hp > 0) { save.hp = h.hp; persist(); }
  text(h.x, h.y - h.h - 20, Math.round(dmg), '#ff5050');
  burst(h.x, h.y - 70, 12, '#ff3040', 300, 5, 0.4);
  quake(10); flash(0.15, '#f00'); if(!o.proj&&!o.hazard)sfx('hit-flesh', .68);
  if (h.hp <= 0) { heroDie(); return 'hit'; }
  if (!['dash', 'cast'].includes(h.state)) {
    h.state = 'hurt'; h.t = 0;
    h.vx = (src && src.x !== undefined ? Math.sign(h.x - src.x) || 1 : -h.face) * 320; h.vy = -300;
  }
  return 'hit';
}

function heroDie() {
  const h = G.hero;
  h.hp = 0; h.state = 'dead'; h.deadT = 0; h.vx = 0;
  voice('fallen');
  // Preserva a regra existente: morte mantém o ouro; reinício manual o descarta.
  save.activeRun = null;
  save.hp = stats().maxHp; // regra existente: renasce com vida cheia
  save.energy = 0; save.stats.deaths++; persist();
  quake(15);
}

function onParried(e) {
  e.stun = e.T.boss ? 0.35 : 1.0; e.state = 'stun'; e.atk = null; e.t = 0; e.vx = 0;
  save.stats.parries++;
  sfx('parry'); flash(0.15, '#ffe9a0');
  burst((e.x + G.hero.x) / 2, G.hero.y - 80, 18, '#ffe080', 450, 5, 0.4);
  text(e.x, e.y - e.h - 40, 'APARADO!', '#ffe080');
}

function startHeroAtk(n) {
  const h = G.hero;
  if (G.trans<=0 && h.st < BAL.atkCost) { text(h.x, h.y - 160, 'Sem fôlego', '#8c8'); h.state = 'move'; return; }
  if(G.trans<=0){h.st -= BAL.atkCost;h.stDelay=BAL.stDelay;}
  h.state = 'attack'; h.t = 0; h.combo = n; h.comboQ=false;h.atkDone=false;h.atkHit=new Set();h.attackEnergyGiven=false;
  sfx(n===2?'sword-heavy':'sword-light', n===2?.94:.81);
  if(voiceRandom()<0.01)voice('attack');
}
const ATK_DUR = [0.32, 0.32, 0.45], ATK_MUL = [1, 1.1, 1.6];
function atkBox(h) { const w = G.trans > 0 ? 190 : 160; return { x: h.face > 0 ? h.x - 10 : h.x - w + 10, y: h.y - h.h - 15, w, h: h.h + 30 }; }
function checkAtk(track=false) {
  const h = G.hero, box = atkBox(h), S = stats();
  let hitAlive = false;
  for (const e of G.enemies) {
    if(e.dead||(track&&h.atkHit?.has(e))||!swordHits(h,e,G.trans>0))continue;if(track)(h.atkHit??=new Set()).add(e);
    hitAlive = true;
    damageEnemy(e, S.dmg * ATK_MUL[h.combo]);
  }
  if(hitAlive){if(!track||!h.attackEnergyGiven){gainEnergy(BAL.energyPerHit);h.attackEnergyGiven=true;}quake(4);}
}

function startUlt() {
  if(!G||G.cine||G.trans>0)return;
  save.energy = 0;
  G.cine = {t:0, hit:false, short:save.ultimateUsed === true};
  save.ultimateUsed = true;
  G.hero.state = 'cast'; G.hero.vx = 0;
  idleSeconds=0;
  if(G.cine.short){
    const available = shortUltVoices.filter(name => name !== save.lastShortUltVoice);
    const picked = available[Math.min(available.length - 1, Math.floor(voiceRandom() * available.length))];
    save.lastShortUltVoice = picked;
    voice(picked);
  }else voice('ultimate-full');
  persist();
}
function updateCine(dt) {
  const c=G.cine,previous=c.t;c.t+=dt;
  if (c.short === true && previous < ULT_CINE.turn && c.t >= ULT_CINE.turn) {
    // Preserve the original timing and effects from the white reflection onward.
    c.t = ULT_CINE.reveal + (c.t - ULT_CINE.turn);
  }
  if(!c.short&&previous<ULTIMATE_FINISH_VOICE_AT&&c.t>=ULTIMATE_FINISH_VOICE_AT)voice('ultimate-cut');
  if (!c.hit && c.t >= ULT_CINE.hit) {
    c.hit = true;
    const h = G.hero, dmg = 140 + WEAPONS[save.weapon].dmg * 3;
    const box = { x: Math.max(0, h.x - BAL.ultRange), y: heroBox(h).y - 40,
      w: Math.min(LEVEL_W, h.x + BAL.ultRange) - Math.max(0, h.x - BAL.ultRange), h: heroBox(h).h + 80 };
    for (const e of G.enemies) if (!e.dead && overlap(box, enBox(e))) damageEnemy(e, dmg, { ult: true });
    G.ultTrail = { box, life: 1.35, max: 1.35 };
    G.projs = [];
    flash(0.55);quake(18);
    burst(h.x,h.y-120,45,'#c18cff',700,6,.65,120);
  }
  if (c.t >= ULT_CINE.end) {
    G.cine = null; G.trans = BAL.transformTime;
    G.hero.state = 'move'; G.hero.t = 0;
    G.banner = null; // O estado da transformação permanece indicado no HUD.
    persist();
  }
}

// ---------- Heroína ----------
function updateHero(dt) {
  const h = G.hero, S = stats();
  h.hp = Math.min(h.hp, S.maxHp);
  h.t += dt;
  h.iframes = Math.max(0, h.iframes - dt); h.parryT = Math.max(0, h.parryT - dt);
  h.dashCd = Math.max(0, h.dashCd - dt); h.coyote = Math.max(0, h.coyote - dt);
  h.jumpBuf = Math.max(0, h.jumpBuf - dt); h.dropT = Math.max(0, h.dropT - dt); if(G.trans<=0)h.stDelay=Math.max(0,h.stDelay-dt);
  const startingR=pressed.has('KeyR')&&h.state==='move'&&save.energy>=100&&G.trans<=0;
  if(G.trans<=0&&!startingR&&h.state!=='dead'){
    const boostedTime=Math.min(dt,h.staminaBoost);
    if(h.stDelay<=0)h.st=Math.min(BAL.baseSt,h.st+boostedTime*S.regen+(dt-boostedTime)*BAL.stRegen);
    h.staminaBoost=Math.max(0,h.staminaBoost-dt);
  }

  const L = keys.has('KeyA') || keys.has('ArrowLeft'), R = keys.has('KeyD') || keys.has('ArrowRight');
  const D = keys.has('KeyS') || keys.has('ArrowDown');
  const atkP = pressed.has('KeyJ') || pressed.has('Mouse0');
  const dodgeP = pressed.has('ShiftLeft') || pressed.has('ShiftRight') || pressed.has('KeyK');
  if (pressed.has('Space') || pressed.has('KeyW') || pressed.has('ArrowUp')) h.jumpBuf = 0.12;

  const tryActions = () => {
    if (dodgeP) {
      if (G.trans>0 || h.st >= BAL.dodgeCost) { if(G.trans<=0){h.st -= BAL.dodgeCost;h.stDelay=BAL.stDelay;} h.state = 'dodge'; h.t = 0; h.iframes = 0.35; if (L !== R) h.face = R ? 1 : -1; sfx('dodge', .76); return true; }
      text(h.x, h.y - 160, 'Sem fôlego', '#8c8');
    }
    if (pressed.has('KeyQ')) {
      if (G.trans>0 || h.st >= BAL.parryCost) { if(G.trans<=0){h.st -= BAL.parryCost;h.stDelay=BAL.stDelay;} h.state = 'parry'; h.t = 0; h.parryT = BAL.parryWindow; return true; }
      text(h.x, h.y - 160, 'Sem fôlego', '#8c8');
    }
    if (pressed.has('KeyE')) {
      if (h.dashCd > 0) text(h.x, h.y - 160, `Avanço em ${h.dashCd.toFixed(1).replace('.', ',')} s`, '#aaf');
      else if (G.trans>0 || h.st >= BAL.dashCost) {
        if(G.trans<=0){h.st -= BAL.dashCost;h.stDelay=BAL.stDelay;} h.state = 'dash'; h.t = 0; h.dashCd = BAL.dashCd;
        h.dashFrom = h.x; h.dashHit = new Set(); h.dashEnergy = 0; h.iframes = 0.25; h.vy = 0;
        if(voiceRandom()<0.10){voice(dashVoices[dashVoice]);dashVoice=1-dashVoice;}
        if (L !== R) h.face = R ? 1 : -1; sfx('dash', .88); return true;
      } else text(h.x, h.y - 160, 'Sem fôlego', '#8c8');
    }
    return false;
  };

  switch (h.state) {
    case 'dead':
      h.deadT += dt; h.vx = 0; moveBody(h, dt);
      if (h.deadT > 1.6 && mode === 'play') { mode = 'dead'; showUI('dead'); }
      return;
    case 'move': {
      const ax = (R ? 1 : 0) - (L ? 1 : 0);
      h.vx = ax * S.speed; if (ax) h.face = ax;
      if (h.jumpBuf > 0) {
        if (D && h.onPlat) { h.dropT = 0.25; h.jumpBuf = 0; }
        else if (h.coyote > 0) { h.vy = -BAL.jump; h.jumpBuf = 0; h.coyote = 0; sfx('jump', .64); }
      }
      if (atkP) startHeroAtk(0);
      else if (tryActions()) { /* ação iniciada */ }
      else if (pressed.has('KeyR')) {
        if (save.energy >= 100 && G.trans <= 0) startUlt();
        else if (G.trans > 0) text(h.x, h.y - 160, 'Já transformada', '#f8a');
        else text(h.x, h.y - 160, `Energia ${Math.floor(save.energy)}/100`, '#c9f');
      } else if (pressed.has('Digit1') || pressed.has('KeyH') || pressed.has('Digit2')) {
        const k = (pressed.has('Digit1')||pressed.has('KeyH')) ? 'hp' : 'st';
        if(k==='st'&&G.trans>0){text(h.x,h.y-160,'Estamina suspensa durante a Chama','#fbc');}
        else if ((k === 'hp' ? save.potHp : save.potSt) > 0) { h.state = 'drink'; h.t = 0; h.drinkKind = k; sfx('potion-open'); }
        else text(h.x, h.y - 160, 'Sem frascos', '#aaa');
      } else if (pressed.has('KeyF')) interact();
      break;
    }
    case 'attack': {
      const dur = ATK_DUR[h.combo];
      h.vx = h.face * 80 * (1 - h.t / dur);
      if(h.t>=.065&&h.t<=dur*.78){h.atkDone=true;checkAtk(true);}
      if (atkP && h.t > dur * 0.35) h.comboQ = true;
      if (h.t > 0.2 && tryActions()) break;
      if (h.t >= dur) {
        if (h.comboQ && h.combo < 2) startHeroAtk(h.combo + 1);
        else h.state = 'move';
      }
      break;
    }
    case 'dodge':
      h.vx = h.face * 780 * (1 - (h.t / 0.35) * 0.5);
      if (h.t >= 0.35) h.state = 'move';
      break;
    case 'parry':
      h.vx *= 0.5;
      if (h.t >= 0.35) h.state = 'move';
      break;
    case 'dash': {
      h.vx = h.face * BAL.dashDist / 0.18; h.vy = 0;
      moveBody(h, dt, h.dropT > 0, true);
      const minX = Math.min(h.dashFrom, h.x) - h.w / 2, maxX = Math.max(h.dashFrom, h.x) + h.w / 2;
      const sweep = { x: minX, y: h.y - h.h, w: maxX - minX, h: h.h };
      for (const e of G.enemies) {
        if (e.dead || h.dashHit.has(e) || !swordHits(h,e,G.trans>0,h.dashFrom)) continue;
        h.dashHit.add(e);
        damageEnemy(e, S.dmg * 1.6, { dash: true });
        const room = BAL.energyPerHit - h.dashEnergy;
        if (room > 0) h.dashEnergy += gainEnergy(Math.min(BAL.energyPerHit, room));
        quake(6);
      }
      if (h.t >= 0.18) { h.state = 'move'; h.vx = h.face * 200; }
      pushAfter(h, 0.01);
      return;
    }
    case 'hurt':
      h.vx *= 0.9;
      if (h.t >= 0.3) h.state = 'move';
      break;
    case 'drink':
      h.vx = 0;
      if (h.t >= 0.6) {
        if (h.drinkKind === 'hp') {
          const amt = potionHeal('hp', save.maxCleared);
          save.potHp--;
          const previousHp=h.hp;
          h.hp = Math.min(S.maxHp, h.hp + amt);
          if(h.hp>previousHp&&voiceRandom()<0.25){voice(healVoices[healVoice]);healVoice=1-healVoice;}
          text(h.x, h.y - 160, `+${amt} vida`, '#f66');
        }
        else {
          save.potSt--;
          h.staminaBoost=STAMINA_POTION.duration;
          text(h.x,h.y-160,'Regeneração de estamina ×2','#98e5a8');
        }
        burst(h.x, h.y - 70, 14, h.drinkKind === 'hp' ? '#f55' : '#6f6', 200, 4, 0.6, -200);
        save.hp = h.hp; sfx('potion-drink'); persist(); h.state = 'move';
      }
      break;
    case 'cast': h.vx = 0; break;
  }
  const grounded = h.onGround, fall = h.vy, oldX = h.x;
  moveBody(h, dt, h.dropT > 0);
  const foot = 'step-'+(inFinalArena(G)?'hall':G.lv.theme);
  const footing = h.onPlat ? .85 : 1;
  if (!grounded && h.onGround && fall > 160) {
    sfx(foot, .46*footing);
    if(fall>460)sfx('land', .34);
  }
  if (h.state === 'move' && h.onGround && Math.abs(h.vx) > 20) {
    const prev = h.walkTime;
    h.walkTime += dt;
    if (Math.abs(h.x-oldX)>.12 && Math.floor((prev+.20)/.31)!==Math.floor((h.walkTime+.20)/.31)) sfx(foot, .36*footing);
  } else h.walkTime = 0;
  if (h.onGround) h.coyote = 0.1;
  if (h.state === 'dodge' || G.trans > 0) pushAfter(h, h.state === 'dodge' ? 0.03 : 0.07);
  else h.afterT = 0;
}
function heroImg(h) {
 return heroPose(h,G.trans>0||(G.cine&&G.cine.t>=ULT_CINE.reveal));
}
function pushAfter(h,every) {
 h.afterT-=1/60;
 if(h.afterT<=0){h.afterT=every;h.after.push({x:h.x,y:h.y,face:h.face,img:heroImg(h),frame:heroFrame(h,heroImg(h),G.time),a:.35});}
}
function canUseBrazier(){
  return mode==='play'&&!!G?.arenaDone&&!G.completed&&!G.cine&&G.hero.state==='move'&&
    Math.abs(G.hero.x-EXIT_GATE_X)<155&&Math.abs(G.hero.y-GROUND)<65;
}
function interact(){
  if(canUseFinalStairs())offerFinalArena();
  else if(canUseBrazier())completeLevel();
}

// ---------- Inimigos ----------
const JUMP_LOOKAHEAD = 78;
const JUMP_SPEED = 330;
const JUMP_IMPULSE = 1110;

function startObstacleJump(e, direction) {
  if (e.T.boss || !e.onGround || !direction) return false;
  const front = e.x + direction * e.w / 2;
  let nearest = JUMP_LOOKAHEAD;
  let step;
  for (const solid of G.solids) {
    const rise = e.y - solid.y;
    // Only reachable ledges with a vertical face beside the enemy.
    if (rise < 8 || rise > 180 || solid.y + solid.h < e.y - 2 || solid.w < e.w + 8) continue;
    const edge = direction > 0 ? solid.x : solid.x + solid.w;
    const gap = (edge - front) * direction;
    if (gap < -2 || gap > nearest) continue;
    const stepX = edge + direction * Math.min(solid.w / 2, e.w / 2 + 24);
    if (nearPit(stepX - e.w / 2, e.w, 8)) continue;
    nearest = gap;
    step = { targetX: stepX, top: solid.y };
  }
  if (!step) return false;
  e.terrainJump = { stage: 'takeoff', time: 0, direction, ...step };
  e.vx = 0;
  e.face = direction;
  return true;
}

function advanceObstacleJump(e, dt) {
  const jump = e.terrainJump;
  jump.time += dt;
  if (jump.stage === 'takeoff' && jump.time >= 0.13) {
    jump.stage = 'air';
    jump.time = 0;
    e.vy = -JUMP_IMPULSE;
    e.onGround = false;
  }
  if (jump.stage === 'air' && dt > 0) {
    const remaining = Math.max(0, (jump.targetX - e.x) * jump.direction);
    // At point-blank range, lift the feet before pushing into the block.
    const canAdvance = e.y <= jump.top - 4 || jump.time < 0.16;
    e.vx = canAdvance ? jump.direction * Math.min(JUMP_SPEED, remaining / dt) : 0;
  } else if (jump.stage !== 'air') {
    e.vx = 0;
  }
  moveBody(e, dt);
  if (jump.stage === 'air' && e.onGround) {
    jump.stage = 'land';
    jump.time = 0;
    e.vx = 0;
  }
  if ((jump.stage === 'land' && jump.time >= 0.14) || (jump.stage === 'air' && jump.time > 1.3)) {
    e.terrainJump = null;
  }
}

function updateEnemy(e, dt) {
  if (e.dead) { e.deathT += dt; return; }
  const h = G.hero;
  e.hitFlash = Math.max(0, e.hitFlash - dt); e.trapCd = Math.max(0, e.trapCd - dt);
  e.animTime = (e.animTime ?? 0) + dt;
  if(e.wingReveal>0)e.wingReveal=Math.max(0,e.wingReveal-dt);
  if(e===G.boss&&inFinalArena(G)&&e.phase===2&&updateDevilFlight(e,G,dt,flightAPI))return;
  if (e.terrainJump && e.state === 'idle') {
    advanceObstacleJump(e, dt);
    return;
  }
  e.terrainJump = null;
  const previousX = e.x;
  moveBody(e, dt);
  if (e.state === 'idle' && e.onGround) e.walkDistance = (e.walkDistance ?? 0) + Math.abs(e.x - previousX);
  if (e.state === 'stun') { e.vx *= 0.9; e.stun -= dt; if (e.stun <= 0) { e.state = 'idle'; e.cd = 0.3; } return; }
  const dx = h.x - e.x, dist = Math.abs(dx);
  const aggro = h.state !== 'dead' && ((dist < 850 && Math.abs(h.y - e.y) < 450) || e.required);
  const list = ATK[e.type];
  if (e.state === 'idle') {
    e.vx *= 0.85;
    if (!aggro) return;
    e.face = dx >= 0 ? 1 : -1;
    const ranged = list[0].proj;
    let mv = 0;
    if (ranged) { if (dist < 350) mv = -e.face; else if (dist > list[0].range * 0.8) mv = e.face; }
    else if (dist > 90) mv = e.face;
    e.cd -= dt;
    // A creature that is trying to approach a target jumps before attacking into the block.
    if (mv === e.face && startObstacleJump(e, mv)) return;
    if (e.cd <= 0) {
      const opts = list.filter(a => dist <= a.range && !a.counter && (!a.phase2 || e.phase === 2));
      if (opts.length) {
        e.atk = opts[Math.floor(Math.random() * opts.length)];
        e.state = 'wind'; e.t = 0; e.tped = false; e.chainLeft = e.atk.chain || 0;
        const preparation = CHARGE_SOUND[e.atk.proj] ?? (e.type==='acolyte'?'fire-charge':null);
        if (preparation) sfx(preparation, .59, e.x);
        if (e.atk.teleport) {
          const inArena = e.role !== 'explore';
          // Inimigos da exploração nunca atravessam a entrada da arena por teleporte.
          e.tpX = clamp(h.x - h.face * 120,
            inFinalArena(G)?FINAL_ARENA.left+e.w/2+12:inArena ? G.gateX + 60 + e.w / 2 + 8 : 60,
            inFinalArena(G)?LEVEL_W-e.w/2-12:inArena ? EXIT_GATE_X - e.w / 2 - 8 : G.gateX - e.w / 2 - 8);
          if (!inArena) e.tpX = safeExploreX(e.tpX, e.w);
        }
        return;
      }
    }
    if (mv && mv !== e.face && startObstacleJump(e, mv)) return;
    if (mv) e.vx = mv * e.T.speed * e.spd;
  } else if (e.state === 'wind') {
    e.vx = 0; e.t += dt;
    const a = e.atk;
    if (a.teleport && !e.tped && e.t > a.wind * 0.5) {
      burst(e.x, e.y - 60, 16, '#ff2050', 300, 5, 0.5);
      e.x = e.tpX; e.tped = true; e.face = h.x >= e.x ? 1 : -1;
      sfx('teleport', .83, e.x);
      burst(e.x, e.y - 60, 16, '#ff2050', 300, 5, 0.5);
    }
    if (e.t >= a.wind / (e.phase === 2 ? 1.2 : 1)) {
      e.state = 'act'; e.t = 0; e.hitDone = false;
      if (a.lunge) e.vx = e.face * a.lunge;
      const dmg = e.T.dmg * e.dmgMul * a.mul;
      if (a.proj) {
        const n=a.count||1,{x:ox,y:oy}=muzzle(e),aim=heroAim(h);
        const ang = Math.atan2(aim.y-oy,aim.x-ox);
        const sp = a.proj === 'arrow' ? 850 : a.proj === 'orb' ? 470 : a.proj === 'water' ? 560 : 620;
        for (let i = 0; i < n; i++) {
          const an = ang + (i - (n - 1) / 2) * 0.18;
          G.projs.push({ source:e.type,x:ox,y:oy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, r: a.proj === 'arrow' ? 10 : 18, dmg, type: a.proj, life: 4, dead: false });
        }
        const cast = e.type==='acolyte'?'fire-cast':e.type==='herald'?'holy-cast':CAST_SOUND[a.proj];
        sfx(cast, .82, e.x);
      }
      if (a.quake) {
        quake(18); sfx(e.type==='drowned'?'water-wave':'ground-slam', .82, e.x);
        [-1, 1].forEach(d => G.hazards.push({ source:e.type,type:'wave', x: e.x, dir: d, life: 1.6, dmg, hit: false, dead: false }));
      }
      if (a.marks) {
        // Posições sinalizadas no chão (vermelho) antes de explodir/emergir.
        for (let i = 0; i < a.marks; i++) {
          const off = (i - (a.marks - 1) / 2) * (a.spread || 0);
          G.hazards.push({ source:e.type,type:'pillar', style: a.style || 'pillar', x: clamp(h.x + off, 80, LEVEL_W - 80), t: -i * 0.12, warn: 0.85, act: 0.35, dmg, hit: false, dead: false, boomed: false });
        }
      }
      if (a.fireZone) {
        for (let i = 0; i < a.fireZone; i++) {
          const fx = clamp(h.x + (i - (a.fireZone - 1) / 2) * 230 + rand(-30, 30), G.gateX + 120, EXIT_GATE_X - 60);
          G.hazards.push({ source:e.type,type:'flame', x: fx, w: 150, t: 0, warn: 0.7, life: 3.0, dmg: dmg * 0.6, dead: false, color: '255,110,30' });
        }
        if (!a.proj && e.type!=='devil') sfx('fire-charge', .50, e.x);
      }
      if(a.w){
        const swing=e.type==='devil'&&e.phase===2?'usurpador-golpe':
          a.name==='Empurrão de escudo'?'charge':ATTACK_FOLEY[e.type]??'enemy-sword';
        sfx(swing, .58, e.x);
      }
      if (a.leap) { e.vy = -950; e.vx = clamp(dx * 1.35, -900, 900); e.onGround = false; e.landed = false; }
      if (a.shock) G.hazards.push({ source:e.type,type:'wave', x: e.x + e.face * 80, dir: e.face, life: 1.0, dmg: dmg * 0.6, hit: false, dead: false });
    }
  } else if (e.state === 'act') {
    e.t += dt;
    const a = e.atk;
    if (a.leap) {
      if (e.onGround && e.t > 0.1 && !e.landed) { e.landed = true; e.vx = 0; quake(14); sfx('ground-slam', .75, e.x); burst(e.x, GROUND - 10, 24, G.lv.ash, 400, 6, 0.6); }
    } else e.vx *= 0.92;
    if (a.trail && Math.random() < dt * 14) {
      // Avanço que deixa pétalas cortantes temporárias no caminho (vermelho: não aparável).
      const last = G.hazards[G.hazards.length - 1];
      if (!last || last.type !== 'flame' || Math.abs(last.x - e.x) > 110)
        G.hazards.push({ source:e.type,type:'flame', x: e.x, w: 100, t: 0, warn: 0.35, life: 2.0, dmg: e.T.dmg * 0.45, dead: false, color: '220,40,90' });
    }
    if (a.w && !e.hitDone) {
      const box = a.leap ? { x: e.x - a.w / 2, y: e.y - a.h, w: a.w, h: a.h } : { x: e.face > 0 ? e.x : e.x - a.w, y: e.y - a.h, w: a.w, h: a.h };
      if (regionsHit(enemyStrike(e,a),heroHurt(h))) {
        const r = hitHero(e.T.dmg * e.dmgMul * a.mul, e, { unparry: a.red });
        if (r !== 'miss') e.hitDone = true;
        if (r === 'parry') { onParried(e); return; }
      }
    }
    if (e.t >= a.act && (!a.leap || e.onGround)) { e.state = 'rec'; e.t = 0; }
  } else if (e.state === 'rec') {
    e.t += dt; e.vx *= 0.85;
    if (e.chainLeft > 0 && e.t >= 0.15) {
      // Combo: encadeia o próximo golpe com preparação curta, ainda sinalizada.
      e.chainLeft--; e.state = 'wind'; e.t = e.atk.wind * 0.45; e.face = dx >= 0 ? 1 : -1;
      return;
    }
    if (e.t >= e.atk.rec / (e.phase === 2 ? 1.3 : 1)) {
      e.state = 'idle';
      e.cd = e.T.boss ? rand(0.3, 0.8) : rand(0.5, 1.4);
      if (e.phase === 2) e.cd *= 0.6;
    }
  }
}

function updateProjectiles(dt, oldHeroX=G.hero.x) {
  const h = G.hero;
  for (const p of G.projs) {
    if (p.type === 'orb') {
      const ang = Math.atan2(heroAim(h).y-p.y,heroAim(h).x-p.x), cur = Math.atan2(p.vy, p.vx);
      let d = ang - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      const na = cur + clamp(d, -1.2 * dt, 1.2 * dt), sp = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
    }
    const oldX=p.x,oldY=p.y;p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    const impact=p.source==='acolyte'?'fire-burst':p.source==='herald'?'holy-burst':PROJECTILE_CONTACT[p.type];
    if (p.y > GROUND || p.life <= 0) {
      if(p.y>GROUND && impact)sfx(impact, .52, p.x);
      p.dead = true; continue;
    }
    const hb = heroBox(h);
    if (projectileHit(p,h,oldX,oldY)) {
      const r = hitHero(p.dmg, { x: p.x }, { proj: true });
      if (r === 'parry') { p.dead = true; sfx(p.type==='arrow'?'arrow-parry':'magic-parry', .9); burst(p.x, p.y, 12, '#ffe080', 300, 4, 0.3); save.stats.parries++; }
      else if (r === 'hit') { p.dead = true; if(impact)sfx(impact, .8); }
    }
  }
  G.projs = G.projs.filter(p => !p.dead);

  for (const z of G.hazards) {
    if(z.type==='dust-slam'||z.type==='wing-gust'){
      const previous=z.radius;
      z.radius+=z.speed*dt;
      if(!z.hit&&dustTouches(h,oldHeroX,z,previous,GROUND)){
        const result=hitHero(z.dmg,z,{unparry:true,hazard:true,groundPulse:z.type==='dust-slam'});
        if(result==='hit')z.hit=true;
      }
      if(z.radius>=z.limit+85)z.dead=true;
    } else if (z.type === 'wave') {
      z.x += z.dir * 700 * dt; z.life -= dt;
      if (Math.random() < 0.6) G.fx.push({ x: z.x, y: GROUND - 5, vx: rand(-60, 60), vy: rand(-400, -150), life: 0.5, max: 0.5, color: G.lv.accent, size: 6, grav: 900 });
      if (!z.hit && Math.abs(h.x - z.x) < 45 && h.y > GROUND - 50) { if (hitHero(z.dmg, { x: z.x - z.dir }, { unparry: true }) === 'hit') z.hit = true; }
      if (z.life <= 0) z.dead = true;
    } else if (z.type === 'pillar') {
      z.t += dt;
      if (z.t >= z.warn && !z.boomed) {
        z.boomed = true; quake(10);
        const eruption = z.style==='spike'?'spike':z.source==='herald'?'holy-burst':
          ['acolyte','devil','smith'].includes(z.source)?'fire-burst':'void-burst';
        sfx(eruption, .58, z.x);
      }
      if (z.t >= z.warn && z.t < z.warn + z.act && !z.hit && Math.abs(h.x - z.x) < 70) { if (hitHero(z.dmg, { x: z.x }, { unparry: true, hazard:true }) === 'hit') z.hit = true; }
      if (z.t >= z.warn + z.act) z.dead = true;
    } else if (z.type === 'flame') {
      // Área temporária: sinaliza (warn) e depois queima enquanto durar.
      z.t += dt;
      if(z.t>=z.warn&&!z.boomed){z.boomed=true;sfx(z.source==='nameless'?'void-burst':'fire-burst', .55, z.x);}
      if (z.t >= z.warn && Math.abs(h.x - z.x) < z.w / 2 + h.w / 2 - 10 && h.y > GROUND - 160) hitHero(z.dmg, { x: z.x }, { unparry: true, hazard:true });
      if (z.t >= z.warn + z.life) z.dead = true;
    }
  }
  G.hazards = G.hazards.filter(z => !z.dead);

  for (const tr of G.traps) {
    tr.t += dt;
    const ph = tr.t % tr.period;
    const wasOn=tr.on;
    tr.on = ph >= tr.warn && ph < tr.warn + tr.active; tr.warning = ph < tr.warn;
    if (!tr.on) continue;
    if(!wasOn)sfx(tr.type==='spikes'?'spike':'fire-burst', .59, tr.x);
    const box=floorTrapBox(G,tr,GROUND);
    if (overlap(box, heroBox(h))) hitHero(18 + G.li * 2, { x: tr.x }, { unparry: true, hazard:true });
  }
}

function updatePitHazards() {
  const h = G.hero;
  if (h.state === 'dead' || G.cine) return;
  if (h.onGround && !h.onPlat && Math.abs(h.y - GROUND) < 2 && !nearPit(h.x - h.w / 2, h.w, 35)) {
    h.lastSafeX = h.x;
  }
  const pit = G.pits.find(p => h.x + h.w / 2 > p.x && h.x - h.w / 2 < p.x + p.w && h.y >= pitTrapBox(p,GROUND).y);
  if (!pit) return;
  // Espinhos do fosso são permanentes. Cair custa 25 de dano base (antes da defesa).
  // O retorno para a borda também funciona durante E/esquiva, sem aprisionar a heroína.
  h.iframes = 0; h.parryT = 0;
  hitHero(25, { x: pit.x + pit.w / 2 }, { unparry: true, hazard:true });
  sfx('spike', .76);
  if (h.state === 'dead') return;
  h.x = h.lastSafeX > pit.x + pit.w / 2 ? pit.x + pit.w + 90 : pit.x - 90;
  h.y = GROUND; h.vx = 0; h.vy = 0;
  h.state = 'hurt'; h.t = 0; h.iframes = 1; h.onGround = true; h.onPlat = false;
  h.lastSafeX = h.x; h.jumpBuf = 0; h.dropT = 0; h.coyote = 0.1;
  h.comboQ = false; h.after = []; h.dashFrom = h.x;
}

function explorationRemaining() {
  return G.enemies.filter(e => e.role === 'explore' && !e.dead).length;
}
function updateEntryGate() {
  if (G.entryOpen || G.arenaOn || explorationRemaining() > 0) return;
  G.entryOpen = true;
  G.unlockFx = 1.2;
  if(G.li===FINAL_ARENA.level){
    banner('A escadaria está livre.','Suba para enfrentar o Usurpador.',3);
    return;
  }
  burst(G.gateX + 30, GROUND - 160, 28, '#b8e8d0', 180, 5, 0.8, -80);
  banner('O selo da arena foi rompido.', '', 3);
  sfx('gate-open', .66, G.gateX);
}
function nearFinalStairs(){
  return G.hero.x>=G.gateX-FINAL_ARENA.approach&&G.hero.x<=G.gateX&&Math.abs(G.hero.y-GROUND)<70;
}
function canUseFinalStairs(){
  return mode==='play'&&G?.li===FINAL_ARENA.level&&G.entryOpen&&!G.arenaOn&&!G.cine&&
    G.hero.state==='move'&&G.hero.onGround&&nearFinalStairs();
}
function offerFinalArena(){
  if(!canUseFinalStairs())return;
  mode='finalPrompt';keys.clear();pressed.clear();idleSeconds=0;
}
function confirmFinalArena(accepted){
  if(mode!=='finalPrompt')return;
  mode='play';keys.clear();pressed.clear();
  if(!accepted)return;
  if(finalIntroWasSeen())enterFinalArena();
  else{beginStory('confronto');persist();}
}
function enterFinalArena(){
  if(G.li!==FINAL_ARENA.level||G.arenaOn)return;
  G.arenaOn=true;
  G.cam=FINAL_ARENA.left;
  G.enemies=[];G.projs=[];G.hazards=[];G.traps=[];G.fx=[];G.texts=[];
  G.shake=0;G.flash=0;G.ultTrail=null;
  Object.assign(G.hero,{
    x:FINAL_ARENA.entry,y:GROUND,vx:0,vy:0,face:1,t:0,onGround:true,onPlat:false,
    lastSafeX:FINAL_ARENA.entry,jumpBuf:0,coyote:0.1,dropT:0,after:[],afterT:0,
  });
  // O chefe e os reforços usam a mesma altura de chão da exploração.
  const boss=makeEnemy(G.lv.arena[0],FINAL_ARENA.boss);
  Object.assign(boss,{y:GROUND,onGround:true,required:true,role:'arena'});
  G.enemies.push(boss);G.boss=boss;
  musicWant='boss';
  G.banner=null;
  persist();
}
function updateArena() {
  const h = G.hero;
  updateEntryGate();
  if (mode!=='play'||h.state === 'dead') return;
  if(G.li===FINAL_ARENA.level&&!G.arenaOn)return;
  // A heroína deve cruzar por inteiro antes de fechar a entrada atrás dela.
  if (G.entryOpen && !G.arenaOn && G.gateLift >= 1 && h.x > G.gateX + 202) {
    G.arenaOn = true;
    const arenaWidth = EXIT_GATE_X - ARENA_X;
    const pos = shuffle([0.25, 0.4, 0.55, 0.7, 0.85].map(t => ARENA_X + arenaWidth * t));
    let boss = null;
    G.lv.arena.forEach((t, i) => {
      const e = makeEnemy(t, pos[i % pos.length]);
      e.required = true; e.role = 'arena'; e.y = GROUND;
      G.enemies.push(e); if (e.T.boss || e.T.champion) boss = e;
    });
    G.boss = boss;
    if (boss) { banner(boss.T.name, '', 3); musicWant = boss.T.boss ? 'boss' : 'combat'; }
    else { banner('Arena', 'Derrote todos os inimigos', 2); musicWant = 'combat'; }
    quake(8); sfx('gate-close', .62, G.gateX);
  }
  if (G.arenaOn && !G.arenaDone && G.enemies.filter(e => e.required && !e.dead).length === 0) {
    G.arenaDone = true; musicWant = 'combat';
    banner(G.boss?.type==='gatekeeper'?'A sentinela caiu.':G.boss?.T.name+' caiu.', 'O braseiro da passagem foi aceso.', 3);
    sfx('brazier-light', .65, EXIT_GATE_X); cue('victory');
  }
  if (!G.arenaOn) musicWant = 'combat';
}

function completeLevel() {
  if (!G || !G.arenaDone || G.completed || G.hero.state === 'dead') return;
  G.completed = true;
  syncHp();
  save.activeRun = null; // O ouro desta tentativa passa a ser definitivo no portal.
  save.maxCleared = Math.max(save.maxCleared, G.li + 1);save.checkpoint=G.li===9?'ending':'shop';
  if(G.li===9){
    beginStory('epilogo');
  }else{
    mode='shop';showUI('shop');
  }
  musicWant='explore';
  persist();
}

// ---------- Update ----------
function updateIdleVoice(dt) {
  const h=G.hero;
  if(keys.size||pressed.size||h.state!=='move'||!h.onGround||G.trans>0||
     G.enemies.some(e=>!e.dead&&Math.abs(e.x-h.x)<650)){
    idleSeconds=0;
    return;
  }
  idleSeconds+=dt;
  if(idleSeconds>=45){
    voice(idleVoices[idleVoice]);
    idleVoice=(idleVoice+1)%idleVoices.length;
    idleSeconds=0;
  }
}
function updatePlay(dt) {
  if (G.cine) { updateCine(dt); updateFx(dt); return; }
  if (G.finalShift) { updateFinalShift(dt); return; }
  if(guardSceneProgress(G.boss)!==null){
    const e=G.boss;
    e.animTime=(e.animTime??0)+dt;
    updateDevilFlight(e,G,dt,flightAPI);
    const x=clamp((e.x*.62+G.hero.x*.38)-W/2,FINAL_ARENA.left,LEVEL_W-W);
    G.cam+=(x-G.cam)*Math.min(1,dt*5);
    updateFx(dt);
    return;
  }
  G.time += dt; save.stats.time += dt;
  if (G.trans > 0) G.trans = Math.max(0, G.trans - dt);
  updateEntryGate();
  const oldHeroX=G.hero.x;
  updateHero(dt);
  if (mode !== 'play' || G.cine || G.finalShift || guardSceneProgress(G.boss)!==null) return;
  updatePitHazards();
  for (const e of G.enemies) updateEnemy(e, dt);
  if(guardSceneProgress(G.boss)!==null)return;
  G.enemies = G.enemies.filter(e => !(e.dead && e.deathT > 1));
  updateProjectiles(dt,oldHeroX);
  updateArena();
  if(mode!=='play')return;
  updateFx(dt);
  updateIdleVoice(dt);
  const h = G.hero;
  const target = h.x - W / 2 + h.face * 140;
  G.cam += (target - G.cam) * Math.min(1, dt * 5);
  G.cam = clamp(G.cam, inFinalArena(G)?FINAL_ARENA.left:0, LEVEL_W - W);
  G.hint = '';
}

function updateFx(dt) {
  G.unlockFx = Math.max(0, G.unlockFx - dt);
  if (G.ultTrail && !G.cine) {
    G.ultTrail.life -= dt;
    if (G.ultTrail.life <= 0) G.ultTrail = null;
  }
  for (const p of G.fx) { const oldX=p.x,oldY=p.y;p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.life -= dt; }
  G.fx = G.fx.filter(p => p.life > 0);
  if (G.fx.length > 600) G.fx.splice(0, G.fx.length - 600);
  for (const t of G.texts) { t.y -= 60 * dt; t.life -= dt; }
  G.texts = G.texts.filter(t => t.life > 0);
  for (const a of G.hero.after) a.a -= dt * 1.6;
  G.hero.after = G.hero.after.filter(a => a.a > 0);
  for (const a of G.ash) { a.x += a.vx * dt; a.y += a.vy * dt; if (a.y > H) { a.y = -5; a.x = rand(0, W); } if (a.x < 0) a.x += W; }
  G.shake *= Math.pow(0.002, dt); G.flash = Math.max(0, G.flash - dt * 2.5);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
}


function pause(){if(mode==='play'){mode='paused';keys.clear();pressed.clear();syncHp();persist();}}
function resume(){if(mode==='paused'){mode='play';keys.clear();pressed.clear();}}
function menu(){
 if(mode==='credits')save.storyPending=null;
 syncHp();persist();mode='menu';keys.clear();pressed.clear();
}
function shop(){if(save.maxCleared>0){mode='shop';showUI('shop');save.checkpoint='shop';persist();}}
function buy(kind,index){
 if(mode!=='shop')return false;
 const list=kind==='W'?WEAPONS:kind==='A'?ARMORS:null;
 if(!list||!Number.isInteger(index)||index<0||index>=list.length)return false;
 const owned=kind==='W'?save.ownedW:save.ownedA;
 if(owned.includes(index)){if(kind==='W')save.weapon=index;else equipArmor(index);persist();return true;}
 const item=list[index];if(index>save.maxCleared||save.gold<item.price)return false;
 save.gold-=item.price;owned.push(index);
 if(kind==='W')save.weapon=index;else equipArmor(index);
 persist();return true;
}
function buyPotion(kind){
 if(mode!=='shop'||!['hp','st'].includes(kind))return false;
 const key=kind==='hp'?'potHp':'potSt',price=potionPrice(kind,save.maxCleared);
 if(save[key]>=5||save.gold<price)return false;
 save.gold-=price;save[key]++;persist();return true;
}
function start(index){
 if(!Number.isInteger(index)||index<0||index>=LEVELS.length||index>Math.min(save.maxCleared,9))return false;
 startLevel(index);return true;
}
function newGame(){G=null;save=defSave();startLevel(0,true);}
function continueGame(){
 if(continueMemory())return;
 if(save.storyPending==='abertura'){startLevel(0,true);return;}
 if(save.checkpoint==='ending'){
  if(save.storyPending==='epilogo'){beginStory('epilogo');return;}
  if(save.storyPending==='creditos'){beginEpilogueEnd();return;}
  mode='ending';return;
 }
 if(save.checkpoint==='shop'&&save.maxCleared>0){mode='shop';return;}
 startLevel(clamp(save.currentLevel??save.maxCleared,0,9));
}
function step(input={},dt=1/60){
 audio.length=0;
 if(mode==='story'){if(input.skipStory)finishStory();return;}
 if(mode==='epilogueBlack'){
  epilogueBlackRemaining-=Math.max(0,dt);
  if(epilogueBlackRemaining<=1e-7){mode='credits';showUI('credits');}
  return;
 }
 if(mode==='credits'||mode==='finalPrompt')return;
 dt=clamp(dt,0,1/30);
 if(openingVoicePending&&mode==='play'){openingVoicePending=false;voice('start');}
 if(input.pause){if(mode==='play')pause();else if(mode==='paused')resume();}
 keys.clear();pressed.clear();
 for(const [key,codes] of Object.entries({left:['KeyA'],right:['KeyD'],down:['KeyS']}))if(input[key])codes.forEach(c=>keys.add(c));
 for(const [key,code] of Object.entries({jump:'Space',attack:'KeyJ',dodge:'ShiftLeft',parry:'KeyQ',dash:'KeyE',ult:'KeyR',heal:'KeyH',stamina:'Digit2',interact:'KeyF'}))if(input[key])pressed.add(code);
 if(G&&mode==='play'&&!G.cine){
   const target=G.arenaOn&&!G.arenaDone?0:G.entryOpen?1:0;
   G.gateLift=clamp(G.gateLift+(target>G.gateLift?dt/.85:target<G.gateLift?-dt/.6:0),0,1);
 }
 if(mode==='play'&&G){G.hero.visualTrans=G.trans>0;G.hero.animClock=G.time;updatePlay(dt);G.hero.visualTrans=G.trans>0||(G.cine&&G.cine.t>=ULT_CINE.reveal);G.hero.animClock=G.time;}
 pressed.clear();
}
// Manual memories and the current automatic resume are stored separately.
function memoryRoot(){
 const screen=['ending','epilogueBlack','credits'].includes(mode)||G?.completed&&save.checkpoint==='ending'?'ending':mode==='shop'||G?.completed&&save.checkpoint==='shop'?'shop':'play';
 if(screen==='play'&&(!G||G.hero.state==='dead'||G.hero.hp<=0))return null;
 const campaign={...save,hp:G&&G.hero.state!=='dead'?G.hero.hp:save.hp};
 return {version:1,screen,campaign,world:G,attacks:G?G.enemies.map(e=>e.atk?ATK[e.type].indexOf(e.atk):-1):[]};
}
function persistMemory(){
 try{const root=memoryRoot();writeStored(localStorage,AUTO_KEY,root?makeEnvelope(root):null);}catch{}
}
function applyMemory(root){
 root=validateMemory(root);
 save=root.campaign;G=root.world;mode=root.screen;hasSave=true;story=null;
 if(typeof save.campaignId!=='string'||!save.campaignId)save.campaignId=newCampaignId();
 idleSeconds=0;openingVoicePending=false;
 if(save.ultimateUsed===undefined)save.ultimateUsed=!!G?.cine||G?.trans>0;
 lastLevel=G?.li??Math.min(save.currentLevel??save.maxCleared,9);
 keys.clear();pressed.clear();audio.length=0;
 musicWant=G?.arenaOn&&!G.arenaDone?'boss':'combat';
 if(G?.li===FINAL_ARENA.level){
  G.plats=G.plats.filter(p=>p.x<G.gateX);
  if(inFinalArena(G))G.cam=clamp(G.cam,FINAL_ARENA.left,LEVEL_W-W);
  else if(G.hero.x>G.gateX-G.hero.w/2){
   const approach=G.gateX-120;
   Object.assign(G.hero,{x:approach,y:GROUND,vx:0,vy:0,lastSafeX:approach,onGround:true,onPlat:false});
   G.cam=clamp(approach-W/2+G.hero.face*140,0,LEVEL_W-W);
  }
 }
 if(save.storyPending==='abertura'&&G?.li===0)beginStory('abertura');
 else if(save.storyPending==='confronto'&&G?.li===FINAL_ARENA.level&&!G.arenaOn)beginStory('confronto');
 else if(save.storyPending==='epilogo'&&G?.li===9&&G.completed)beginStory('epilogo');
 else if(save.storyPending==='creditos'&&root.screen==='ending')beginEpilogueEnd();
 showUI(mode==='play'?'none':mode);
}
function continueMemory(){
 try{const raw=JSON.parse(localStorage.getItem(AUTO_KEY));if(!raw)return false;applyMemory(readEnvelope(raw,validateMemory));return true;}catch{return false;}
}
const memoryStore=createSlotStore(localStorage,validateMemory,options.now);
function listSlots(){return memoryStore.list().map(entry=>{
 const root=entry.state,s=root?.campaign,g=root?.world,li=g?.li??Math.min(s?.currentLevel??s?.maxCleared??0,9);
 return {index:entry.index,occupied:entry.occupied,valid:entry.valid,unavailable:entry.unavailable,savedAt:entry.savedAt,
  phase:li+1,phaseName:LEVELS[li]?.name??'',screen:root?.screen,gold:s?.gold??0,hp:s?.hp??0,maxHp:s?maxHpFor(s.armor):0,playTime:s?.stats.time??0};
 });}
function saveSlot(index,overwrite=false){
 if(!['paused','shop','ending'].includes(mode))return {ok:false,message:'Pause o jogo antes de salvar.'};
 const root=memoryRoot();if(!root)return {ok:false,message:'Não há uma vigília ativa para salvar.'};
 const result=memoryStore.put(index,root,overwrite);
 if(result.ok){syncHp();persist();}
 return result;
}
function loadSlot(index){
 const entry=memoryStore.get(index);
 if(!entry)return {ok:false,message:'Esta memória está vazia ou não pode ser carregada.'};
 entry.state.campaign.campaignId||=`legacy-${index}-${entry.savedAt}`;
 try{applyMemory(entry.state);persist();return {ok:true,message:'Memória carregada.'};}catch{return {ok:false,message:'Não foi possível carregar esta memória.'};}
}

return {
 get state(){return G},get mode(){return mode},get story(){return story},get save(){return save},get hasSave(){return hasSave},
 get soundEvents(){return audio},get settings(){return settings},get pose(){return G?heroImg(G.hero):'idle'},
 stats,step,start,newGame,continueGame,pause,resume,menu,shop,buy,buyPotion,listSlots,saveSlot,loadSlot,setVolume,toggleMute,finishStory,canUseBrazier,canUseFinalStairs,confirmFinalArena,
 retry(){if(G)startLevel(G.li)},next(){if(mode==='shop')startLevel(Math.min(save.maxCleared,9),false,G?.hero?.staminaBoost??0)},
 saveNow(){syncHp();persist()},
 // Exposed for deterministic headless gameplay verification, not keyboard cheats.
 rules:{damageEnemy,hitHero,checkAtk,onParried,updateEnemy,updateProjectiles,updateArena,completeLevel,startUlt,makeEnemy,moveBody,summonAdd,killEnemy,heroHurt,enemyHurt,swordSweep,swordHits,enemyStrike,muzzle,heroAim,projectileHit}
};
}
