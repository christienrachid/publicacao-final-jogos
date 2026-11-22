import {CONTROL_NAMES,TouchInput,defaults,loadLayout,saveLayout,boundedPosition,isTouchDevice} from './model.js';

const drawings={
  attack:'<path d="m8 34 20-25 9-2-2 9-24 22M7 27l13 13M5 41l7-7"/>',
  jump:'<path d="M24 39V9M13 20 24 9l11 11M9 40h30"/>',
  dodge:'<path d="m29 8-9 10 8 7-9 14M20 18l-9 3M28 25l10 3M5 10h9M3 31h10"/>',
  parry:'<path d="M24 5 8 12v12c0 9 16 18 16 18s16-9 16-18V12ZM24 13v20M16 23h16"/>',
  dash:'<path d="M5 24h34M26 12l13 12-13 12M6 11h10M6 37h10"/>',
  ult:'<path d="M24 4 30 16l-3 20h-6l-3-20ZM14 33h20M24 36v9M7 14l4 5M41 14l-4 5"/>',
  heal:'<path d="M18 5h12v9l7 8v18H11V22l7-8ZM18 5v6h12M24 22v12M18 28h12"/>',
  stamina:'<path d="M18 5h12v9l7 8v18H11V22l7-8ZM18 5v6h12M28 20l-9 10h7l-5 9"/>',
  interact:'<path d="M12 26V15a3 3 0 0 1 6 0v9-14a3 3 0 0 1 6 0v14-11a3 3 0 0 1 6 0v11-7a3 3 0 0 1 6 0v14l-7 10H18L8 30a3 3 0 0 1 4-4Z"/>',
  pause:'<path d="M16 10v28M32 10v28"/>',
  fullscreen:'<path d="M7 19V7h12M29 7h12v12M41 29v12H29M19 41H7V29"/>',
};
const icon=id=>'<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+drawings[id]+'</svg>';
function node(tag,className,text) {const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;}

