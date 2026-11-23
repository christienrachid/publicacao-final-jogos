// Versão CLÁSSICA (pc.createScript) do script do Editor. O Editor do projeto do usuário
// lista diretamente o formato clássico (`simuladorVoo`) no componente Script.
// Mesmo comportamento e atributos de src/editor/flight-sim.ts, com atualização ao vivo (`attr`).
import type { AppBase } from 'playcanvas';
import cssText from '../flight.css?inline';
import {
  startFlightSim,
  type DifficultyLevel,
  type FlightSimHandle,
  type FlightSimOptions,
} from '../flight/game';
import { createLoadingScreen, type LoadingScreenHandle } from '../flight/ui/loading';

type ClassicScript = {
  app: AppBase;
  enabled: boolean;
  dayDurationMinutes: number;
  difficulty: DifficultyLevel;
  mouseSensitivity: number;
  musicVolume: number;
  sfxVolume: number;
  showMinimap: boolean;
  showFps: boolean;
  presentationMode: boolean;
  on(event: string, fn: () => void, scope?: unknown): void;
  off(event: string, fn: () => void, scope?: unknown): void;
  once(event: string, fn: () => void, scope?: unknown): void;
};

type ClassicScriptClass = {
  attributes: {
    add(name: string, schema: Record<string, unknown>): void;
  };
  prototype: Record<string, unknown>;
};

declare const pc: { createScript(name: string): ClassicScriptClass };


// Uma única instância do jogo por página: a cena do Editor pode ter o script ligado mais de uma vez
// (ex.: versão clássica e ESM), o que criava dois carros, dois HUDs e o menu preso na tela.
const INSTANCE_KEY = '__deliveredByNoonInstance';
const instanceSlot = globalThis as unknown as Record<string, unknown>;

const SimuladorVoo = pc.createScript('simuladorVoo');

SimuladorVoo.attributes.add('dayDurationMinutes', {
  type: 'number',
  title: 'Duração do dia (min)',
  description: 'Quantos minutos reais dura o turno da manhã de 06:00 a 12:00 (padrão: 30).',
  default: 30,
  min: 2,
  max: 60,
  precision: 0,
  step: 1,
});

SimuladorVoo.attributes.add('difficulty', {
  type: 'string',
  title: 'Dificuldade',
  description: 'Ajusta o raio de aceitação das entregas e o tempo disponível até o meio-dia.',
  default: 'normal',
  enum: [
    { 'Fácil (+35% raio, +25% tempo)': 'facil' },
    { 'Normal (padrão)': 'normal' },
    { 'Difícil (-28% raio, -25% tempo)': 'dificil' },
  ],
});

SimuladorVoo.attributes.add('mouseSensitivity', {
  type: 'number',
  title: 'Sensibilidade do mouse (A-29)',
  description: 'Sensibilidade do mouse para a mira de voo do A-29 e rotação de câmera.',
  default: 0.15,
  min: 0.05,
  max: 0.4,
  precision: 2,
  step: 0.01,
});

SimuladorVoo.attributes.add('musicVolume', {
  type: 'number',
  title: 'Volume da música',
  description: 'Volume inicial da trilha sonora dinâmica (0 = mudo, 1 = máximo).',
  default: 0.45,
  min: 0,
  max: 1,
  precision: 2,
  step: 0.05,
});

SimuladorVoo.attributes.add('sfxVolume', {
  type: 'number',
  title: 'Volume dos efeitos',
  description: 'Volume inicial dos efeitos sonoros e motores (0 = mudo, 1 = máximo).',
  default: 0.8,
  min: 0,
  max: 1,
  precision: 2,
  step: 0.05,
});

SimuladorVoo.attributes.add('showMinimap', {
  type: 'boolean',
  title: 'Mostrar minimapa',
  description: 'Exibe ou oculta o minimapa de Juiz de Fora no canto inferior esquerdo.',
  default: true,
});

