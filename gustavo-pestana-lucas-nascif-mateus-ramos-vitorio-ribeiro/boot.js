import {Renderer} from './renderer.js';
import {createRuntime, ImageStore} from './runtime.js?v=touch-2';
import {LEVELS} from './scripts/data.js';
import {createLoadingScreen} from './loading/screen.js';
import {createTouchControls} from './touch/controls.js?v=touch-2';
import {isTouchDevice} from './touch/model.js';

export let gameRuntime;

const canvas = document.getElementById('game');
const loading = createLoadingScreen(document.getElementById('loading'),{touch:isTouchDevice()});
const retry = document.getElementById('retry');
retry.addEventListener('click', () => location.reload());

function fail(error) {
  console.error(error);
  loading.showError(error.message || 'O carregamento foi interrompido. Tente novamente.');
}

loading.show('Preparando a vigília…');
try {
  const response = await fetch('./assets.json');
  if (!response.ok) throw Error('Não foi possível carregar os arquivos do jogo.');
  const manifest = await response.json();
  const renderer = new Renderer(canvas);
  const runtime = createRuntime(manifest, canvas);
  gameRuntime = runtime;
  const touch = createTouchControls({onGesture:()=>{void runtime.emit('touchgesture');},onReset:()=>{void runtime.emit('touchreset');}});
  runtime.touch=touch;
  const images = new ImageStore(renderer,touch.enabled?{maxDimension:path=>/\/(heroi|inimigo)-/.test(path)?512:1024,memoryBudget:220}:{});
  let suspended = document.hidden, clock = performance.now(), busy = false, plan = 'menu';
  const animationPaths = (type, choose = () => true) => manifest.types[type].animations
    .filter(choose).flatMap(animation => animation.frames.map(frame => frame.image));
  const menuTypes = ['MenuArte', 'TituloEspada', 'Ornamento'];
  const menuPaths = menuTypes.flatMap(type => animationPaths(type));
  await images.preload(menuPaths, loading.setProgress);
  globalThis.runOnStartup = callback => callback(runtime);
  await import('./scripts/principal.js?v=touch-2');
  delete globalThis.runOnStartup;
  await runtime.emit('beforeprojectstart');
  loading.hide();

  function areaPaths() {
    const state = runtime.campaign?.state;
    if (!state) return menuPaths;
    const types = new Set([...LEVELS[state.li].explore, ...LEVELS[state.li].arena,
      ...state.enemies.map(e => e.type)]);
    if (state.li === 9) for (const type of ['devil', 'devil2', 'sentinel', 'specter', 'crawler', 'lancer']) types.add(type);
    const paths = [...menuPaths];
    const permanent = ['Heroi', 'Efeito', 'UltimaCena', 'UltimaFragmento', 'Retrato',
      'MolduraRetrato', 'EspadaUI', 'Brilho', 'ChamaVioleta', 'Nevoa', 'ArteHUD', 'BrasaPassagem'];
    for (const type of permanent) paths.push(...animationPaths(type));
    paths.push(...animationPaths('Inimigo', animation =>
      [...types].some(type => animation.name === type || animation.name.startsWith(type + '-'))));
    paths.push(...animationPaths('Fundo', animation => animation.name === state.lv.bg ||
      state.li === 9 && ['sala-usurpador', 'escadaria-usurpador'].includes(animation.name)));
    paths.push(...animationPaths('Terreno', animation => animation.name.startsWith('f' + (state.li + 1) + '-')));
    paths.push(...animationPaths('Armadilha'), ...animationPaths('PortaoFerro'));
    return paths;
  }
  function prepareArea() {
    const state = runtime.campaign?.state;
    const key = state ? state.li : 'menu';
    if (key === plan) return;
    plan = key;
    busy = true;
    const wasPlaying = runtime.campaign?.mode === 'play';
    void runtime.emit('suspend');
    loading.show(state ? 'Preparando ' + state.lv.name + '…' : 'Preparando a vigília…');
    void images.preload(areaPaths(), loading.setProgress).then(() => {
      busy = false;
      loading.hide();
      if (wasPlaying) runtime.campaign.resume();
      if (!suspended) void runtime.emit('resume');
      clock = performance.now();
    }).catch(fail);
  }
  function draw() {
    renderer.begin();
    for (const layer of manifest.layers) {
      const camera = layer.name === 'Mundo' ? runtime.layout.scrollX - 640 : 0;
      for (const item of runtime.instances) {
        if (item.layer !== layer.name || !item.isVisible || item.opacity <= 0 || item.destroyed) continue;
        if (Math.abs(item.x - camera - 640) > Math.abs(item.width) + 800 ||
            item.y < -Math.abs(item.height) || item.y > 720 + Math.abs(item.height)) continue;
        if (item.type === 'TextoUI') {
          const texture = renderer.label(item);
          if (texture) renderer.quad(texture, {...item, colorRgb: item.fontColor}, camera);
        } else if (item.type === 'Forma') {
          renderer.quad(renderer.white, item, camera);
        } else {
          const entry = images.request(item.image);
          if (entry.texture) renderer.quad(entry.texture, item, camera);
          else for (const frame of item.animation.frames) images.request(frame.image);
        }
      }
    }
    renderer.end();
    images.trim();
  }
  const forward = event => {
    if (busy || suspended || touch.editing) return;
    if(touch.enabled&&(event.target?.closest?.('#touch-ui')||document.activeElement?.matches?.('#touch-ui input'))&&event.code!=='Escape')return;
    if (event.type === 'keydown' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) event.preventDefault();
    if (event.type === 'pointerdown') {
      canvas.focus();
      if(event.pointerType==='touch'){event.preventDefault();canvas.setPointerCapture(event.pointerId);}
    }
    void runtime.emit(event.type, event);
  };
  for (const type of ['keydown', 'keyup']) window.addEventListener(type, forward);
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'pointercancel']) canvas.addEventListener(type, forward);
  window.addEventListener('pointerup', event => {
    if (event.target !== canvas) void runtime.emit('pointerup', event);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  const suspend = () => {
    touch.clear();
    if (suspended) return;
    suspended = true;
    void runtime.emit('suspend');
  };
  const resume = () => {
    if (document.hidden) return;
    suspended = false;
    clock = performance.now();
    void runtime.emit('resume');
  };
  window.addEventListener('blur', suspend);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', () => document.hidden ? suspend() : resume());
  window.addEventListener('pagehide', suspend);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    suspend();
    fail(Error('A conexão com a placa de vídeo foi interrompida. Recarregue para continuar do último save.'));
  });
  function frame(now) {
    runtime.dt = Math.min(Math.max(0, (now - clock) / 1000), 1 / 30);
    clock = now;
    try {
      if (!busy && !suspended) {
        prepareArea();
        if (!busy) void runtime.emit('tick');
      }
      draw();
      const game=runtime.campaign;
      touch.sync({mode:game?.mode,state:game?.state,save:game?.save,blocked:busy||suspended,
        interact:game?.mode==='play'&&(game.canUseBrazier()||game.canUseFinalStairs())});
    } catch (error) { fail(error); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.focus();
} catch (error) { fail(error); }
