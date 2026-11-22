// Última Vigília — dados enviados por Gustavo em 07/11/2026.
export const BAL = {
  baseHp: 100, baseSt: 100, speed: 360, jump: 1050,
  stRegen: 42, stDelay: 0.7, atkCost: 14, dodgeCost: 20,
  parryCost: 12, parryWindow: 0.2, dashCost: 25, dashCd: 5, dashDist: 300,
  energyPerHit: 10, energyDashCap: 20, ultRange: 650, transformTime: 8,
};
export const STAMINA_POTION = { duration: 60, multiplier: 2 };
export const ENEMY_TYPES = {
  crawler: { name: 'Cinza Rastejante', img: 'en-crawler', hp: 100, dmg: 16, speed: 85, w: 60, h: 90, dh: 120, gold: 12 },
  gatekeeper: { name: 'Sentinela da Porta', img: 'en-gatekeeper', hp: 550, dmg: 18, speed: 75, w: 80, h: 135, dh: 175, gold: 50, boss: true, shield: true },
  matriarch: { name: 'Matriarca do Coro', img: 'en-matriarch', hp: 700, dmg: 20, speed: 170, w: 150, h: 120, dh: 190, gold: 65, boss: true },
  drowned: { name: 'Vigia das Águas Mortas', img: 'en-drowned', hp: 900, dmg: 22, speed: 80, w: 80, h: 170, dh: 225, gold: 80, boss: true },
  gravedigger: { name: 'Coveiro dos Juramentos', img: 'en-gravedigger', hp: 1200, dmg: 25, speed: 80, w: 90, h: 170, dh: 230, gold: 95, boss: true },
  archivist: { name: 'Arquivista do Vazio', img: 'en-archivist', hp: 1300, dmg: 27, speed: 85, w: 80, h: 170, dh: 230, gold: 140, boss: true },
  eclipse: { name: 'Guardião do Eclipse', img: 'en-eclipse', hp: 800, dmg: 29, speed: 100, w: 85, h: 170, dh: 225, gold: 160, boss: true, shield: true, counter: true },
  nameless: { name: 'Dama Sem-Nome', img: 'en-nameless', hp: 1760, dmg: 31, speed: 150, w: 90, h: 160, dh: 200, gold: 180, boss: true },
  beast: { name: 'Presa do Coro', img: 'en-beast', hp: 80, dmg: 15, speed: 150, w: 90, h: 60, dh: 90, gold: 14 },
  archer: { name: 'Arqueiro Sepulcral', img: 'en-archer', hp: 80, dmg: 13, speed: 90, w: 50, h: 100, dh: 135, gold: 16 },
  lancer: { name: 'Lanceiro Funerário', img: 'en-lancer', hp: 176, dmg: 22, speed: 95, w: 56, h: 115, dh: 150, gold: 20 },
  smith: { name: 'Ferreiro Cego', img: 'en-smith', hp: 1000, dmg: 27, speed: 70, w: 110, h: 160, dh: 200, gold: 120, boss: true },
  acolyte: { name: 'Acólito do Vazio', img: 'en-acolyte', hp: 100, dmg: 18, speed: 70, w: 50, h: 110, dh: 140, gold: 22 },
  sentinel: { name: 'Sentinela de Obsidiana', img: 'en-sentinel', hp: 550, dmg: 25.2, speed: 70, w: 70, h: 125, dh: 160, gold: 28, shield: true },
  specter: { name: 'Espectro Carmesim', img: 'en-specter', hp: 165, dmg: 22, speed: 100, w: 56, h: 115, dh: 150, gold: 30 },
  herald: { name: 'Arauto da Ruína', img: 'en-herald', hp: 1980, dmg: 33, speed: 105, w: 90, h: 160, dh: 210, gold: 200, boss: true },
  devil: { name: 'O Diabo, Usurpador da Chama', img: 'en-devil', hp: 4225, phaseHp: [1625, 2600], dmg: 32, speed: 120, w: 120, h: 190, dh: 260, gold: 0, boss: true, final: true },
};
export function enemyMaxHp(type, levelIndex) {
  const enemy = ENEMY_TYPES[type];
  return enemy.phaseHp?.[0] ?? enemy.hp * (enemy.boss ? 1 : 1 + levelIndex * 0.12);
}
export const LEVELS = [
  { name: 'Portões da Cinza', bg: 'bg-1', tint: 'rgba(40,50,70,0.35)', accent: '#8fa3c0', sil: 'spires', ash: '#9aa0aa', theme: 'ruins',
    explore: ['crawler', 'crawler', 'archer', 'archer'], arena: ['gatekeeper'], traps: [], intro: 'A entrada da última cidade. A Sentinela da Porta bloqueia o caminho.' },
  { name: 'Bosque dos Sussurros', bg: 'bg-2', tint: 'rgba(30,50,40,0.35)', accent: '#8fb39a', sil: 'trees', ash: '#8a9a8a', theme: 'forest',
    explore: ['beast', 'crawler', 'archer', 'archer'], arena: ['matriarch'], traps: ['spikes'], intro: 'Árvores mortas sussurram o nome da chama.' },
  { name: 'Aqueduto Partido', bg: 'bg-3', tint: 'rgba(20,50,60,0.35)', accent: '#7fb8c4', sil: 'arches', ash: '#7aa0aa', theme: 'aqueduct',
    explore: ['archer', 'beast', 'archer', 'crawler'], arena: ['drowned'], traps: [], intro: 'A água parou de correr quando a luz se foi.' },
  { name: 'Catacumbas da Vigília', bg: 'bg-4', tint: 'rgba(40,30,25,0.4)', accent: '#c09a70', sil: 'tombs', ash: '#a08870', theme: 'catacombs',
    explore: ['lancer', 'archer', 'crawler', 'lancer'], arena: ['gravedigger'], traps: ['spikes'], intro: 'Aqui repousam as vigílias que vieram antes de você.' },
  { name: 'Forja dos Condenados', bg: 'bg-5', tint: 'rgba(60,25,10,0.3)', accent: '#ff8a3a', sil: 'furnace', ash: '#ff9a50', theme: 'forge',
    explore: ['lancer', 'beast', 'archer', 'archer'], arena: ['smith'], traps: ['fire'], intro: 'O martelo do Ferreiro Cego ainda ecoa nas fornalhas.' },
  { name: 'Biblioteca Profanada', bg: 'bg-6', tint: 'rgba(35,25,60,0.35)', accent: '#b090ff', sil: 'shelves', ash: '#b0a0e0', theme: 'library',
    explore: ['acolyte', 'archer', 'acolyte', 'acolyte'], arena: ['archivist'], traps: ['fire'], intro: 'Símbolos do vazio reescrevem as páginas da história.' },
  { name: 'Muralhas do Eclipse', bg: 'bg-7', tint: 'rgba(60,20,40,0.35)', accent: '#e07090', sil: 'walls', ash: '#c08090', theme: 'ramparts',
    explore: ['sentinel', 'archer', 'acolyte', 'acolyte'], arena: ['eclipse'], traps: ['spikes'], intro: 'Sob o sol negro, as sentinelas não dormem.' },
  { name: 'Jardim dos Sem-Nome', bg: 'bg-8', tint: 'rgba(50,15,25,0.35)', accent: '#ff5070', sil: 'statues', ash: '#d07080', theme: 'garden',
    explore: ['specter', 'beast', 'acolyte', 'specter'], arena: ['nameless'], traps: ['spikes', 'fire'], intro: 'Estátuas sem rosto choram pelos esquecidos.' },
  { name: 'Trono dos Apóstatas', bg: 'bg-9', tint: 'rgba(50,40,15,0.3)', accent: '#e0c070', sil: 'pillars', ash: '#d0b880', theme: 'throne',
    explore: ['sentinel', 'specter', 'specter', 'specter'], arena: ['herald'], traps: ['fire'], intro: 'Os antigos protetores juraram lealdade ao usurpador.' },
  { name: 'Coração do Abismo', bg: 'bg-10', tint: 'rgba(60,10,10,0.3)', accent: '#ff4020', sil: 'hell', ash: '#ff6040', theme: 'abyss',
    explore: ['specter', 'lancer', 'sentinel', 'sentinel'], arena: ['devil'], traps: ['fire'], intro: 'A chama roubada pulsa no coração do abismo.' },
];
export const WEAPONS = [
  { name: 'Lâmina da Vigília', dmg: 12, price: 0 },
  { name: 'Katana de Cinzas', dmg: 20, price: 90 },
  { name: 'Lâmina Sussurrante', dmg: 30, price: 170 },
  { name: 'Fio do Aqueduto', dmg: 39, price: 260 },
  { name: 'Katana Sepulcral', dmg: 47, price: 360 },
  { name: 'Aço da Forja Cega', dmg: 54, price: 480 },
  { name: 'Lâmina Arcana', dmg: 70, price: 610 },
  { name: 'Corte do Eclipse', dmg: 80, price: 760 },
  { name: 'Katana Sem-Nome', dmg: 95, price: 920 },
  { name: 'Lâmina Apóstata', dmg: 105, price: 1100 },
  { name: 'Última Centelha', dmg: 150, price: 1300 },
];
export const ARMORS = [
  { name: 'Traje da Vigília', hp: 0, def: 0, price: 0 },
  { name: 'Couraça de Cinzas', hp: 10, def: 0.04, price: 80 },
  { name: 'Manto do Bosque', hp: 15, def: 0.07, price: 150 },
  { name: 'Placas do Aqueduto', hp: 30, def: 0.1, price: 230 },
  { name: 'Mortalha Funerária', hp: 50, def: 0.13, price: 320 },
  { name: 'Ferro Temperado', hp: 65, def: 0.16, price: 420 },
  { name: 'Veste Arcana', hp: 80, def: 0.19, price: 540 },
  { name: 'Armadura do Eclipse', hp: 97, def: 0.22, price: 670 },
  { name: 'Couro Carmesim', hp: 115, def: 0.25, price: 820 },
  { name: 'Placas Apóstatas', hp: 160, def: 0.28, price: 990 },
  { name: 'Égide da Chama', hp: 200, def: 0.32, price: 1180 },
];
export function potionHeal(kind, shopLevel) { return kind === 'hp' ? 40 + shopLevel * 10 : 50 + shopLevel * 8; }
export function potionPrice(kind, shopLevel) { return kind === 'hp' ? 25 + shopLevel * 5 : 20 + shopLevel * 4; }
