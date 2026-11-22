import {VOICE_CUES} from './hero-voice-cues.js';

const scenes={
 abertura:[
  ['abertura-escuro',null,[
   [0,'Na minha vila, o sino tocava ao anoitecer.'],
   [4.12,'Na noite em que levaram a Chama, ninguém ouviu o sino.'],
  ]],
  ['abertura-vila','vila',[
   [0,'A Chama da Vigília ardia na praça.'],
   [3.27,'Enquanto ela queimava, a maldição não podia tomar ninguém.'],
  ]],
  ['abertura-caminho','maldicao',[
   [0,'Quando amanheceu, já havia garras arranhando a madeira.'],
   [4.54,'Tranquei as portas por fora.','caminho'],
   [6.72,'Prometi abrir cada uma delas quando voltasse.','caminho'],
  ]],
 ],
 confronto:[
  ['confronto','confronto',[
   [0,'Você vai se arrepender de ter levado a Chama.'],
   [3.51,'Eu ouvi a minha vila pedir socorro.'],
   [6.24,'Hoje, você vai me ouvir.'],
  ]],
 ],
 epilogo:[
  ['final-relicario','relicario',[
   [0,'Quando ele caiu, vi a Chama dentro do relicário.'],
   [3.70,'Ainda ardia.'],
   [5.15,'Peguei-a com as duas mãos e voltei pelo caminho que tinha aberto.'],
  ]],
  ['final-cura','regresso',[
   [0,'Assim que o fogo tocou o braseiro, as garras recuaram.'],
   [4.35,'Abri uma porta de cada vez.'],
   [6.71,'Quando me chamaram pelo nome, eu soube que tinham voltado.'],
  ]],
  ['final-sino','regresso',[
   [0,'Naquela noite, o sino tocou.'],
   [3.09,'Deixei minha espada na soleira e fiquei para ouvir.'],
  ]],
 ],
};

const black={image:null,subtitle:'',fade:0};
const openingFade=1.25, openingBlack=2;

export function createStoryPlayer(voice,draw,finish){
 let current=null,index=0,elapsed=0,waited=0,started=false,lead=0,openingTail=null;
 function end(){
  current=null;draw(null);finish();
 }
 return (kind,dt)=>{
  if(!kind){current=null;draw(null);return;}
  if(current!==kind){
   current=kind;index=0;elapsed=0;waited=0;started=false;lead=kind==='confronto'?1:0;openingTail=null;
  }
  if(lead>0){
   lead=Math.max(0,lead-dt);
   if(lead>1e-7){draw(black);return;}
  }
  if(openingTail!==null){
   openingTail+=dt;
   if(openingTail>=openingFade+openingBlack-1e-7){end();return;}
   if(openingTail<openingFade)draw({image:'caminho',subtitle:'',fade:1-openingTail/openingFade});
   else draw(black);
   return;
  }
  const [name,image,captions]=scenes[kind][index];
  const cue='story-'+name;
  if(!started){
   waited+=dt;
   if(!voice.ready&&waited<3){draw(black);return;}
   voice.play(cue);
   started=true;
  }else{
   elapsed+=dt;
  }
  const duration=VOICE_CUES[cue].duration;
  const [,subtitle,art=image]=captions.findLast(([start])=>start<=elapsed);
  const firstArt=art===image?0:captions.find(([, , frame])=>frame===art)[0];
  const fade=kind==='confronto'?1:art?Math.min(1,Math.max(0,(elapsed-firstArt)/.30)):0;
  draw({image:art,subtitle,fade});
  if(elapsed>=duration+.35){
   index++;elapsed=0;started=false;
   if(index===scenes[kind].length){
    if(kind==='abertura'){
     openingTail=0;
     draw({image:'caminho',subtitle:'',fade:1});
    }else end();
   }
  }
 };
}
