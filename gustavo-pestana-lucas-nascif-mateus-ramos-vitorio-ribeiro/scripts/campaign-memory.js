import {BAL,LEVELS,ENEMY_TYPES,WEAPONS,ARMORS,enemyMaxHp,STAMINA_POTION} from './data.js';
import {ATK} from './attacks.js';
import {FINAL_SHIFT_DURATION,flightRecoverySeconds} from './devil-flight.js';
const finite=(o,fields)=>fields.every(k=>Number.isFinite(o?.[k]));
const rebalanced = new Set(['nameless', 'herald', 'lancer', 'specter', 'devil']);
const flightStages={
 dive:['rise','aim','dive','recover'],
 gust:['rise','aim','settle','recover'],
 guard:['prepare','rise','summon','guard','warning','drop','recover'],
};
function refreshEnemy(e, levelIndex) {
 e.T=ENEMY_TYPES[e.type];
 if(!rebalanced.has(e.type))return;
 const maxHp=e.T.final&&e.phase===2?e.T.phaseHp[1]:enemyMaxHp(e.type,levelIndex);
 if(e.maxHp===maxHp)return;
 if(!e.dead)e.hp=maxHp*(e.hp/e.maxHp);
 e.maxHp=maxHp;
}
export function validateMemory(root){
 const s=root?.campaign,g=root?.world;
 if(root?.version!==1||!['play','shop','ending'].includes(root.screen)||!s||!finite(s,['gold','hp','energy','maxCleared','weapon','armor','potHp','potSt'])||!Number.isInteger(s.maxCleared)||s.maxCleared<0||s.maxCleared>10||!WEAPONS[s.weapon]||!ARMORS[s.armor]||s.gold<0||s.hp<=0||s.hp>BAL.baseHp+ARMORS[s.armor].hp||s.energy<0||s.energy>100)throw Error('Campanha inválida');
 for(const [key,items]of [['ownedW',WEAPONS],['ownedA',ARMORS]])if(!Array.isArray(s[key])||!s[key].includes(0)||s[key].some(n=>!Number.isInteger(n)||!items[n]))throw Error('Equipamento inválido');
 if(!s.ownedW.includes(s.weapon)||!s.ownedA.includes(s.armor)||!s.stats||!finite(s.stats,['kills','deaths','time','goldTotal','parries']))throw Error('Progresso inválido');
 if(!g){if(root.screen==='play')throw Error('Fase ausente');return root;}
 if(!Number.isInteger(g.li)||!LEVELS[g.li]||!finite(g,['seed','time','cam','gateX','gateLift','trans'])||!g.hero||!finite(g.hero,['x','y','hp','st','vx','vy','t','dashCd','iframes'])||g.hero.hp<=0||g.hero.state==='dead'||g.hero.hp>BAL.baseHp+ARMORS[s.armor].hp||g.hero.st<0||g.hero.st>BAL.baseSt||!(g.hero.dashHit instanceof Set))throw Error('Personagem inválido');
 g.hero.staminaBoost??=0;
 if(!Number.isFinite(g.hero.staminaBoost)||g.hero.staminaBoost<0||g.hero.staminaBoost>STAMINA_POTION.duration)throw Error('Duração do frasco inválida');
 for(const key of ['enemies','projs','hazards','traps','pits','fx','texts','solids','plats','ash'])if(!Array.isArray(g[key])||g[key].length>2000)throw Error('Cenário inválido');
 for(const p of [...g.solids,...g.plats,...g.pits])if(!finite(p,['x','w'])||p.w<=0)throw Error('Terreno inválido');
 if(!Array.isArray(root.attacks)||root.attacks.length!==g.enemies.length)throw Error('Ataques inválidos');
 g.lv=LEVELS[g.li];
 g.enemies.forEach((e,n)=>{if(!ENEMY_TYPES[e.type]||!finite(e,['x','y','hp','maxHp','t','vx','vy'])||e.maxHp<=0||!Number.isInteger(root.attacks[n])||root.attacks[n]<-1||root.attacks[n]>=ATK[e.type].length)throw Error('Inimigo inválido');refreshEnemy(e,g.li);e.atk=root.attacks[n]===-1?null:ATK[e.type][root.attacks[n]];});
 if(g.boss&&!g.enemies.includes(g.boss)){if(!g.boss.dead||!ENEMY_TYPES[g.boss.type]?.boss)throw Error('Guardião inválido');refreshEnemy(g.boss,g.li);g.boss.atk=null;}
 if(g.cine&&!finite(g.cine,['t']))throw Error('Cinemática inválida');
 if(g.finalShift&&(g.li!==9||!g.arenaOn||g.boss?.type!=='devil'||g.boss.phase!==1||
   !finite(g.finalShift,['t','duration'])||g.finalShift.duration<=0||g.finalShift.t<0))
  throw Error('Transição do Usurpador inválida');
 if(g.finalShift&&g.finalShift.duration!==FINAL_SHIFT_DURATION){
  // A revisão anterior já armazenava o ponto da revelação como fração da cena.
  g.finalShift.t=Math.min(1,g.finalShift.t/g.finalShift.duration)*FINAL_SHIFT_DURATION;
  g.finalShift.duration=FINAL_SHIFT_DURATION;
 }
 const flight=g.boss?.flight;
 if(flight&&(g.li!==9||!g.arenaOn||g.boss.type!=='devil'||g.boss.phase!==2||
   !Object.hasOwn(flightStages,flight.kind)||!flightStages[flight.kind].includes(flight.stage)||
   !finite(flight,['t','target','fromX','fromY','healed'])||flight.t<0||flight.healed<0||
   flight.stage==='recover'&&!Number.isFinite(flight.recover)||
   flight.stage==='summon'&&(!Number.isInteger(flight.spawned)||flight.spawned<0||flight.spawned>6)))
  throw Error('Voo do Usurpador inválido');
 if(flight?.stage==='recover')flight.recover=flightRecoverySeconds(flight.kind);
 return root;
}
