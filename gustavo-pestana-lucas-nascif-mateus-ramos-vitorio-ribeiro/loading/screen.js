import {createBindings} from '../scripts/keybindings.js';

const SCENES = ['ruinas', 'aqueduto', 'braseiro'];
const INTERVAL_MS = 6000;
const TIPS = [
  keys => 'Apare no momento do contato usando ' + keys.label('parry') + '. Guarde fôlego para reagir.',
  () => 'A estamina se recupera após um curto intervalo sem gasto. Guarde fôlego para esquivar.',
  keys => 'O frasco de estamina (' + keys.label('stamina') + ') dobra a regeneração passiva durante um minuto.',
  keys => 'Use ' + keys.label('dash') + ' para avançar. A habilidade precisa de tempo para ficar disponível novamente.',
  keys => 'Derrote os inimigos da área para liberar a arena. Após vencer o guardião, use ' + keys.label('interact') + ' junto ao braseiro.',
  keys => 'Pause com ' + keys.label('pause') + ' para salvar a campanha em um dos dez slots de memória.',
  () => 'Avançar de fase mantém sua vida atual. Prepare os equipamentos e frascos na loja.',
  () => 'Na loja, comprar uma arma ou armadura equipa o item imediatamente.',
  keys => 'Durante a Ultimate (' + keys.label('ult') + '), sua estamina permanece no mesmo valor.',
  () => 'A primeira Ultimate da campanha revela a transformação completa. As seguintes usam a versão curta.',
  keys => 'Use ' + keys.label('jump') + ' para saltar. Você também pode atacar enquanto está no ar.',
];

export function createLoadingScreen(root,{touch=false}={}) {
  const message = root.querySelector('#loading-text');
  const progress = root.querySelector('#loading-progress');
  const percent = root.querySelector('#loading-percent');
  const tip = root.querySelector('#loading-tip');
  const retry = root.querySelector('#retry');
  const layers = [root.querySelector('#loading-art-front'), root.querySelector('#loading-art-back')];
  const decoded = new Map();
  let active = false, timer = null, version = 0, advancing = false;
  let scene = 0, front = 0, nextTip = 0, keys;

  function refreshBindings() {
    let storage;
    try { storage = globalThis.localStorage; } catch {}
    keys = touch?{label:id=>({parry:'Aparar',stamina:'Vigor',dash:'Avanço',interact:'Usar',pause:'Pausa',ult:'Ultimate',jump:'Saltar'}[id]??id)}:createBindings(storage);
  }
  function showTip() {
    tip.textContent = TIPS[nextTip](keys);
    nextTip = (nextTip + 1) % TIPS.length;
  }
  function readyImage(index) {
    if (!decoded.has(index)) {
      const image = new Image();
      image.src = './loading/' + SCENES[index] + '.webp';
      decoded.set(index, image.decode().then(() => image).catch(() => {
        decoded.delete(index);
        return null;
      }));
    }
    return decoded.get(index);
  }
  async function advance() {
    if (!active || advancing) return;
    advancing = true;
    const generation = version;
    const next = (scene + 1) % SCENES.length;
    const image = await readyImage(next);
    if (generation === version && active) {
      if (image) {
        const back = 1 - front;
        layers[back].src = image.src;
        layers[back].classList.add('is-current');
        layers[front].classList.remove('is-current');
        front = back;
        scene = next;
        root.dataset.scene = SCENES[scene];
        void readyImage((scene + 1) % SCENES.length);
      }
      showTip();
    }
    advancing = false;
  }
  function setProgress(value) {
    const amount = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    progress.value = amount;
    percent.textContent = Math.floor(amount * 100) + '%';
  }
  function show(text) {
    refreshBindings();
    message.textContent = text;
    retry.hidden = true;
    root.hidden = false;
    setProgress(0);
    if (active) return;
    active = true;
    version++;
    showTip();
    root.dataset.scene = SCENES[scene];
    void readyImage((scene + 1) % SCENES.length);
    timer = setInterval(() => { void advance(); }, INTERVAL_MS);
  }
  function hide() {
    active = false;
    version++;
    clearInterval(timer);
    timer = null;
    root.hidden = true;
  }
  function showError(text) {
    show(text);
    retry.hidden = false;
    retry.focus({preventScroll: true});
  }
  return {show, hide, setProgress, showError};
}
