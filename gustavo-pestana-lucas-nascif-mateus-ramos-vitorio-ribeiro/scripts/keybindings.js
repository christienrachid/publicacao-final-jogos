export const BINDINGS_KEY='ultimaVigilia_construct_bindings_v1';
export const ACTIONS=[
 {id:'left',name:'Mover para a esquerda',codes:['KeyA','ArrowLeft']},
 {id:'right',name:'Mover para a direita',codes:['KeyD','ArrowRight']},
 {id:'down',name:'Descer de uma plataforma (junto de saltar)',codes:['KeyS','ArrowDown']},
 {id:'jump',name:'Saltar',codes:['Space','KeyW','ArrowUp']},
 {id:'attack',name:'Atacar / combo',codes:['KeyJ','Mouse0']},
 {id:'dodge',name:'Esquivar',codes:['ShiftLeft','ShiftRight','KeyK']},
 {id:'parry',name:'Aparar',codes:['KeyQ']},
 {id:'dash',name:'Avanço',codes:['KeyE']},
 {id:'ult',name:'Ultimate',codes:['KeyR']},
 {id:'heal',name:'Usar frasco de vida',codes:['KeyH','Digit1']},
 {id:'stamina',name:'Usar frasco de estamina',codes:['Digit2']},
 {id:'interact',name:'Interagir com o braseiro',codes:['KeyF']},
 {id:'pause',name:'Pausar / retomar',codes:['Escape']}
];
const defaults=()=>Object.fromEntries(ACTIONS.map(a=>[a.id,[...a.codes]]));
const supported=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Left|Right|Up|Down)|Space|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Enter|Escape|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|CapsLock|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Mouse0)$/.test(code);
export function keyLabel(code,short=false){
 if(code?.startsWith('Key'))return code.slice(3);if(code?.startsWith('Digit'))return code.slice(5);if(code?.startsWith('Numpad'))return 'NUM '+code.slice(6);
 const names={Space:short?'SPC':'ESPAÇO',ArrowLeft:short?'ESQ.':'SETA ESQ.',ArrowRight:short?'DIR.':'SETA DIR.',ArrowUp:short?'CIMA':'SETA CIMA',ArrowDown:short?'BAIXO':'SETA BAIXO',ShiftLeft:short?'SHIFT':'SHIFT ESQ.',ShiftRight:short?'SHIFT':'SHIFT DIR.',ControlLeft:short?'CTRL':'CTRL ESQ.',ControlRight:short?'CTRL':'CTRL DIR.',AltLeft:short?'ALT':'ALT ESQ.',AltRight:short?'ALT':'ALT DIR.',Escape:'ESC',Mouse0:short?'CLIQUE':'CLIQUE ESQUERDO',Enter:'ENTER',Tab:'TAB',Backspace:short?'BKSP':'BACKSPACE',Delete:short?'DEL':'DELETE',Insert:short?'INS':'INSERT',Home:'HOME',End:'END',PageUp:short?'PGUP':'PAGE UP',PageDown:short?'PGDN':'PAGE DOWN',CapsLock:short?'CAPS':'CAPS LOCK',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
 return names[code]??code??'';
}
export function createBindings(storage){
 let map=defaults();
 try{const saved=JSON.parse(storage?.getItem(BINDINGS_KEY)??'null');if(saved?.version===1&&ACTIONS.every(a=>Array.isArray(saved.bindings?.[a.id])&&saved.bindings[a.id].length&&saved.bindings[a.id].length<=3&&saved.bindings[a.id].every(supported))){const all=ACTIONS.flatMap(a=>saved.bindings[a.id]);if(new Set(all).size===all.length)map=Object.fromEntries(ACTIONS.map(a=>[a.id,[...saved.bindings[a.id]]]));}}catch{}
 const persist=()=>{try{storage?.setItem(BINDINGS_KEY,JSON.stringify({version:1,bindings:map}));}catch{}};
 return {
  codes:id=>[...map[id]],label:(id,short=false)=>short?keyLabel(map[id][0],true):map[id].map(c=>keyLabel(c)).join(' / '),
  held:(id,keys)=>map[id].some(c=>keys.has(c)),
  pressed:(id,pressed)=>map[id].some(c=>pressed.has(c)),
  assign(id,code){
   if(!map[id]||!supported(code))return {ok:false,message:'Esta tecla é reservada. Escolha outra.'};
   if(map[id].length===1&&map[id][0]===code)return {ok:true,message:'Tecla mantida.'};
   const previous=map[id][0],owner=ACTIONS.find(a=>a.id!==id&&map[a.id].includes(code));
   if(owner)map[owner.id]=[previous,...map[owner.id].filter(c=>c!==code)];
   map[id]=[code];persist();
   return {ok:true,swapped:owner?.id,message:owner?`Teclas trocadas com “${owner.name}”.`:'Tecla salva.'};
  },
  reset(){map=defaults();persist();}
 };
}
