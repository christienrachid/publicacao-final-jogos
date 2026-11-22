export const SLOTS_KEY='ultimaVigilia_construct_slots_v1';
export const AUTO_KEY='ultimaVigilia_construct_resume_v1';
export const SLOT_COUNT=10;
// Object identity matters: the boss and already-hit enemies are referenced by
// several objects and Sets. JSON alone would lose these references.
export function packState(root){
 const nodes=[],seen=new Map();
 function value(v){
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Número inválido');return v;}
  if(typeof v!=='object')throw Error('Estado não serializável');
  if(seen.has(v))return {r:seen.get(v)};
  if(nodes.length>=16000)throw Error('Estado excessivo');
  const id=nodes.length;seen.set(v,id);nodes.push(null);
  nodes[id]=v instanceof Set?{k:'s',v:[...v].map(value)}:Array.isArray(v)?{k:'a',v:v.map(value)}:{k:'o',v:Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,value(x)])};
  return {r:id};
 }
 const ref=value(root);return {version:1,root:ref,nodes};
}
export function unpackState(data){
 if(data?.version!==1||!Array.isArray(data.nodes)||data.nodes.length<1||data.nodes.length>16000)throw Error('Formato inválido');
 const list=data.nodes.map(n=>{if(!n||!['o','a','s'].includes(n.k)||!Array.isArray(n.v)||n.v.length>16000)throw Error('Nó inválido');return n.k==='a'?[]:n.k==='s'?new Set():{};});
 const value=v=>{if(v===null||typeof v==='string'||typeof v==='boolean')return v;if(typeof v==='number'&&Number.isFinite(v))return v;if(v&&typeof v==='object'&&Object.keys(v).length===1&&Number.isInteger(v.r)&&v.r>=0&&v.r<list.length)return list[v.r];throw Error('Referência inválida');};
 data.nodes.forEach((n,id)=>{const target=list[id];if(n.k==='o')for(const item of n.v){if(!Array.isArray(item)||item.length!==2||typeof item[0]!=='string'||['__proto__','constructor','prototype'].includes(item[0]))throw Error('Campo inválido');target[item[0]]=value(item[1]);}else for(const item of n.v)n.k==='s'?target.add(value(item)):target.push(value(item));});
 return value(data.root);
}
export function makeEnvelope(state,now=()=>new Date()){
 return {version:1,savedAt:now().toISOString(),state:packState(state)};
}
export function readEnvelope(envelope,validate){
 if(envelope?.version!==1||typeof envelope.savedAt!=='string'||!Number.isFinite(Date.parse(envelope.savedAt)))throw Error('Memória inválida');
 return validate(unpackState(envelope.state));
}
export function writeStored(storage,key,value){
 try{const json=JSON.stringify(value);storage.setItem(key,json);return storage.getItem(key)===json;}catch{return false;}
}
export function createSlotStore(storage,validate,now){
 const read=()=>{try{const raw=storage.getItem(SLOTS_KEY);if(raw===null)return {version:1,slots:Array(10).fill(null)};const data=JSON.parse(raw);if(data?.version!==1||!Array.isArray(data.slots)||data.slots.length!==10)throw Error();return data;}catch{return null;}};
 const get=index=>{const data=read();if(!data||!Number.isInteger(index)||index<0||index>=10||!data.slots[index])return null;try{return {state:readEnvelope(data.slots[index],validate),savedAt:data.slots[index].savedAt};}catch{return null;}};
 return {
  list(){const data=read();return Array.from({length:10},(_,index)=>{const raw=data?.slots[index],entry=get(index);return {index,occupied:!!raw,valid:!!entry,unavailable:!data,savedAt:entry?.savedAt??null,state:entry?.state??null};});},
  get,
  put(index,state,overwrite=false){
   if(!Number.isInteger(index)||index<0||index>=10)return {ok:false,message:'Memória inválida.'};
   const data=read();if(!data)return {ok:false,message:'Não foi possível acessar as memórias deste navegador.'};
   if(data.slots[index]&&!overwrite)return {ok:false,needsConfirmation:true,message:'Esta memória já está ocupada.'};
   try{const envelope=makeEnvelope(state,now);readEnvelope(envelope,validate);data.slots[index]=envelope;if(!writeStored(storage,SLOTS_KEY,data))return {ok:false,message:'Não foi possível salvar. O armazenamento pode estar cheio ou bloqueado.'};return {ok:true,message:`Memória ${String(index+1).padStart(2,'0')} salva.`};}catch{return {ok:false,message:'Não foi possível salvar o estado da vigília.'};}
  }
 };
}