SimuladorVoo.attributes.add('showFps', {
  type: 'boolean',
  title: 'Mostrar FPS',
  description: 'Exibe um contador leve de quadros por segundo (FPS) no canto da tela.',
  default: false,
});

SimuladorVoo.attributes.add('presentationMode', {
  type: 'boolean',
  title: 'Modo apresentação',
  description:
    'Ativa o modo apresentação (selo no HUD, atalhos F1–F6 para pular estágios/entrega final e +1h no relógio, sem contar recorde).',
  default: false,
});

SimuladorVoo.prototype.initialize = function (this: ClassicScript) {
  let styleEl: HTMLStyleElement | null = null;
  let uiEl: HTMLDivElement | null = null;
  let sim: FlightSimHandle | null = null;
  let loading: LoadingScreenHandle | null = null;
  let mountRaf: number | null = null;

  const readOptions = (): FlightSimOptions => ({
    dayDurationMinutes: this.dayDurationMinutes,
    difficulty: this.difficulty,
    mouseSensitivity: this.mouseSensitivity,
    musicVolume: this.musicVolume,
    sfxVolume: this.sfxVolume,
    showMinimap: this.showMinimap,
    showFps: this.showFps,
    presentationMode: this.presentationMode,
  });

  const syncOptions = () => {
    sim?.applyOptions(readOptions());
  };

  const unmount = () => {
    if (mountRaf !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(mountRaf);
      mountRaf = null;
    }
    sim?.destroy();
    sim = null;
    loading?.destroy();
    loading = null;
    uiEl?.remove();
    uiEl = null;
    styleEl?.remove();
    styleEl = null;
    if (instanceSlot[INSTANCE_KEY] === this) delete instanceSlot[INSTANCE_KEY];
  };

  const mount = () => {
    if (sim || uiEl || this.enabled === false) return;
    if (instanceSlot[INSTANCE_KEY] && instanceSlot[INSTANCE_KEY] !== this) {
      console.warn('[Delivered by Noon] script ligado mais de uma vez na cena; esta cópia não inicia.');
      return;
    }
    instanceSlot[INSTANCE_KEY] = this;

    const style = document.createElement('style');
    style.dataset.flightSim = 'true';
    style.textContent = cssText;
    document.head.appendChild(style);
    styleEl = style;

    const ui = document.createElement('div');
    ui.id = 'flight-sim-ui';
    ui.style.cssText = 'position:fixed;inset:0;z-index:100;pointer-events:none;';
    document.body.appendChild(ui);
    uiEl = ui;

    if (!this.app.keyboard) {
      const notice = document.createElement('div');
      notice.style.cssText =
        'position:fixed;top:24px;left:50%;transform:translateX(-50%);padding:14px 20px;border-radius:10px;' +
        'background:rgba(24,18,28,0.92);color:#ffcf7d;border:1px solid #ff9e4a;' +
        'font:600 14px/1.4 system-ui,sans-serif;text-align:center;z-index:9999;';
      notice.textContent =
        'Teclado desabilitado. Ative em Settings → Input → Keyboard no Editor do PlayCanvas e recarregue.';
      ui.appendChild(notice);
      return;
    }

    const loadingScreen = createLoadingScreen(ui);
    loading = loadingScreen;
    loadingScreen.setStage('editor', 'Preparando cena do PlayCanvas Editor…', true);

    const startNow = () => {
      mountRaf = null;
      if (sim || this.enabled === false || uiEl !== ui) return;
      sim = startFlightSim(this.app, ui, { ...readOptions(), loadingScreen });
    };

    if (typeof requestAnimationFrame === 'function') {
      mountRaf = requestAnimationFrame(startNow);
    } else {
      startNow();
    }
  };

  this.on('disable', unmount);
  this.on('enable', mount);
  this.on('attr', syncOptions);
  this.once('destroy', () => {
    this.off('disable', unmount);
    this.off('enable', mount);
    this.off('attr', syncOptions);
    unmount();
  });

  mount();
};