export function createTouchControls({onGesture=()=>{},onReset=()=>{},enabled=isTouchDevice()}={}) {
  if(!enabled)return {enabled:false,editing:false,sample:()=>({}),sync(){},setMenu(){},clear(){},openEditor(){}};
  let storage;try{storage=localStorage;}catch{}
  let saved=loadLayout(storage),draft=null,editing=false,orientation='',menu=null,menuKey='',active=false;
  let lastMode='',joystickPointer=null,dragged=new Map(),menuEntries=[];
  const input=new TouchInput(),buttons=new Map();
  document.body.classList.add('touch-device');
  const root=node('section','touch-root');root.id='touch-ui';root.setAttribute('aria-label','Controles para celular');
  const surface=node('div','touch-surface');surface.hidden=true;
  const editor=node('div','touch-editor');editor.hidden=true;
  const heading=node('h1','','Controles de toque');
  const instruction=node('p','','Arraste os botões. As posições são salvas para esta orientação.');
  const editorBar=node('div','touch-editor-bar');editorBar.append(heading,instruction);
  const editorActions=node('div','touch-editor-actions');
  const status=node('p','touch-status');status.setAttribute('role','status');
  editor.append(editorBar,editorActions,status);
  const panel=node('section','touch-menu');panel.hidden=true;panel.setAttribute('aria-label','Menu do jogo');
  const menuHeader=node('header','touch-menu-header'),menuTitle=node('h1'),menuDescription=node('p');
  const menuList=node('div','touch-menu-list'),menuFooter=node('p','touch-menu-note');
  menuHeader.append(menuTitle,menuDescription);panel.append(menuHeader,menuList,menuFooter);
  const skip=node('button','touch-skip','Pular cena');skip.type='button';skip.hidden=true;
  const hint=node('p','touch-orientation','Para uma visão melhor da arena, use o celular na horizontal.');hint.hidden=true;
  root.append(surface,editor,panel,skip,hint);document.body.append(root);

  function clear() {
    input.clear();joystickPointer=null;dragged.clear();
    for(const b of buttons.values())b.classList.remove('is-held');
    const knob=buttons.get('joystick')?.querySelector('i');if(knob)knob.style.transform='translate(-50%, -50%)';
  }
  function gesture(event) {event.stopPropagation();onGesture();}
  function fullscreen() {
    try {
      if(document.fullscreenElement) {void document.exitFullscreen?.();return;}
      const promise=document.documentElement.requestFullscreen?.();
      promise?.then(()=>screen.orientation?.lock?.('landscape')).catch(()=>{});
    }catch{}
  }
  function place(id) {
    const b=buttons.get(id),profile=(draft??saved)[orientation],p=profile[id];
    const bounded=boundedPosition(p[0]*innerWidth/100,p[1]*innerHeight/100,innerWidth,innerHeight,Math.max(b.offsetWidth,b.offsetHeight)/2);
    const edge=Math.max(b.offsetWidth,b.offsetHeight)/2+8;
    b.style.left=`clamp(calc(env(safe-area-inset-left) + ${edge}px), ${bounded[0]}%, calc(100% - env(safe-area-inset-right) - ${edge}px))`;
    b.style.top=`clamp(calc(env(safe-area-inset-top) + ${edge}px), ${bounded[1]}%, calc(100% - env(safe-area-inset-bottom) - ${edge}px))`;
  }
  function resize() {
    orientation=innerWidth>=innerHeight?'landscape':'portrait';
    root.dataset.orientation=orientation;document.body.dataset.touchOrientation=orientation;
    clear();for(const id of buttons.keys())place(id);onReset();
  }
  function editorButton(label,action) {
    const b=node('button','touch-menu-button',label);b.type='button';
    b.addEventListener('click',event=>{gesture(event);action();});editorActions.append(b);
  }
  function closeEditor(save) {
    if(save){saved=structuredClone(draft);status.textContent=saveLayout(storage,saved)?'Posições salvas.':'Posições aplicadas nesta sessão.';}
    draft=null;editing=false;editor.hidden=true;root.classList.remove('is-editing');menuKey='';clear();resize();
  }
  function openEditor() {
    draft=structuredClone(saved);editing=true;clear();onReset();panel.hidden=true;surface.hidden=false;editor.hidden=false;
    root.classList.add('is-editing');status.textContent='Mover: direcional. Puxe para baixo e toque Saltar para descer de uma plataforma.';
    for(const id of buttons.keys())place(id);
  }
  editorButton('Salvar',()=>closeEditor(true));
  editorButton('Restaurar padrão',()=>{draft[orientation]=defaults()[orientation];clear();for(const id of buttons.keys())place(id);status.textContent='Padrão restaurado. Toque Salvar para confirmar.';});
  editorButton('Cancelar',()=>closeEditor(false));
  skip.addEventListener('pointerdown',event=>{gesture(event);event.preventDefault();input.down(event.pointerId,'skipStory');input.up(event.pointerId);});

  for(const [id,label]of Object.entries(CONTROL_NAMES)) {
    const b=node('button','touch-button touch-'+id);b.type='button';b.dataset.control=id;b.setAttribute('aria-label',label);
    if(id==='joystick')b.innerHTML='<span class="touch-direction">‹ · ›</span><i></i><span class="touch-button-label">Mover</span>';
    else {b.innerHTML=icon(id);b.append(node('span','touch-button-label',label),node('span','touch-count'));}
    surface.append(b);buttons.set(id,b);
    b.addEventListener('contextmenu',event=>event.preventDefault());
    b.addEventListener('pointerdown',event=>{
      gesture(event);event.preventDefault();
      if(event.pointerType==='mouse'&&event.button!==0)return;
      if(!editing&&!active)return;
      if(id==='joystick'&&joystickPointer!==null&&!editing)return;
      b.setPointerCapture(event.pointerId);
      if(editing) {
        const rect=b.getBoundingClientRect();dragged.set(event.pointerId,{id,dx:event.clientX-rect.left-rect.width/2,dy:event.clientY-rect.top-rect.height/2});
      }else if(id==='fullscreen')fullscreen();
      else if(id==='joystick'){joystickPointer=event.pointerId;moveStick(event);}
      else input.down(event.pointerId,id);
      b.classList.add('is-held');
    });
    b.addEventListener('pointermove',event=>{
      const drag=dragged.get(event.pointerId);
      if(drag) {
        event.preventDefault();event.stopPropagation();
        draft[orientation][drag.id]=boundedPosition(event.clientX-drag.dx,event.clientY-drag.dy,innerWidth,innerHeight,Math.max(b.offsetWidth,b.offsetHeight)/2);place(drag.id);
      }else if(id==='joystick'&&joystickPointer===event.pointerId){event.preventDefault();moveStick(event);}
    });
    const release=event=>{
      dragged.delete(event.pointerId);input.up(event.pointerId);
      if(joystickPointer===event.pointerId){joystickPointer=null;input.move(0,0);b.querySelector('i').style.transform='translate(-50%, -50%)';}
      b.classList.remove('is-held');
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,release);
  }
  function moveStick(event) {
    const b=buttons.get('joystick'),r=b.getBoundingClientRect(),radius=r.width*.38;
    const dx=(event.clientX-r.left-r.width/2)/radius,dy=(event.clientY-r.top-r.height/2)/radius,length=Math.max(1,Math.hypot(dx,dy));
    input.move(dx/length,dy/length);
    b.querySelector('i').style.transform=`translate(calc(-50% + ${dx/length*radius*.62}px), calc(-50% + ${dy/length*radius*.62}px))`;
  }
  function setMenu(descriptor) {
    menu=descriptor;if(!menu||editing)return;
    const key=menu.key;
    if(key!==menuKey) {
      menuKey=key;menuEntries=[];menuList.replaceChildren();panel.dataset.kind=menu.kind;
      for(const [index,item]of menu.buttons.entries()) {
        if(item.audio) {
          const row=node('div','touch-audio-row'),label=node('label','',item.label),range=node('input'),value=node('output'),mute=node('button','touch-mute');
          range.type='range';range.min='0';range.max='100';range.step='1';range.id='touch-volume-'+index;label.htmlFor=range.id;
          range.setAttribute('aria-label',item.label);mute.type='button';
          range.addEventListener('input',()=>{onGesture();menu.buttons[index].audio.change(Number(range.value)/100);});
          mute.addEventListener('click',()=>{onGesture();menu.buttons[index].audio.mute();});
          row.append(label,range,value,mute);menuList.append(row);menuEntries.push({row,label,range,value,mute});
        }else{
          const b=node('button','touch-menu-button'),label=node('span'),detail=node('small');b.type='button';b.append(label,detail);
          b.addEventListener('click',()=>{onGesture();menu.buttons[index]?.activate?.();});
          menuList.append(b);menuEntries.push({b,label,detail});
        }
      }
      menuList.scrollTop=0;
    }
    menuTitle.textContent=menu.title;menuDescription.textContent=menu.description??'';menuFooter.textContent=menu.note??'';
    menu.buttons.forEach((item,index)=>{
      const entry=menuEntries[index];if(!entry)return;
      if(entry.b){entry.b.disabled=!!item.disabled;entry.label.textContent=item.label;entry.detail.textContent=item.detail??'';entry.detail.hidden=!item.detail;}
      else {
        const percent=Math.round(item.audio.value*100);entry.range.value=String(percent);entry.value.textContent=percent+'%';
        entry.mute.innerHTML=icon('fullscreen').replace(drawings.fullscreen,item.audio.muted?'<path d="M8 19h8l10-9v28l-10-9H8ZM32 18l9 12M41 18l-9 12"/>':'<path d="M8 19h8l10-9v28l-10-9H8ZM32 16q12 8 0 16M31 21q5 3 0 6"/>');
        entry.mute.setAttribute('aria-label',(item.audio.muted?'Reativar ':'Silenciar ')+item.label);
        entry.mute.setAttribute('aria-pressed',String(item.audio.muted));
      }
    });
  }
  function sync({mode,state,save,blocked=false,interact=false}={}) {
    if(lastMode!==mode){clear();lastMode=mode;}
    const cinema=!!(state?.cine||state?.finalShift||state?.boss?.flight?.stage==='summon');
    active=mode==='play'&&!blocked&&!cinema&&!editing;
    surface.hidden=blocked||!(active||editing);editor.hidden=!editing||blocked;
    panel.hidden=blocked||editing||!menu;
    skip.hidden=blocked||editing||mode!=='story';
    hint.hidden=orientation!=='portrait'||blocked||editing||mode!=='play';
    root.classList.toggle('is-transformed',(state?.trans??0)>0);
    if(blocked||cinema)clear();
    const ult=buttons.get('ult'),remaining=state?.trans>0?state.trans/8:(save?.energy??0)/100;
    ult.style.setProperty('--charge',Math.max(0,Math.min(1,remaining))*360+'deg');ult.classList.toggle('is-ready',remaining>=1);
    buttons.get('heal').querySelector('.touch-count').textContent=save?.potHp??'';
    buttons.get('stamina').querySelector('.touch-count').textContent=save?.potSt??'';
    buttons.get('dash').querySelector('.touch-count').textContent=state?.hero?.dashCd>0?Math.ceil(state.hero.dashCd)+'s':'';
    buttons.get('interact').classList.toggle('is-ready',interact);
  }
  window.addEventListener('resize',resize);
  window.addEventListener('blur',clear);
  window.addEventListener('pagehide',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  window.addEventListener('keydown',event=>{if(editing&&event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeEditor(false);}},true);
  root.addEventListener('pointerdown',event=>{event.stopPropagation();onGesture();});
  resize();
  return {enabled:true,get editing(){return editing;},sample:()=>editing?{}:input.sample(),clear,openEditor,setMenu,sync};
}
