export const LAYOUT_KEY = 'ultimaVigilia_touch_layout_v1';
export const CONTROL_NAMES = {joystick:'Mover',attack:'Atacar',jump:'Saltar',dodge:'Esquiva',parry:'Aparar',dash:'Avanço',ult:'Ultimate',heal:'Vida',stamina:'Vigor',interact:'Usar',pause:'Pausa',fullscreen:'Tela cheia'};
const landscape = {joystick:[14,74],attack:[85,76],jump:[94,56],dodge:[73,79],parry:[82,48],dash:[70,53],ult:[94,31],heal:[29,86],stamina:[39,86],interact:[60,80],pause:[48,8],fullscreen:[56,8]};
const portrait = {joystick:[18,77],attack:[81,79],jump:[91,64],dodge:[62,81],parry:[74,61],dash:[54,66],ult:[91,49],heal:[18,51],stamina:[36,51],interact:[48,89],pause:[43,5],fullscreen:[57,5]};
export function defaults() { return structuredClone({landscape,portrait}); }
export function isTouchDevice(nav=globalThis.navigator,media=globalThis.matchMedia) {
  return nav?.userAgentData?.mobile===true || /Android|iPhone|iPad|iPod|Mobile/i.test(nav?.userAgent??'') ||
    (Number(nav?.maxTouchPoints)>0 && !!media?.('(pointer: coarse)').matches);
}
export function loadLayout(storage) {
  const layout=defaults();
  try {
    const value=JSON.parse(storage?.getItem(LAYOUT_KEY)??'null');
    if(value?.version!==1)return layout;
    for(const orientation of ['landscape','portrait'])for(const id of Object.keys(CONTROL_NAMES)) {
      const p=value[orientation]?.[id];
      if(Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=100))layout[orientation][id]=[...p];
    }
  } catch {}
  return layout;
}
export function saveLayout(storage,layout) {
  try { storage?.setItem(LAYOUT_KEY,JSON.stringify({version:1,...layout}));return !!storage; } catch { return false; }
}
export function boundedPosition(x,y,width,height,radius=24) {
  const clamp=(n,span)=>Math.max(Math.min(radius+8,span/2),Math.min(span-Math.min(radius+8,span/2),n));
  return [clamp(x,width)/Math.max(1,width)*100,clamp(y,height)/Math.max(1,height)*100];
}
export class TouchInput {
  owners=new Map(); pressed=new Set(); movement={left:false,right:false,down:false};
  down(pointer,action) {
    if(this.owners.has(pointer))return;
    if(![...this.owners.values()].includes(action))this.pressed.add(action);
    this.owners.set(pointer,action);
  }
  up(pointer) { this.owners.delete(pointer); }
  move(x,y) { this.movement={left:x<-.28,right:x>.28,down:y>.48}; }
  clear() { this.owners.clear();this.pressed.clear();this.move(0,0); }
  sample() {
    const input={...this.movement};
    for(const action of this.pressed)input[action]=true;
    if([...this.owners.values()].includes('attack'))input.attack=true;
    this.pressed.clear();return input;
  }
}
