import {createCampaign,LEVELS,ENEMY_TYPES,WEAPONS,ARMORS,BAL,potionPrice,potionHeal,METRICS,FINAL_ARENA,inFinalArena} from './game-core.js';
import {createUltimateRenderer} from './ultimate-visual.js';
import {createHeroVoice} from './hero-voice.js';
import {createStoryPlayer} from './story-scenes.js';
import {createMusicPlayer} from './music-player.js';
import {createEffects} from './sound-effects.js';
import {createBindings,ACTIONS} from './keybindings.js';
import {floorTrapBox,pitTrapBox} from './trap-geometry.js';
import {RUIN_FONT} from './font-data.js';
import {ART} from './art-metrics.js';
import {heroFrame} from './hero-animation.js';
import {enemyDrawing,isCommon} from './enemy-animation.js';
import {projectileVisual,hazardVisual,trapFireVisual,bossSlashVisual,particleVisual,sourceFamily,loopFrame} from './effect-visual.js';
import {HERO_DRAW,runFrame,enemyStrike,bounds,muzzle} from './combat-geometry.js';
import {DIVE_DURATION, DUST_HEIGHT, GUARD_HEAL_CAP, GUARD_TOTAL, guardCount, guardSceneProgress} from './devil-flight.js';
import {STAMINA_POTION} from './data.js';
const UI_FONT='Metal Mania';
// Revisão 49 com os serviços de desenho e entrada fornecidos pela camada web.
runOnStartup(runtime=>runtime.addEventListener('beforeprojectstart',async()=>{
 const face=await new FontFace(UI_FONT,Uint8Array.from(atob(RUIN_FONT),c=>c.charCodeAt(0))).load();
 document.fonts.add(face);startCampaign(runtime);
}));
function startCampaign(runtime){
 const O=runtime.objects,L=runtime.layout,S=2/3,Y=620-METRICS.ground*S;
 let storage;try{storage=globalThis.localStorage;}catch{storage=undefined;}
 const game=createCampaign({storage});
 runtime.campaign=game;
 const bindings=createBindings(storage);
 const rgb=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
 const ui=[],menu=[],overlay=[],world=[],actors=new Map(),dynamic=[];
 const add=(g,i)=>(g.push(i),i),show=(g,v)=>g.forEach(i=>i.isVisible=v);
 const clear=g=>{g.forEach(i=>i.destroy());g.length=0;};
 function sprite(type,layer,x,y,w,h,anim){
  const i=O[type].createInstance(layer,x,y);
  i.isVisible=true;
  if(anim)i.setAnimation(anim);
  if(type==='TextoUI')i.fontFace=UI_FONT;
  i.setSize(w,h);
  return i;
 }
 function rect(layer,x,y,w,h,color='#ffffff',alpha=1){const i=sprite('Forma',layer,x,y,w,h);i.colorRgb=rgb(color);i.opacity=alpha;return i;}
 function text(layer,x,y,w,h,str,size=12,color='#e8e1d3',align='left'){
  const i=sprite('TextoUI',layer,x,y,w,h);i.text=str;i.sizePt=Math.max(10,size);i.fontColor=rgb(color);i.horizontalAlign=align;return i;
 }
 function ornament(g,x,y,w,h,anim='painel',alpha=1){const i=add(g,sprite('Ornamento','Interface',x,y,w,h,anim));i.opacity=alpha;return i;}
 const initialHero=O.Heroi.getFirstInstance();
 for(const type of ['Cinzas','Sentinela','Inimigo','Terreno','Efeito','Armadilha','Pedra','Plataforma','Fundo','Nevoa','Forma','TextoUI','UltimaCena','UltimaFragmento'])for(const i of O[type].getAllInstances())i.destroy();
 const hero=initialHero;hero.isVisible=false;
 const backdrops=[];
 for(let n=-1;n<4;n++)backdrops.push(sprite('Fundo','Mundo',n*1280,0,1280,720,'bg-1'));
 const hallBackdrop=sprite('Fundo','Mundo',FINAL_ARENA.left*S-12,0,(METRICS.width-FINAL_ARENA.left)*S+24,720,'sala-usurpador');
 hallBackdrop.isVisible=false;
 const violetVeil=rect('Mundo',0,0,1280,720,'#251139',0);
 // Neblina em uma velocidade diferente do panorama; nenhuma torre artificial.
 const fogs=[];for(let n=0;n<5;n++){const i=sprite('Nevoa','Mundo',n*1100,455,1300,260);i.opacity=.075;fogs.push(i);}
 for(const i of [...backdrops,hallBackdrop,violetVeil,...fogs])i.moveAdjacentToInstance(hero,false);
 let gateBars,gateFront,gateLabel,stairsHint,exitGlow,exitBrazier,exitPrompt,lastHall=false;
 const gateWidth=264,gateHeight=440;
 const screenX=x=>x*S,screenY=y=>y*S+Y;
 const animation=(i,n)=>{if(i.animationName!==n)i.setAnimation(n)};
 function geometry(s,hall){
  clear(world);for(const a of actors.values())a.items.forEach(i=>i.destroy());actors.clear();
  gateBars=gateFront=gateLabel=stairsHint=null;
  for(const i of backdrops){animation(i,s.lv.bg);i.setSize(1280,720);i.colorRgb=[1,1,1];}
  const surfaces=hall?[]:[...s.solids.filter(p=>p.x>=-400&&p.y>=METRICS.ground-200&&p.w>0),...s.plats];
  for(const p of surfaces){
   const x=screenX(p.x),y=screenY(p.y),w=p.w*S,h=Math.min(170,p.h*S),tile=p.h<40?'tile':'floor';
   // Quadros recortados na textura original: repetição sem achatar pedras.
   const material='f'+(s.li+1)+'-';
   if(tile==='tile'){const i=add(world,sprite('Terreno','Mundo',x,y,w,18,material+'tile'+Math.round(w)));i.colorRgb=[1,1,1];}
   else for(let dx=0;dx<w;dx+=256){const piece=Math.min(256,w),px=x+Math.min(dx,Math.max(0,w-256));for(let dy=0;dy<h;dy+=100){const i=add(world,sprite('Terreno','Mundo',px,y+dy,piece,100,material+(dy===0?'floor':'body')+Math.round(piece)));i.colorRgb=[1,1,1];}}
  }
  // Perigo permanente dos fossos: a silhueta coincide com a altura de dano.
  for(const p of s.pits){const b=pitTrapBox(p,METRICS.ground);add(world,sprite('Armadilha','Mundo',screenX(b.x+b.w/2),screenY(b.base),b.w*S,b.h*S,'pit-'+p.w));}
  if(s.li!==FINAL_ARENA.level){
   gateBars=add(world,sprite('PortaoFerro','Mundo',screenX(s.gateX),620,gateWidth,gateHeight,'grade0'));
   add(world,sprite('PortaoFerro','Mundo',screenX(s.gateX),620,gateWidth,gateHeight,'arco'));
   gateFront=add(world,sprite('PortaoFerro','Mundo',screenX(s.gateX),620,gateWidth,gateHeight,'arco-frente'));
   gateLabel=add(world,text('Mundo',screenX(s.gateX)-150,137,300,40,'SELO DA ARENA',12,'#c8b8df','center'));
  }else if(!hall){
   const stairs=add(world,sprite('Fundo','Mundo',screenX(s.gateX)-8,620-FINAL_ARENA.stairsHeight,
    FINAL_ARENA.stairsWidth,FINAL_ARENA.stairsHeight,'escadaria-usurpador'));
   stairsHint=add(world,text('Mundo',stairs.x-92,stairs.y-24,396,42,'',13,'#efe4f8','center'));
  }
  const exitX=screenX(METRICS.exit), floorY=screenY(METRICS.ground);
  exitGlow=add(world,sprite('Brilho','Mundo',exitX,floorY-(hall?170:140),214,176));
  exitGlow.colorRgb=rgb(hall?'#f0ba52':'#b57aef');
  exitBrazier=add(world,sprite('BrasaPassagem','Mundo',exitX,floorY,hall?134:130,hall?213:175,hall?'chama-final':'idle'));
  exitBrazier.stopAnimation();
  exitPrompt=add(world,text('Mundo',exitX-145,632,290,35,'',12,'#d9b8ef','center'));
  for(const i of world)i.moveAdjacentToInstance(hero,false);
 }
  // Os quadros de linho deixam o cenário visível em volta de cada grupo.
  const art=(group,anim,x,y,w,h,opacity=1)=>{const i=add(group,sprite('ArteHUD','Interface',x,y,w,h));i.setAnimation(anim);i.opacity=opacity;return i;};
  function hudPanel(group,x,y,w,h,surface){
   return ornament(group,x,y,w,h,surface,.97);
  }
  function hudText(group,x,y,w,h,value,size=12,color='#eee6f0',align='left'){
   const label=add(group,text('Interface',x,y,w,h,value,size,color,align));
   label.verticalAlign='center';
   return label;
  }
  const hudOutline=value=>`[outlineback=#100b16]${value}[/outlineback]`;
  const heroPanel=hudPanel(ui,18,16,365,98,'hud-vida');
  const portrait=add(ui,sprite('Retrato','Interface',25,25,78,78));
  const portraitFrame=add(ui,sprite('MolduraRetrato','Interface',19,19,90,90));
  const hpWidth=241,stWidth=241;
  hudText(ui,122,24,130,21,'VIDA',12);
  const hpText=hudText(ui,255,24,108,21,'100 / 100',12,'#f8e1ef','right');
  add(ui,rect('Interface',121,48,243,12,'#72516b'));
  add(ui,rect('Interface',122,49,hpWidth,10,'#342438'));
  const hpbar=add(ui,rect('Interface',122,49,hpWidth,10,'#d5678e'));
  hudText(ui,122,65,210,19,'ESTAMINA',11,'#bde1db');
  add(ui,rect('Interface',121,87,243,9,'#567871'));
  add(ui,rect('Interface',122,88,stWidth,7,'#26363b'));
  const stbar=add(ui,rect('Interface',122,88,stWidth,7,'#87c2b4'));
  const vigorIcon=ornament(ui,402,29,42,43,'vigor-frasco');
  const vigorTime=hudText(ui,389,75,68,25,'',15,'#d1efd9','center');
  const flaskKey=hudText(ui,20,125,48,24,'H',12,'#f2e7f9','center');
  const flask=hudText(ui,72,121,198,32,hudOutline('VIDA ×2 · ESTAMINA ×0'),11,'#e2d4ee');
  hudPanel(ui,898,16,364,104,'hud-fase');
  const inventory=hudText(ui,916,25,327,29,'0 OURO',18,'#e9d4fc','right');
  ornament(ui,919,57,326,6,'menu-divisoria',.74);
  const phaseTitle=hudText(ui,907,65,336,24,'Fase 1 · Portões da Cinza',14,'#f1e6f9','right');
  const objective=hudText(ui,910,89,333,23,'Criaturas: 0 / 4 · Arena selada',11,'#d1c0df','right');
  const noticeHud=[];
  hudPanel(noticeHud,311,129,658,35,'hud-linho');
  const notice=hudText(noticeHud,320,129,640,35,'',12,'#efe2f8','center');
  ui.push(...noticeHud);
  const bossHud=[];
  const bossTitle=hudText(bossHud,356,621,568,27,hudOutline('SENTINELA DA PORTA'),14,'#f0e2fb','center');
  const bossBar=add(bossHud,rect('Interface',357,652,566,8,'#c1647b'));
  const bossHeal=add(bossHud,rect('Interface',357,652,1,8,'#79b88d',0));
  const bossHealPulse=add(bossHud,sprite('Brilho','Interface',357,656,27,25));
  bossHealPulse.colorRgb=rgb('#8bf0a8');
  ui.push(...bossHud);
  const ability=[];
  for(const [n,key,label,anim] of [[0,'Q','Aparar','aparo'],[1,'E','Avanço','avanco']]){
    const x=18+n*111;
    const frame=hudPanel(ui,x,622,102,79,'hud-habilidade');
    const glow=add(ui,sprite('Brilho','Interface',x+36,650,68,68));glow.colorRgb=rgb('#b674ed');glow.opacity=.03;
    const icon=art(ui,anim,x+9,626,48,48);
    const keyPlate=ornament(ui,x+56,637,40,25,'menu-foco');
    const keyText=hudText(ui,x+56,637,40,25,key,14,'#f4e9fa','center');
    const sub=hudText(ui,x+5,673,92,23,label,12,'#dfcbed','center');
    ability.push({key:keyText,sub,icon,glow,frame,keyPlate});
  }
  // Tipo separado: todos os estados têm o mesmo quadro, impedindo mudança de escala.
  function bladeArt(anim){const i=add(ui,sprite('EspadaUI','Interface',1184,360,60,224));i.setAnimation(anim);i.setSize(60,224);return i;}
  const swordGlow=add(ui,sprite('Brilho','Interface',1214,452,136,254));swordGlow.colorRgb=rgb('#a64af5');
  const swordInnerGlow=add(ui,sprite('Brilho','Interface',1214,451,57,191));swordInnerGlow.colorRgb=rgb('#c582ff');
  const violetFlames=[];
  for(const side of [-1,1])for(let n=0;n<7;n++){
    const i=add(ui,sprite('ChamaVioleta','Interface',1214+side*11,393+n*20,side*8,20));
    violetFlames.push({i,side,n});
  }
  const swordBase=bladeArt('espada');swordBase.colorRgb=[.58,.58,.63];
  const swordFill=bladeArt('carga0');
  const bladeCoreGlow=add(ui,sprite('Brilho','Interface',1214,449,18,163));bladeCoreGlow.colorRgb=rgb('#deb1ff');
  const rKey=hudText(ui,1187,598,54,29,'R',16,'#e6cafa','center');
  const controls=hudText(ui,250,684,880,25,'A / D mover  ·  ESPAÇO saltar  ·  J / CLIQUE atacar  ·  SHIFT esquivar  ·  H frasco  ·  ESC pausa',10,'#dacbe6','center');

 const menuInk={
  light:'#eee6f0',selected:'#fbf2ff',normal:'#e2d7e8',muted:'#c5b7cf',
  disabled:'#a69aaf',accent:'#d5bde9',line:'#8d75a5',track:'#63546f',
  equipped:'#e7d2fa',backdrop:'#151219',shadow:'#0c0910',
 };
 function menuText(group,x,y,w,h,value,size=12,color=menuInk.normal,align='left'){
  const label=add(group,text('Interface',x,y,w,h,value,size,color,align));
  label.verticalAlign='center';
  return label;
 }
 function menuRule(group,x,y,w){
  ornament(group,x,y,w,7,'menu-divisoria');
 }
 function menuFrame(group,x,y,w,h){
  add(group,rect('Interface',x+5,y+7,w,h,menuInk.shadow,.64));
  add(group,rect('Interface',x,y,w,h,menuInk.line));
  ornament(group,x+2,y+2,w-4,h-4,'menu-linho');
  for(const left of [x,x+w-14])for(const top of [y,y+h-2]){
   add(group,rect('Interface',left,top,14,2,menuInk.accent));
  }
 }
 function menuScreen(group,x,y,w,h,shade=.9){
  add(group,rect('Interface',0,0,1280,720,menuInk.backdrop,shade));
  menuFrame(group,x,y,w,h);
 }
 function menuHeading(group,title,y,w=1120){
  menuText(group,(1280-w)/2,y,w,48,title,30,menuInk.light,'center');
  menuRule(group,475,y+49,330);
 }

 add(menu,sprite('MenuArte','Interface',0,0,1280,720));
 const logo=add(menu,sprite('TituloEspada','Interface',72,79,548,274));
 const menuRows=[],buttons=[];let selected=0,menuPage='root',pointer=null,lastScreen='',lastState=null,time=0,flashHint='',shopHint=null;
 const startNewCampaign=()=>{menuPage='root';game.newGame();};
 let pausePage='root';
 let bindingCapture=null,bindingStatus='',bindingStatusText=null;const controlRows=[],blockedCodes=new Set();
 const volumeRows=[];
 const volumeTrack={x:622,width:397};
 const muteControl={x:1096,width:44};
 let volumeDrag=null;
 let slotMode=null,slotOrigin='menu',slotConfirm=null,slotStatus='';
 const openControls=()=>{if(runtime.touch?.enabled)runtime.touch.openEditor();else{menuPage='controls';lastScreen='';}};
 function button(g,x,y,w,h,label,action,{size=14,dim=false,align='center'}={}){
  const panel=ornament(g,x,y,w,h,'menu-botao');
  const inset=align==='left'?27:12;
  const labelText=menuText(g,x+inset,y,w-inset-12,h,label,size,menuInk.normal,align);
  const mark=ornament(g,x+7,y+(h-9)/2,9,9,'menu-marca');
  const b={x,y,w,h,action:dim?undefined:action,panel,label:labelText,mark,dim};
  buttons.push(b);
  return b;
 }
 function paintButtons(){
  buttons.forEach((b,n)=>{
   const focused=n===selected;
   const look=b.dim?'menu-desativado':focused?'menu-foco':'menu-botao';
   if(b.panel.animationName!==look){animation(b.panel,look);b.panel.setSize(b.w,b.h);}
   b.mark.isVisible=focused;
   b.mark.opacity=b.dim?.49:1;
   b.label.fontColor=rgb(b.dim?menuInk.disabled:focused?menuInk.selected:menuInk.normal);
  });
 }
 function selectButton(index){
  if(index!==selected){selected=index;paintButtons();}
 }
 function buildMenu(){
  clear(menuRows);buttons.length=0;selected=0;
  controlRows.length=0;bindingStatusText=null;
  if(menuPage==='root'){
   const entries=[['CONTINUAR',()=>game.continueGame(),!game.hasSave],['CARREGAR',()=>openSlots('load')],['NOVA VIGÍLIA',()=>{if(game.hasSave){menuPage='confirm';lastScreen='';}else startNewCampaign();}],['ÁUDIO',()=>{menuPage='audio';lastScreen='';}],['CONTROLES',openControls],['CRÉDITOS',()=>{menuPage='credits';lastScreen='';}]];
   entries.forEach(([label,act,dim],n)=>button(menuRows,78,372+n*42,480,38,label,act,{size:18,dim,align:'left'}));
   selected=game.hasSave?0:2;
   menuText(menuRows,81,638,475,26,'Entre nas ruínas. A última lâmina ainda resiste.',10,menuInk.muted);
  }else if(menuPage==='audio'){
   buildAudio(menuRows,()=>{menuPage='root';});
  }else if(menuPage==='confirm'){
   menuScreen(menuRows,225,202,830,312,.72);
   menuHeading(menuRows,'RECOMEÇAR A VIGÍLIA?',240,760);
   menuText(menuRows,279,315,722,48,'O progresso desta campanha será substituído.',14,menuInk.muted,'center');
   button(menuRows,280,414,340,52,'RECOMEÇAR',startNewCampaign);
   button(menuRows,660,414,340,52,'VOLTAR',()=>{menuPage='root';lastScreen='';});
   selected=1;
  }else if(menuPage==='controls'){
   menuScreen(menuRows,42,22,1196,676,1);
   menuHeading(menuRows,'CONTROLES',34);
   menuText(menuRows,92,94,1096,28,'Escolha uma tecla à esquerda. Em seguida, pressione a nova tecla ou clique. Esc cancela a captura.',12,menuInk.muted,'center');
   menuText(menuRows,94,126,306,27,'TECLA(S)',11,menuInk.accent,'center');
   menuText(menuRows,430,126,750,27,'AÇÃO',11,menuInk.accent);
   ACTIONS.forEach((a,n)=>{
    const y=158+n*32;
    const b=button(menuRows,94,y,306,29,bindings.label(a.id),()=>{bindingCapture=a.id;bindingStatus='';refreshControlRows();},{size:11});
    const desc=menuText(menuRows,430,y,750,29,a.name,12);
    controlRows.push({action:a,button:b,desc});
   });
   bindingStatusText=menuText(menuRows,92,580,1096,34,bindingStatus||'Se a tecla já estiver em uso, as duas ações trocam de tecla.',11,menuInk.muted,'center');
   button(menuRows,110,628,465,46,'RESTAURAR PADRÃO',()=>{bindings.reset();bindingCapture=null;bindingStatus='Controles padrão restaurados.';refreshControlRows();},{size:16});
   button(menuRows,705,628,465,46,'VOLTAR',()=>{bindingCapture=null;bindingStatus='';menuPage='root';lastScreen='';},{size:16});
   refreshControlRows();
  }else{
   buildCredits(menuRows,'VOLTAR',()=>{menuPage='root';lastScreen='';});
  }
 }
 function buildCredits(group,label,back){
  menuScreen(group,198,79,884,562,.75);
  menuHeading(group,'CRÉDITOS',104);
  const body='Última Vigília · Gustavo Zavon Pestana\nPersonagens e cenários: Rosebud\nCampanha, combate e interface nativos do Construct 3\nVoz da protagonista gerada com ElevenLabs\n\nTrilhas do menu, das dez fases e do chefe final: migfus20\nopengameart.org/users/migfus20\n\nEscudos e lâminas: StarNinjas · CC0\nopengameart.org/users/starninjas\nSons da ultimate: arquivos fornecidos por Gustavo\n\nInspirações: Acheron e Blade (Honkai Star Rail)';
  const credits=menuText(group,226,170,828,371,body,13,menuInk.normal,'center');
  credits.lineHeight=3;
  button(group,465,560,350,47,label,back);
 }
 function returnFromCredits(){game.menu();menuPage='root';}
 function buildAudio(group,back){
  menuScreen(group,115,94,1050,560,.78);
  menuHeading(group,'ÁUDIO',145);
  for(const [index,[channel,label]]of [['master','VOLUME GERAL'],['voice','VOZ DA PERSONAGEM'],['music','MÚSICA'],['effects','EFEITOS SONOROS']].entries()){
   const y=238+index*78;
   button(group,181,y,960,58,label,undefined,{align:'left',size:15});
   const value=menuText(group,1038,y,52,58,'',12,menuInk.light,'right');
   const {x,width}=volumeTrack;
   add(group,rect('Interface',x,y+26,width,6,menuInk.track));
   const fill=add(group,rect('Interface',x,y+26,.01,6,menuInk.accent));
   const handle=ornament(group,x,y+21,16,16,'menu-marca');
   const speaker=ornament(group,muteControl.x+8,y+15,28,28,'audio-volume-on');
   volumeRows.push({channel,y,value,fill,handle,speaker});
  }
  updateVolumeRows();
  button(group,475,548,330,49,'VOLTAR',back,{size:16});
  menuText(group,280,607,720,27,'Setas ajustam · Enter silencia ou reativa · Esc volta',11,menuInk.muted,'center');
 }
 function updateVolumeRows(){
  for(const row of volumeRows){
   const level=game.settings[row.channel];
   const muted=game.settings.muted[row.channel];
   row.value.text=`${Math.round(level*100)}%`;
   row.fill.width=Math.max(.01,volumeTrack.width*level);
   row.handle.setPosition(volumeTrack.x+volumeTrack.width*level-8,row.y+21);
   row.fill.opacity=row.handle.opacity=muted ? .38 : 1;
   animation(row.speaker,muted?'audio-volume-off':'audio-volume-on');
   row.speaker.setSize(28,28);
  }
 }
 function adjustVolume(row,level){
  game.setVolume(row.channel,level);
  updateVolumeRows();
 }
 function toggleMute(row){
  game.toggleMute(row.channel);
  updateVolumeRows();
 }
 function refreshControlRows(){
  for(const [n,row]of controlRows.entries()){
   row.button.label.text=bindings.label(row.action.id);
   row.desc.text=bindingCapture===row.action.id?'Pressione a tecla que deseja':row.action.name;
   row.desc.fontColor=rgb(bindingCapture===row.action.id?menuInk.accent:menuInk.normal);
   if(bindingCapture===row.action.id)selected=n;
  }
  if(bindingStatusText)bindingStatusText.text=bindingStatus||'Se a tecla já estiver em uso, as duas ações trocam de tecla.';
  paintButtons();
 }
 function captureBinding(code){
  const result=bindings.assign(bindingCapture,code);bindingStatus=result.message;
  if(result.ok)bindingCapture=null;
  keys.clear();pressed.clear();blockedCodes.add(code);refreshControlRows();
 }
 function openSlots(kind){slotOrigin=game.mode==='paused'?'paused':'menu';slotMode=kind;slotConfirm=null;slotStatus='';lastScreen='';}
 function closeSlots(){if(slotConfirm!==null)slotConfirm=null;else{slotMode=null;slotStatus='';}lastScreen='';}
 function performSlot(index,confirmed=false){
  const result=slotMode==='save'?game.saveSlot(index,confirmed):game.loadSlot(index);
  if(result.needsConfirmation){slotConfirm=index;lastScreen='';return;}
  slotStatus=result.message;
  if(result.ok&&slotMode==='load'){slotMode=null;slotConfirm=null;menuPage='root';}
  else if(result.ok)slotConfirm=null;
  else slotConfirm=null;
  lastScreen='';
 }
 function chooseSlot(index){
  const info=game.listSlots()[index];
  if(slotMode==='save'&&info.occupied||slotMode==='load'&&slotOrigin==='paused'){slotConfirm=index;lastScreen='';return;}
  performSlot(index);
 }
 function slotDate(date){try{return new Date(date).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return '';}}
 function buildSlotPanel(){
  clear(overlay);buttons.length=0;selected=0;
  menuScreen(overlay,26,18,1228,684,1);
  menuHeading(overlay,slotMode==='save'?'SALVAR VIGÍLIA':'CARREGAR VIGÍLIA',33);
  menuText(overlay,80,94,1120,30,slotMode==='save'?'Escolha uma memória. A aventura permanece pausada.':'Escolha uma memória para retomar a aventura.',12,menuInk.muted,'center');
  const slots=game.listSlots();
  slots.forEach((info,n)=>{
   const x=66+(n%2)*610,y=140+Math.floor(n/2)*96,dim=info.unavailable||slotMode==='load'&&!info.valid;
   const b=button(overlay,x,y,548,88,'MEMÓRIA '+String(n+1).padStart(2,'0'),()=>chooseSlot(n),{size:14,dim,align:'left'});
   b.label.setPosition(x+28,y+6);b.label.setSize(494,27);
   const description=!info.occupied?'ESPAÇO VAZIO':!info.valid?'DADOS NÃO DISPONÍVEIS':info.screen==='ending'?'CAMPANHA CONCLUÍDA':info.screen==='shop'?'REFÚGIO DAS CINZAS':`Fase ${info.phase} · ${info.phaseName}`;
   b.detail=description+(info.valid?` · VIDA ${Math.ceil(info.hp)} / ${info.maxHp} · OURO ${info.gold} · ${slotDate(info.savedAt)}`:'');
   menuText(overlay,x+28,y+34,494,23,description,12,info.valid?menuInk.normal:menuInk.disabled);
   if(info.valid){
    menuText(overlay,x+28,y+58,290,23,`VIDA ${Math.ceil(info.hp)} / ${info.maxHp} · OURO ${info.gold}`,10,menuInk.accent);
    menuText(overlay,x+322,y+58,199,23,slotDate(info.savedAt),10,menuInk.muted,'right');
   }else if(info.unavailable){
    menuText(overlay,x+28,y+58,495,23,'Armazenamento indisponível.',10,menuInk.disabled);
   }
  });
  menuText(overlay,75,618,1130,28,slotStatus||'As dez memórias são guardadas neste navegador.',11,slotStatus?menuInk.accent:menuInk.muted,'center');
  button(overlay,440,657,400,38,'VOLTAR',closeSlots,{size:17});
  selected=slotMode==='save'?Math.max(0,slots.findIndex(s=>!s.occupied&&!s.unavailable)):slots.findIndex(s=>s.valid);
  if(selected<0)selected=10;
  if(slotConfirm!==null){
   buttons.length=0;selected=1;
   menuScreen(overlay,231,207,818,306,.8);
   const id=String(slotConfirm+1).padStart(2,'0');
   menuHeading(overlay,slotMode==='save'?`SUBSTITUIR MEMÓRIA ${id}?`:`CARREGAR MEMÓRIA ${id}?`,235,772);
   menuText(overlay,294,306,692,68,slotMode==='save'?'A vigília guardada neste espaço será substituída pelo estado atual.':'A aventura atual será substituída pela memória escolhida.',13,menuInk.muted,'center');
   button(overlay,295,421,320,55,slotMode==='save'?'SALVAR':'CARREGAR',()=>performSlot(slotConfirm,true),{size:18});
   button(overlay,665,421,320,55,'CANCELAR',closeSlots,{size:18});
  }
 }
 function buildShop(){
  clear(overlay);buttons.length=0;selected=0;
  menuScreen(overlay,28,20,1224,676,.94);
  menuHeading(overlay,'O REFÚGIO DAS CINZAS',39);
  menuText(overlay,60,99,1160,36,`${game.save.gold} OURO · NÍVEL DA LOJA ${game.save.maxCleared} · VIDA ${Math.ceil(game.save.hp)} / ${game.stats().maxHp}`,13,menuInk.accent,'center');
  for(const [col,kind,list,owned,equipped] of [[0,'W',WEAPONS,game.save.ownedW,game.save.weapon],[1,'A',ARMORS,game.save.ownedA,game.save.armor]]){
   const x=52+col*594;
   add(overlay,rect('Interface',x,144,570,34,menuInk.shadow,.65));
   menuText(overlay,x+18,144,230,34,col?'ARMADURAS':'LÂMINAS',15,menuInk.light);
   menuText(overlay,x+246,144,189,34,'ATRIBUTOS',10,menuInk.muted,'right');
   menuText(overlay,x+444,144,110,34,'ESTADO / PREÇO',10,menuInk.muted,'right');
   list.forEach((it,n)=>{
    const locked=n>game.save.maxCleared,eq=equipped===n,own=owned.includes(n),label=eq?'EQUIPADA':own?'EQUIPAR':locked?`NÍVEL ${n}`:`${it.price} OURO`;
    const y=181+n*26;
    const b=button(overlay,x,y,570,25,it.name,()=>{if(game.buy(kind,n))lastScreen='';else flashHint='Ouro insuficiente.';},{size:11,dim:locked,align:'left'});
    b.detail=(kind==='W'?`LÂMINA · DANO ${it.dmg}`:`ARMADURA · +${it.hp} VIDA · ${Math.round(it.def*100)}% DEF`)+` · ${label}`;
    b.label.setSize(222,25);
    menuText(overlay,x+248,y,187,25,kind==='W'?`DANO ${it.dmg}`:`+${it.hp} VIDA · ${Math.round(it.def*100)}% DEF`,10,locked?menuInk.disabled:menuInk.muted,'right');
    menuText(overlay,x+438,y,116,25,label,10,eq?menuInk.equipped:locked?menuInk.disabled:menuInk.accent,'right');
   });
  }
  for(const [n,kind,title,key]of [[0,'hp','VIDA','potHp'],[1,'st','ESTAMINA','potSt']]){
   const price=potionPrice(kind,game.save.maxCleared),count=game.save[key];
   const effect=kind==='hp'?'+'+potionHeal(kind,game.save.maxCleared):`REGEN. ×${STAMINA_POTION.multiplier} POR ${STAMINA_POTION.duration/60} MIN`;
   const label=`FRASCO DE ${title} · ${effect} · ${price} OURO · ${count}/5`;
   button(overlay,125+n*525,486,505,48,label,()=>{if(game.buyPotion(kind))lastScreen='';else flashHint=count>=5?'Você já carrega cinco frascos.':'Ouro insuficiente.';},{size:12});
  }
  const next=Math.min(game.save.maxCleared,9);
  button(overlay,65,558,715,54,`PRÓXIMA · ${next+1}. ${LEVELS[next].name}`,()=>game.next(),{size:18});
  button(overlay,795,558,208,54,'REPETIR FASE',()=>game.start(game.state?.li??Math.max(0,next-1)),{size:13});
  button(overlay,1017,558,198,54,'MENU',()=>{game.menu();menuPage='root';});
  shopHint=menuText(overlay,75,614,1130,28,'',11,menuInk.accent,'center');
  menuText(overlay,75,642,1130,28,'Use as setas ou Tab para selecionar e Enter ou clique para confirmar. A compra equipa o item na hora.',10,menuInk.muted,'center');
 }
 function buildOverlay(mode){
  clear(overlay);buttons.length=0;selected=0;
  if(mode==='epilogueBlack'||mode==='credits'){
   add(overlay,rect('Interface',0,0,1280,720,'#000000'));
   if(mode==='credits')buildCredits(overlay,'MENU PRINCIPAL',returnFromCredits);
   return;
  }
  if(mode==='paused'){
   buildPauseMenu();
   return;
  }
  if(mode==='finalPrompt'){
   menuScreen(overlay,309,214,662,296,.56);
   menuHeading(overlay,'Tem certeza?',239,624);
   menuText(overlay,337,313,606,51,'A escadaria leva ao Salão do Usurpador.',14,menuInk.muted,'center');
   button(overlay,354,408,264,53,'SUBIR',()=>game.confirmFinalArena(true),{size:17});
   button(overlay,662,408,264,53,'VOLTAR',()=>game.confirmFinalArena(false),{size:17});
   selected=1;
   return;
  }
  menuScreen(overlay,258,174,764,423,.78);
  const title=mode==='dead'?'A CHAMA SE APAGA':'A CHAMA RETORNOU';
  menuHeading(overlay,title,221,725);
  const st=game.save.stats;
  const desc=mode==='dead'?'Seu ouro foi mantido. A vigília recomeça com vida cheia.':`Dez guardiões caíram. A última cidade volta a respirar.\n${st.kills} derrotados · ${st.deaths} quedas · ${st.parries} aparos perfeitos`;
  menuText(overlay,320,309,640,86,desc,13,menuInk.muted,'center');
  if(mode==='dead')button(overlay,345,421,590,54,'REERGUER-SE',()=>game.retry(),{size:18});
  else button(overlay,345,421,590,54,'REFÚGIO · EQUIPAMENTOS FINAIS',()=>game.shop(),{size:17});
  button(overlay,345,532,590,44,'MENU PRINCIPAL',()=>{game.menu();menuPage='root';});
 }
 function buildPauseMenu(){
  const back=()=>{pausePage='root';};
  if(pausePage==='audio'){
   buildAudio(overlay,back);
   return;
  }
  if(pausePage==='phases'){
   menuScreen(overlay,50,46,1180,622,.85);
   menuHeading(overlay,'AS DEZ FASES',78);
   menuText(overlay,100,145,1080,36,'Escolha uma fase desbloqueada para começar pela entrada.',12,menuInk.muted,'center');
   const unlocked=Math.min(game.save.maxCleared,LEVELS.length-1);
   LEVELS.forEach((level,index)=>{
    const locked=index>unlocked;
    const x=88+(index%2)*563,y=203+Math.floor(index/2)*70;
    button(overlay,x,y,542,54,`${index+1} · ${level.name}${locked?' · SELADA':''}`,()=>game.start(index),{size:13,dim:locked,align:'left'});
   });
   selected=buttons.length;
   button(overlay,475,586,330,49,'VOLTAR',back,{size:16});
   return;
  }
  menuScreen(overlay,295,117,690,540,.67);
  menuHeading(overlay,'A VIGÍLIA AGUARDA',165,670);
  menuText(overlay,320,232,640,37,'A chama ainda resiste.',13,menuInk.muted,'center');
  const actions=[
   ['CONTINUAR',()=>game.resume()],
   ['SALVAR',()=>openSlots('save')],
   ['CARREGAR',()=>openSlots('load')],
   ['ÁUDIO',()=>{pausePage='audio';}],
   ['AS DEZ FASES',()=>{pausePage='phases';}],
   ['REINICIAR FASE',()=>game.retry()],
   ['MENU PRINCIPAL',()=>{game.menu();menuPage='root';}],
  ];
  if(runtime.touch?.enabled)actions.splice(4,0,['CONTROLES',openControls]);
  actions.forEach(([label,action],n)=>button(overlay,345,290+n*47,590,42,label,action,{size:17}));
 }
 function rebuildScreen(){
  if(game.mode!=='paused')pausePage='root';
  const page=game.mode==='menu'?menuPage:game.mode==='paused'?pausePage:'';
  const screen=slotMode?'slots:'+slotMode+':'+slotConfirm:game.mode+':'+page;
  if(screen===lastScreen)return;lastScreen=screen;flashHint='';shopHint=null;
  volumeRows.length=0;volumeDrag=null;
  show(menu,game.mode==='menu'&&menuPage!=='controls'&&!slotMode);show(menuRows,false);show(overlay,false);buttons.length=0;
  logo.isVisible=game.mode==='menu'&&menuPage==='root'&&!slotMode;
  if(slotMode){clear(menuRows);buildSlotPanel();show(overlay,true);}
  else if(game.mode==='menu'){clear(overlay);buildMenu();show(menuRows,true);}
  else{clear(menuRows);if(game.mode==='shop')buildShop();else if(['paused','dead','ending','finalPrompt','epilogueBlack','credits'].includes(game.mode))buildOverlay(game.mode);else clear(overlay);}
  paintButtons();
 }
 const keys=new Set(),pressed=new Set();let clickInteract=false,pendingAction=null;
 let audioContext=null;
 const getAudioContext=()=>audioContext??=new AudioContext();
 const heroVoice=createHeroVoice(runtime,getAudioContext);
 const music=createMusicPlayer(runtime,getAudioContext);
 const effects=createEffects(runtime,getAudioContext,METRICS.exit);
 runtime.addEventListener('touchgesture',()=>{heroVoice.unlock();music.unlock();effects.unlock();});
 runtime.addEventListener('touchreset',()=>{keys.clear();pressed.clear();clickInteract=false;});
 const point=e=>L.getLayer('Interface').cssPxToLayer(e.clientX,e.clientY);
 const hit=(x,y)=>buttons.findIndex(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
 runtime.addEventListener('keydown',e=>{
  if(runtime.touch?.enabled&&document.activeElement?.matches?.('#touch-ui input'))return;
  if(blockedCodes.has(e.code)||e.repeat)return;
  heroVoice.unlock();music.unlock();effects.unlock();
  if(game.mode==='menu'&&menuPage==='controls'&&bindingCapture){
   e.preventDefault?.();
   if(e.code==='Escape'){bindingCapture=null;bindingStatus='Alteração cancelada.';keys.clear();pressed.clear();blockedCodes.add(e.code);refreshControlRows();}
   else captureBinding(e.code);
   return;
  }
  if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);
 });
 runtime.addEventListener('keyup',e=>{keys.delete(e.code);blockedCodes.delete(e.code);});
 runtime.addEventListener('pointermove',e=>{
  pointer=point(e);
  if(volumeDrag&&volumeDrag.id===e.pointerId){adjustVolume(volumeDrag.row,(pointer[0]-volumeTrack.x)/volumeTrack.width);return;}
  if(game.mode!=='play'&&!bindingCapture){const n=hit(...pointer);if(n>=0)selectButton(n);}
 });
 runtime.addEventListener('pointerdown',e=>{if(e.button===0||e.pointerType==='touch'){
  heroVoice.unlock();music.unlock();effects.unlock();
  if(game.mode==='menu'&&menuPage==='controls'&&bindingCapture){captureBinding('Mouse0');return;}
  if(game.mode==='play'){
   if(runtime.touch?.enabled&&e.pointerType==='touch')return;
   const [x,y]=L.getLayer('Mundo').cssPxToLayer(e.clientX,e.clientY);
   const atBrazier=exitBrazier?.isVisible&&game.canUseBrazier()&&
    Math.abs(x-exitBrazier.x)<=exitBrazier.width/2&&y>=exitBrazier.y-exitBrazier.height&&y<=exitBrazier.y;
   if(atBrazier){clickInteract=true;return;}
   pressed.add('Mouse0');keys.add('Mouse0');
  }
  else{
   const [x,y]=point(e),n=hit(x,y);
   if(n<0)return;
   selectButton(n);
   const row=volumeRows[n];
   if(row){
    if(x>=muteControl.x&&x<=muteControl.x+muteControl.width)toggleMute(row);
    else if(x>=volumeTrack.x-9&&x<=volumeTrack.x+volumeTrack.width+9){
     volumeDrag={row,id:e.pointerId};
     adjustVolume(row,(x-volumeTrack.x)/volumeTrack.width);
    }
   }else pendingAction=buttons[n].action;
  }
 }});
 function releasePointer(e){
  keys.delete('Mouse0');blockedCodes.delete('Mouse0');
  if(volumeDrag?.id===e.pointerId)volumeDrag=null;
 }
 runtime.addEventListener('pointerup',releasePointer);
 runtime.addEventListener('pointercancel',releasePointer);
 let storySuspended=false;
 runtime.addEventListener('suspend',()=>{keys.clear();pressed.clear();blockedCodes.clear();bindingCapture=null;volumeDrag=null;clickInteract=false;refreshControlRows();game.saveNow();game.pause();syncAudio();storySuspended=true;heroVoice.setSuspended(true);music.setSuspended(true);effects.setSuspended(true);});
 runtime.addEventListener('resume',()=>{storySuspended=false;heroVoice.setSuspended(false);music.setSuspended(false);effects.setSuspended(false);});
 function syncAudio(){
  const {settings}=game;
  const gain=channel=>settings.muted[channel]?0:settings[channel];
  const master=gain('master');
  const volumes={master,music:gain('music'),effects:gain('effects')};
  heroVoice.sync(game.state,game.mode==='finalPrompt'?'paused':game.mode,master*gain('voice'));
  music.sync(game.state,game.mode,volumes);
  effects.sync(game.state,game.mode,volumes);
 }
 function sound(event){
  if(event.voice)heroVoice.play(event.voice);
  else effects.play(event.name,event.volume,event.x);
 }
 function makeActor(e){
  const i=sprite('Inimigo','Mundo',screenX(e.x),screenY(e.y),360,320,e.type),items=[i];
  const back=rect('Mundo',0,0,64,5,'#251827'),fill=rect('Mundo',0,0,62,3,'#ac476f'),warning=text('Mundo',0,0,40,36,'!',21,'#eed58c','center');items.push(back,fill,warning);
  const strike=sprite('Efeito','Mundo',0,0,140,140,'slash-steel');strike.colorRgb=rgb('#c4a4f7');items.push(strike);
  const aura=sprite('Efeito','Mundo',0,0,64,64,'orb-void');aura.colorRgb=rgb('#a562dc');items.push(aura);
  const a={i,items,back,fill,warning,strike,aura};actors.set(e,a);return a;
 }
 const pools={};
 function pooled(key,type,index){const pool=pools[key]??(pools[key]=[]);if(!pool[index])pool[index]=sprite(type,'Mundo',0,0,10,10);const i=pool[index];i.isVisible=true;return i;}
 function hidePools(){for(const pool of Object.values(pools))for(const i of pool)if(i)i.isVisible=false;}
 const ultimateCinema=createUltimateRenderer(runtime);
 const worldFlash=add(ui,rect('Interface',0,0,1280,720,'#d9b3ff',0));
 const storyItems=[];
 let storyImage,subtitleShade,subtitle,skip;
 function drawStory(shot){
  if(!shot){clear(storyItems);return;}
  if(!storyItems.length){
   add(storyItems,rect('Interface',0,0,1280,720,'#000000'));
   storyImage=add(storyItems,sprite('UltimaCena','Interface',640,360,1280,720));
   storyImage.stopAnimation();
   subtitleShade=add(storyItems,rect('Interface',92,588,1096,65,menuInk.shadow,.82));
   subtitle=add(storyItems,text('Interface',109,588,1062,65,'',23,menuInk.selected,'center'));
   subtitle.verticalAlign='center';
   skip=add(storyItems,text('Interface',800,669,434,37,'ESPAÇO  ·  PULAR',13,menuInk.muted,'right'));
   skip.verticalAlign='center';
  }
  skip.isVisible=storyImage.isVisible=!!shot.image;
  if(shot.image){animation(storyImage,'historia-'+shot.image);storyImage.setSize(1280,720);storyImage.opacity=shot.fade;}
  subtitleShade.isVisible=!!(shot.image&&shot.subtitle);
  subtitle.text=shot.subtitle;
 }
 const updateStory=createStoryPlayer(heroVoice,drawStory,()=>{
  game.finishStory();
  syncAudio();
 });
 function drawFinalFight(s,actor){
  const boss=s.boss,c=s.finalShift,f=boss?.flight;
  const guardScene=guardSceneProgress(boss);
  if((c||guardScene!==null)&&actor){
   const p=c?Math.min(1,c.t/c.duration):guardScene;
   const dark=Math.min(1,p/.28)*(1-Math.max(0,(p-.73)/.27));
   const shade=pooled('finalShift','Forma',0);
   shade.setPosition(screenX(s.cam)-48,-12);
   shade.setSize(1376,744);
   shade.colorRgb=rgb('#0c070c');
   shade.opacity=.83*dark;
   shade.moveAdjacentToInstance(hero,false);
   hero.colorRgb=[1-.56*dark,1-.63*dark,1-.58*dark];
   const warm=boss.revealing?1:guardScene!==null?.8:.46;
   actor.i.colorRgb=[1-.19*dark,1-.52*dark,1-.60*dark];
   const light=pooled('finalCracks','Brilho',0);
   light.setPosition(screenX(boss.x)+(boss.face>0?33:-33),guardScene!==null?screenY(boss.y-320):boss.revealing?356:391);
   const span=boss.revealing?220:102+(p*.26)*100;
   light.setSize(span,span);
   light.colorRgb=rgb(guardScene!==null?'#f7b577':'#ff9b53');
   light.opacity=(game.settings.reduceFlash?.43:.66)*warm*dark;
   light.moveAdjacentToInstance(actor.i,true);
  }
  if(!f||!['aim','dive','warning','drop'].includes(f.stage))return;
  const warning=f.kind==='guard';
  const mark=pooled('finalShadow','Efeito',0);
  animation(mark,'sombra-alada');
  mark.stopAnimation();
  mark.setPosition(screenX(f.target),621);
  const scale=warning?Math.min(1,f.stage==='drop'?1:f.t/.95):.65;
  mark.setSize((warning?224:140)*(1+scale),30+scale*16);
  mark.colorRgb=rgb(f.kind==='gust'?'#db9b7c':'#e8a06b');
  mark.opacity=.47+.32*scale;
  mark.moveAdjacentToInstance(hero,false);
 }
 function render(s,dt){
  hidePools();const playing=game.mode==='play';
  const hudVisible=!!s&&!['menu','shop','ending','story','epilogueBlack','credits'].includes(game.mode)&&!slotMode;
  show(ui,hudVisible);
  hero.isVisible=!!s&&game.mode!=='menu';
  if(!s){ultimateCinema.render(null);L.scrollX=640;L.scrollY=360;return;}
  const hall=!!inFinalArena(s);
  if(s!==lastState||hall!==lastHall){geometry(s,hall);lastState=s;lastHall=hall;}
  hallBackdrop.isVisible=hall;
  show(backdrops,!hall);show(fogs,!hall);
  const cam=s.cam*S,shake=game.settings.shake?Math.sin(time*96)*s.shake*S:0;
  L.scrollX=640+cam+shake;L.scrollY=360;
  backdrops.forEach((i,n)=>{const base=(n-1)*1280; i.x=base+cam*.85+(n%2?0:1280);i.y=0;i.setSize(n%2?1280:-1280,720);});
  violetVeil.x=cam;fogs.forEach((i,n)=>{i.x=n*1100+cam*.28;i.opacity=.065+Math.sin(time*.4+n)*.014;});
  animation(hero,game.pose);hero.stopAnimation();hero.setPosition(screenX(s.hero.x),screenY(s.hero.y));hero.setSize(HERO_DRAW.width*s.hero.face,HERO_DRAW.height);hero.animationFrame=heroFrame(s.hero,game.pose,s.time);
  hero.opacity=s.hero.iframes>0&&Math.floor(time*16)%2===0?.55:1;
  hero.colorRgb=[1,1,1];
  const live=new Set(s.enemies);
  for(const [e,a]of actors)if(!live.has(e)){a.items.forEach(i=>i.destroy());actors.delete(e);}
  let actorTail=hero;
  for(const e of s.enemies){
   const a=actors.get(e)??makeActor(e),x=screenX(e.x),y=screenY(e.y),size=e.T.dh*(e.T.boss?1.65:1.55),drawing=enemyDrawing(e),top=y-(drawing?.top??size);
   // Quadros têm 512²; a arte é normalizada à altura comum, sem deformação.
   const canvasSize=drawing?.size??size*ART[e.type].canvas/ART[e.type].artHeight;
   if(drawing){animation(a.i,drawing.name);a.i.stopAnimation();a.i.animationFrame=drawing.frame;}
   a.i.setPosition(x,y+(e.dead&&!drawing?e.deathT*20:0));a.i.setSize((drawing?.width??canvasSize)*(e.face>0?-1:1),drawing?.height??canvasSize);
   const trueForm=e.type==='devil'&&e.phase===2;
   a.i.opacity=e.dead ? Math.max(0,1-e.deathT) : e.hitFlash>0&&!trueForm ? .65 : 1;
   a.i.colorRgb=e.state==='stun'?rgb('#8d7ca6'):e.state==='wind'?rgb(e.atk?.red?'#ee9abb':'#dbb9ef'):[1,1,1];
   a.i.angle=0; // Keep anatomy and registered hurt regions aligned during every attack.
   a.back.setPosition(x-32,top-9);a.fill.setPosition(x-31,top-8);a.fill.width=Math.max(.1,62*Math.max(0,e.hp)/e.maxHp);
   a.back.isVisible=a.fill.isVisible=!e.dead&&!e.T.boss&&e.hp<e.maxHp;
   a.warning.setPosition(x-20,top-43);a.warning.isVisible=!e.dead&&e.state==='wind';a.warning.fontColor=rgb(e.atk?.red?'#ef5b98':'#e8d28b');
   const strikeBox=e.atk?.w?bounds(enemyStrike(e,e.atk)):null;
   if(strikeBox){a.strike.setPosition(screenX(strikeBox.x+strikeBox.w/2),screenY(strikeBox.y+strikeBox.h/2));a.strike.setSize(e.face*strikeBox.w*S,strikeBox.h*S);}
   const slash=bossSlashVisual(e);animation(a.strike,slash.name);a.strike.stopAnimation();a.strike.animationFrame=slash.frame;a.strike.colorRgb=[1,1,1];a.strike.angle=0;
   a.strike.isVisible=!!e.T.boss&&!e.dead&&e.state==='act'&&!!e.atk?.w;a.strike.opacity=game.settings.reduceFlash?.6:.92;
   if(trueForm&&e.flight?.stage==='dive'){
    const progress=e.flight.t/DIVE_DURATION, dx=e.flight.target-e.flight.fromX;
    animation(a.strike,'slash-fire');a.strike.stopAnimation();
    a.strike.animationFrame=Math.min(3,Math.floor(progress*4));
    a.strike.setPosition(x+e.face*143,y-169);
    a.strike.setSize(207*e.face,111);
    a.strike.angle=Math.atan2(293,Math.max(85,Math.abs(dx)))*e.face;
    a.strike.opacity=(game.settings.reduceFlash?.36:.65)*Math.sin(Math.PI*progress);
    a.strike.isVisible=a.strike.opacity>.01;
    a.strike.moveAdjacentToInstance(a.i,true);
   }
   const family=sourceFamily(e.type),charging=e.state==='wind'&&!!(e.atk?.proj||e.atk?.marks||e.atk?.fireZone),charge=charging?Math.min(1,e.t/Math.max(.001,e.atk.wind)):1,hand=muzzle(e);
   animation(a.aura,'orb-'+(['water','fire','holy'].includes(family)?family:'void'));a.aura.stopAnimation();a.aura.animationFrame=loopFrame(s.time);a.aura.setPosition(screenX(hand.x),screenY(hand.y));a.aura.setSize(64*(.4+.6*charge),64*(.4+.6*charge));a.aura.colorRgb=[1,1,1];a.aura.isVisible=!!(!drawing&&!e.dead&&(charging||e.T.final&&e.phase===2));a.aura.opacity=game.settings.reduceFlash?.32:.72;

   a.i.moveAdjacentToInstance(actorTail,true);actorTail=a.i;
  }
  drawFinalFight(s,actors.get(s.boss));
  if(gateBars){
   gateFront.moveAdjacentToInstance(actorTail,true);
   animation(gateBars,'grade'+Math.round(s.gateLift*12));gateBars.setSize(gateWidth,gateHeight);
   gateLabel.isVisible=!s.entryOpen;
  }
  if(stairsHint){
   stairsHint.isVisible=playing&&(!s.entryOpen||game.canUseFinalStairs());
   stairsHint.text=s.entryOpen?hudOutline(`${bindings.label('interact',true)} · SUBIR`):'ESCADARIA SELADA';
  }
  exitGlow.isVisible=exitBrazier.isVisible=s.arenaDone;
  if(exitBrazier.isVisible)exitBrazier.animationFrame=Math.floor(s.time*15)%12;
  exitGlow.opacity=.49+Math.sin(s.time*3)*.07;exitPrompt.isVisible=game.canUseBrazier();
  if(exitPrompt.isVisible)exitPrompt.text=`${bindings.label('interact',true)} / CLIQUE · ${s.li===LEVELS.length-1?'RECUPERAR A CHAMA':'PROSSEGUIR'}`;
  for(const [n,p]of s.projs.entries()){
   const i=pooled('projectile','Efeito',n),v=projectileVisual(p,s.time);animation(i,v.name);i.stopAnimation();i.animationFrame=v.frame;i.setPosition(screenX(p.x),screenY(p.y));i.setSize(v.width,v.height);i.angle=v.angle;i.opacity=.98;i.colorRgb=[1,1,1];
  }
  for(const [n,z]of s.hazards.entries()){
   if(z.type==='dust-slam'||z.type==='wing-gust'){
    for(const dir of z.dir?[z.dir]:[-1,1]){
     const x=z.x+dir*z.radius;
     if(x<FINAL_ARENA.left-55||x>METRICS.width+55)continue;
     const plume=pooled('finalDust','Efeito',n*2+(dir>0?1:0));
     animation(plume,'onda-poeira');
     plume.stopAnimation();plume.animationFrame=Math.floor(z.radius/69)%4;
     plume.setPosition(screenX(x),621);
     plume.setSize(dir*(z.type==='dust-slam'?244:196),DUST_HEIGHT*S+11);
     plume.colorRgb=rgb(z.type==='dust-slam'?'#e8c8ac':'#f1a87e');
     plume.opacity=z.type==='dust-slam'?.94:.81;
    }
    continue;
   }
   const i=pooled('hazard','Efeito',n),v=hazardVisual(z,s);animation(i,v.name);i.stopAnimation();i.animationFrame=v.frame;i.setPosition(screenX(z.x),620);i.setSize(v.width,v.height);i.opacity=v.opacity;i.colorRgb=[1,1,1];i.angle=0;
  }
  for(const [n,tr]of s.traps.entries()){
   const i=pooled('trap','Armadilha',n),spikes=tr.type==='spikes',kind=s.li===1||s.li===7?'root':s.li===3?'bone':'iron',box=floorTrapBox(s,tr,METRICS.ground),base=screenY(box.base);
   const flame=trapFireVisual(s.li,s.time,n);animation(i,spikes?kind+(tr.on?'':'-idle'):tr.on?flame.name:'vent');i.stopAnimation();
   i.animationFrame=!spikes&&tr.on?flame.frame:0;
   i.setPosition(screenX(tr.x),base);i.setSize(tr.w*S,tr.on?box.h*S:spikes?7:17);i.isVisible=spikes||tr.on;
   i.opacity=tr.on?1:tr.warning?.84:.55;i.colorRgb=[1,1,1];
   if(!spikes){const vent=pooled('trapVent','Armadilha',n);animation(vent,'vent');vent.setPosition(screenX(tr.x),base);vent.setSize(tr.w*S,17);vent.colorRgb=[1,1,1];vent.opacity=1;}
   const warning=pooled('trapWarning','Efeito',n),warningFamily=spikes?'bone':s.li===5?'void':s.li===7?'crimson':s.li===8?'holy':'fire';animation(warning,'warning-'+warningFamily);warning.stopAnimation();warning.animationFrame=Math.min(3,Math.floor((tr.t%tr.period)/Math.max(.001,tr.warn)*4));warning.setPosition(screenX(tr.x),base);warning.setSize(tr.w*S,28);warning.colorRgb=[1,1,1];warning.opacity=tr.warning?.85:0;
  }
  for(const [n,p]of s.fx.slice(-160).entries()){
   const i=pooled('particle','Efeito',n),v=particleVisual(p);animation(i,v.name);i.stopAnimation();i.animationFrame=v.frame;i.setPosition(screenX(p.x),screenY(p.y));i.setSize(p.size*S*(v.parry?6:3.8),p.size*S*(v.parry?6:3.8));i.colorRgb=v.parry?[1,1,1]:rgb(p.color?.startsWith('#')&&p.color.length===7?p.color:s.lv.accent);i.opacity=Math.min(game.settings.reduceFlash?.45:.85,p.life/p.max);i.angle=0;
  }

  for(const [n,t]of s.texts.entries()){
   const i=pooled('floatText','TextoUI',n);i.sizePt=12;i.fontColor=rgb('#dbbbed');i.text=String(t.t);i.setPosition(screenX(t.x)-130,screenY(t.y));i.setSize(260,40);i.horizontalAlign='center';i.opacity=Math.min(1,t.life*2);
  }
  for(const [n,a]of s.hero.after.slice(-12).entries()){
   const i=pooled('after','Heroi',n);animation(i,a.img);i.stopAnimation();i.setPosition(screenX(a.x),screenY(a.y));i.setSize(a.face*HERO_DRAW.width,HERO_DRAW.height);i.animationFrame=a.frame??0;i.colorRgb=rgb(a.img.startsWith('ult-')?'#ffd9df':'#b78cde');i.opacity=a.a*.6;i.moveAdjacentToInstance(hero,false);
  }
  // The attack frame already contains its measured blade trail; no duplicate low arc.
  const h=s.hero,st=game.stats();hpbar.width=Math.max(.1,hpWidth*h.hp/st.maxHp);stbar.width=Math.max(.1,stWidth*h.st/BAL.baseSt);hpText.text=`${Math.ceil(Math.max(0,h.hp))} / ${st.maxHp}`;
  const vigorSeconds=Math.ceil(h.staminaBoost);
  vigorIcon.isVisible=vigorTime.isVisible=hudVisible&&vigorSeconds>0&&h.state!=='dead';
  if(vigorIcon.isVisible){
   vigorTime.text=hudOutline(`${Math.floor(vigorSeconds/60)}:${String(vigorSeconds%60).padStart(2,'0')}`);
   vigorIcon.opacity=vigorTime.opacity=s.trans>0?.56:1;
  }
  phaseTitle.text=`Fase ${s.li+1} · ${s.lv.name}`;inventory.text=`${game.save.gold} OURO`;flask.text=hudOutline(`VIDA ×${game.save.potHp} · ESTAMINA ×${game.save.potSt}`);
  const remaining=s.enemies.filter(e=>e.role==='explore'&&!e.dead).length;
  const lastPhase=s.li===FINAL_ARENA.level;
  objective.text=s.arenaDone?'Guardião derrotado · braseiro aceso':hall?'Salão do Usurpador · confronto final':
   s.arenaOn?`${s.boss?.T.name??'Arena'} · selada`:s.entryOpen?(lastPhase?'Escadaria livre':'Portão aberto · selo rompido'):
    `Criaturas: ${s.exploreTotal-remaining} / ${s.exploreTotal} · ${lastPhase?'Escadaria selada':'Arena selada'}`;
  const flight=s.boss?.flight;
  const calling=flight?.kind==='guard'&&['summon','guard'].includes(flight.stage);
  const remainingGuard=calling?guardCount(s):0;
  notice.text=remainingGuard? `Reforços: ${remainingGuard} / ${GUARD_TOTAL} · ${flight.healed<s.boss.maxHp*GUARD_HEAL_CAP?'O Usurpador está se curando':'Limite de cura atingido'}`:
   calling?'O Usurpador convoca reforços':
   flight?.kind==='guard'&&['warning','drop'].includes(flight.stage)?'Salte quando a poeira chegar':
   s.banner?[s.banner.title,s.banner.sub].filter(Boolean).join(' · '):'';
  show(noticeHud,playing&&hudVisible&&notice.text.length>0);
  const boss=s.boss,visible=!!boss&&!boss.dead&&s.arenaOn;
  show(bossHud,visible&&hudVisible);
  bossTitle.text=hudOutline((boss?.T.name??'').toUpperCase()+(boss?.T.final?` · ${boss.phase===2?'FORMA VERDADEIRA':'FORMA I'}`:''));
  bossBar.width=Math.max(.1,566*(boss?Math.max(0,boss.hp)/boss.maxHp:0));
  const regenWidth=calling?Math.min(bossBar.width,566*flight.healed/boss.maxHp):0;
  bossHeal.isVisible=visible&&hudVisible&&regenWidth>.1;
  bossHeal.setPosition(357+bossBar.width-regenWidth,652);
  bossHeal.width=Math.max(.1,regenWidth);
  bossHeal.opacity=bossHeal.isVisible?.83:0;
  const pulse=calling?Math.max(0,(flight.healPulse??0)/.19):0;
  bossHealPulse.isVisible=visible&&hudVisible&&pulse>0;
  bossHealPulse.setPosition(357+bossBar.width,656);
  bossHealPulse.setSize(18+11*(1-pulse),17+8*(1-pulse));
  bossHealPulse.opacity=pulse*(game.settings.reduceFlash?.5:.82);
  const transformed=s.trans>0,remainingForm=Math.max(0,Math.min(1,s.trans/BAL.transformTime));
  for(const [a,id]of [[ability[0],'parry'],[ability[1],'dash']]){a.key.text=bindings.label(id,true);a.key.sizePt=a.key.text.length>3?10:15;}
  rKey.text=bindings.label('ult',true);rKey.sizePt=rKey.text.length>3?10:17;flaskKey.text=bindings.label('heal',true);flaskKey.sizePt=flaskKey.text.length>3?9:12;
  controls.text=`${bindings.label('left',true)} / ${bindings.label('right',true)} mover  ·  ${bindings.label('jump',true)} saltar  ·  ${bindings.label('attack',true)} atacar  ·  ${bindings.label('dodge',true)} esquivar  ·  ${bindings.label('heal',true)} frasco  ·  ${bindings.label('pause',true)} pausa`;
  const hudTint=transformed?rgb('#ffb6bf'):[1,1,1];
  heroPanel.colorRgb=hudTint;
  animation(portrait,transformed?'chama':'idle');portrait.setSize(78,78);
  portraitFrame.colorRgb=transformed?rgb('#f8c2c9'):[1,1,1];
  for(const [n,a]of ability.entries()){
   animation(a.icon,(n===0?'aparo':'avanco')+(transformed?'-rubro':''));a.icon.setSize(48,48);
   a.frame.colorRgb=hudTint;
   a.keyPlate.colorRgb=transformed?rgb('#ffd1d9'):[1,1,1];
   a.glow.colorRgb=rgb(transformed?'#ff345a':'#b674ed');a.key.fontColor=rgb(transformed?'#fff1f2':'#e5d6ee');a.sub.fontColor=rgb(transformed?'#efc3ca':'#bba9c9');
  }
  ability[0].glow.opacity=h.state==='parry'?.45:.03;ability[0].icon.opacity=transformed||h.st>=BAL.parryCost?1:.38;
  ability[1].sub.text=h.dashCd>0?`${h.dashCd.toFixed(1).replace('.', ',')} s`:'Avanço';ability[1].icon.opacity=h.dashCd>0||(!transformed&&h.st<BAL.dashCost)?.32:1;ability[1].glow.opacity=h.state==='dash'?.4:.03;
  const charge=Math.floor(game.save.energy/10),ready=charge===10&&s.trans<=0&&!s.cine;
  animation(swordBase,transformed?'rubra':'espada');swordBase.setSize(60,224);swordBase.colorRgb=transformed?[.66,.66,.66]:[.58,.58,.63];
  animation(swordFill,transformed?'rubra-brilho':'carga'+charge);swordFill.setSize(60,224);
  swordGlow.isVisible=swordInnerGlow.isVisible=bladeCoreGlow.isVisible=(ready||transformed)&&playing;
  swordGlow.colorRgb=rgb(transformed?'#ff244d':'#a64af5');swordInnerGlow.colorRgb=rgb(transformed?'#ffb3bf':'#c582ff');bladeCoreGlow.colorRgb=rgb(transformed?'#fff2f4':'#deb1ff');
  swordGlow.opacity=transformed?.76*remainingForm:.62+Math.sin(time*2.8)*.10;swordInnerGlow.opacity=transformed?.66*remainingForm:.49+Math.sin(time*2.8)*.08;bladeCoreGlow.opacity=transformed?.24*remainingForm:.15+Math.sin(time*2.8)*.035;
  for(const {i,side,n}of violetFlames){const p=(time*.73+n/7+(side>0?.29:0))%1,e=Math.sin(p*Math.PI);i.isVisible=ready&&playing;i.opacity=.10+e*.27;i.setPosition(1214+side*(10+p*5+Math.sin(time*1.7+n)*.8),393+n*20-p*9);i.setSize(side*(6+e*4),14+e*10);}
  swordFill.opacity=transformed?remainingForm:ready?.91+Math.sin(time*3.7)*.09:1;
  rKey.fontColor=rgb(transformed?'#fff1f2':'#e6cafa');
  rKey.opacity=ready||transformed?1:.72;
  worldFlash.opacity=playing?Math.min(game.settings.reduceFlash?.08:.20,s.flash*.25):0;
  if(s.cine||s.finalShift||guardSceneProgress(boss)!==null)show(ui,false);
  if(runtime.touch?.enabled){
   for(const a of ability)for(const i of Object.values(a))i.isVisible=false;
   for(const i of [controls,flaskKey,rKey,swordBase,swordFill,swordGlow,swordInnerGlow,bladeCoreGlow,...violetFlames.map(f=>f.i)])i.isVisible=false;
  }
  ultimateCinema.render(slotMode?null:s.cine,game.mode,game.settings);
 }
 function touchMenu(){
  if(!runtime.touch?.enabled||!buttons.length)return null;
  const group=game.mode==='menu'?menuRows:overlay;
  const titles=new Set(buttons.map(b=>b.label));
  const prose=group.filter(i=>i.type==='TextoUI'&&!titles.has(i));
  const title=prose.find(i=>i.sizePt>=24)?.text??'Última Vigília';
  const extra=prose.filter(i=>i.sizePt<24).map(i=>i.text).filter(Boolean);
  const audioOpen=volumeRows.length>0;
  const rootMenu=game.mode==='menu'&&menuPage==='root'&&!slotMode;
  const credits=game.mode==='credits'||game.mode==='menu'&&menuPage==='credits';
  return {
   key:lastScreen,kind:credits?'credits':audioOpen?'audio':game.mode,
   title:rootMenu?'Última Vigília':title,
   description:rootMenu?'A última lâmina ainda resiste.':game.mode==='shop'?extra[0]:credits?'':audioOpen?'Ajuste o volume ou toque no alto-falante para silenciar.':extra[0]??'',
   note:credits?extra.join('\n'):game.mode==='shop'?flashHint||'Arraste a lista para ver os equipamentos. A compra equipa o item na hora.':rootMenu?'Celular: direcional e ações por toque. Ajuste as posições em Controles.':'',
   buttons:buttons.map((b,n)=>({label:b.label.text,detail:b.detail,disabled:b.dim,
    activate:()=>{pendingAction=b.action;},
    audio:volumeRows[n]?{value:game.settings[volumeRows[n].channel],muted:game.settings.muted[volumeRows[n].channel],change:value=>adjustVolume(volumeRows[n],value),mute:()=>toggleMute(volumeRows[n])}:null,
   })),
  };
 }
 function frame(){
  const dt=Math.min(runtime.dt,1/30);time+=dt;rebuildScreen();
  const storyBefore=game.story;
  const previousSelection=selected;
  if(pressed.has('Escape')||bindings.pressed('pause',pressed)){
   if(game.mode==='finalPrompt'){
    pendingAction=null;game.confirmFinalArena(false);pressed.clear();keys.clear();
   }else if(slotMode){
    pendingAction=null;closeSlots();pressed.clear();keys.clear();
   }else if(game.mode==='paused'&&pausePage!=='root'){
    pendingAction=null;pausePage='root';pressed.clear();keys.clear();
   }else if(game.mode==='credits'&&pressed.has('Escape')){
    pendingAction=null;returnFromCredits();pressed.clear();keys.clear();
   }else if(game.mode==='menu'&&menuPage!=='root'&&pressed.has('Escape')){
    pendingAction=null;menuPage='root';pressed.clear();keys.clear();
   }
  }
  const gridOpen=slotMode?slotConfirm===null:game.mode==='paused'&&pausePage==='phases';
  if(game.mode!=='play'&&buttons.length&&!bindingCapture&&gridOpen){
   if(pressed.has('Tab'))selected=(selected+1)%11;
   if(pressed.has('ArrowDown')||pressed.has('KeyS'))selected=selected<8?selected+2:10;
   if(pressed.has('ArrowUp')||pressed.has('KeyW'))selected=selected===10?8:Math.max(0,selected-2);
   if(pressed.has('ArrowRight'))selected=selected<10&&selected%2===0?selected+1:10;
   if(pressed.has('ArrowLeft'))selected=selected===10?8:Math.max(0,selected-1);
   if(pressed.has('Enter')||pressed.has('NumpadEnter'))pendingAction=buttons[selected].action;
  }else if(game.mode!=='play'&&buttons.length&&!bindingCapture){
   if(pressed.has('ArrowDown')||pressed.has('KeyS')||pressed.has('Tab'))selected=(selected+1)%buttons.length;
   if(pressed.has('ArrowUp')||pressed.has('KeyW'))selected=(selected-1+buttons.length)%buttons.length;
   if(volumeRows.length){
    const row=volumeRows[selected];
    if(row){
     const level=game.settings[row.channel];
     if(pressed.has('ArrowRight'))adjustVolume(row,level+.05);
     if(pressed.has('ArrowLeft'))adjustVolume(row,level-.05);
     if(pressed.has('Home'))adjustVolume(row,0);
     if(pressed.has('End'))adjustVolume(row,1);
     if(pressed.has('Enter')||pressed.has('NumpadEnter'))toggleMute(row);
    }
   }else{
    if(pressed.has('ArrowRight'))selected=Math.min(buttons.length-1,selected+11);
    if(pressed.has('ArrowLeft'))selected=Math.max(0,selected-11);
   }
   if(pressed.has('Enter')||pressed.has('NumpadEnter'))pendingAction=buttons[selected].action;
  }
  if(selected!==previousSelection)paintButtons();
  if(pendingAction){const action=pendingAction;pendingAction=null;effects.play('paper-select',.64,null,true);action();pressed.clear();keys.clear();clickInteract=false;lastScreen='';}
  const input=Object.fromEntries(ACTIONS.map(a=>[a.id,['left','right','down'].includes(a.id)?bindings.held(a.id,keys):bindings.pressed(a.id,pressed)]));
  const touchInput=runtime.touch?.sample()??{};
  for(const [id,value]of Object.entries(touchInput))input[id]||=value;
  input.skipStory||=pressed.has('Space');
  input.interact||=clickInteract;
  game.step(input,runtime.dt);pressed.clear();clickInteract=false;
  syncAudio();
  if(!storySuspended)updateStory(game.story,game.story===storyBefore?runtime.dt:0);
  rebuildScreen();render(game.state,dt);
  if(runtime.touch?.enabled){
   runtime.touch.setMenu(touchMenu());
   show(menuRows,false);show(overlay,false);logo.isVisible=false;
  }
  if(game.mode==='shop'&&shopHint)shopHint.text=flashHint||'A próxima vigília mantém sua vida atual. Prepare a lâmina e os frascos.';
  for(const event of game.soundEvents)sound(event);
  if(game.mode==='menu')L.scrollX=640;
 }
 runtime.addEventListener('tick',frame);frame();music.unlock();effects.unlock();
 console.info('[Última Vigília] Campanha: 10 fases, 40 inimigos de exploração, 10 bosses, reforços originais e loja entre fases.');
}

