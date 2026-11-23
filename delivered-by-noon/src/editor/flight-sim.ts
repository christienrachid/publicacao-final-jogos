import { Script } from 'playcanvas';
import cssText from '../flight.css?inline';
import {
  startFlightSim,
  type DifficultyLevel,
  type FlightSimHandle,
  type FlightSimOptions,
} from '../flight/game';
import { createLoadingScreen, type LoadingScreenHandle } from '../flight/ui/loading';

/**
 * Opções de dificuldade expostas no Inspector do PlayCanvas Editor.
 * @enum {string}
 */
const DifficultyMode = {
  /** Fácil (+35% raio das entregas, +25% tempo) */
  Facil: 'facil',
  /** Normal (padrão do jogo) */
  Normal: 'normal',
  /** Difícil (-28% raio das entregas, -25% tempo) */
  Dificil: 'dificil',
} as const;

// Uma única instância do jogo por página (ver flight-sim-classic.ts).
const INSTANCE_KEY = '__deliveredByNoonInstance';
const instanceSlot = globalThis as unknown as Record<string, unknown>;

export class FlightSim extends Script {
  static scriptName = 'flightSim';

  /**
   * Quantos minutos reais dura o turno da manhã de 06:00 a 12:00 (padrão: 30).
   * @attribute
   * @title Duração do dia (min)
   * @type {number}
   * @range [2, 60]
   * @step 1
   * @precision 0
   */
  dayDurationMinutes = 30;

  /**
   * Ajusta o raio de aceitação das entregas e o tempo disponível até o meio-dia.
   * @attribute
   * @title Dificuldade
   * @type {DifficultyMode}
   */
  difficulty: DifficultyLevel = DifficultyMode.Normal;

  /**
   * Sensibilidade do mouse para a mira de voo do A-29 e rotação de câmera.
   * @attribute
   * @title Sensibilidade do mouse (A-29)
   * @type {number}
   * @range [0.05, 0.4]
   * @step 0.01
   * @precision 2
   */
  mouseSensitivity = 0.15;

  /**
   * Volume inicial da trilha sonora dinâmica (0 = mudo, 1 = máximo).
   * @attribute
   * @title Volume da música
   * @type {number}
   * @range [0, 1]
   * @step 0.05
   * @precision 2
   */
  musicVolume = 0.45;

  /**
   * Volume inicial dos efeitos sonoros e motores (0 = mudo, 1 = máximo).
   * @attribute
   * @title Volume dos efeitos
   * @type {number}
   * @range [0, 1]
   * @step 0.05
   * @precision 2
   */
  sfxVolume = 0.8;

  /**
   * Exibe ou oculta o minimapa de Juiz de Fora no canto inferior esquerdo.
   * @attribute
   * @title Mostrar minimapa
   * @type {boolean}
   */
  showMinimap = true;

  /**
   * Exibe um contador leve de quadros por segundo (FPS) no canto da tela.
   * @attribute
   * @title Mostrar FPS
   * @type {boolean}
   */
  showFps = false;

  /**
   * Ativa o modo apresentação (selo no HUD, atalhos F1–F6 para pular estágios/entrega final e +1h no relógio, sem contar recorde).
   * @attribute
   * @title Modo apresentação
   * @type {boolean}
   */
  presentationMode = false;

  private styleEl: HTMLStyleElement | null = null;
  private uiEl: HTMLDivElement | null = null;
  private sim: FlightSimHandle | null = null;
  private loading: LoadingScreenHandle | null = null;
  private mountRaf: number | null = null;

  private readOptions(): FlightSimOptions {
    return {
      dayDurationMinutes: this.dayDurationMinutes,
      difficulty: this.difficulty,
      mouseSensitivity: this.mouseSensitivity,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      showMinimap: this.showMinimap,
      showFps: this.showFps,
      presentationMode: this.presentationMode,
    };
  }

  private syncOptions() {
    this.sim?.applyOptions(this.readOptions());
  }

  private mountSim() {
    if (this.sim || this.uiEl || !this.enabled) return;
    if (instanceSlot[INSTANCE_KEY] && instanceSlot[INSTANCE_KEY] !== this) {
      console.warn('[Delivered by Noon] script ligado mais de uma vez na cena; esta cópia não inicia.');
      return;
    }
    instanceSlot[INSTANCE_KEY] = this;

    const style = document.createElement('style');
    style.dataset.flightSim = 'true';
    style.textContent = cssText;
    document.head.appendChild(style);
    this.styleEl = style;

    const ui = document.createElement('div');
    ui.id = 'flight-sim-ui';
    ui.style.position = 'fixed';
    ui.style.inset = '0';
    ui.style.zIndex = '100';
    ui.style.pointerEvents = 'none';
    document.body.appendChild(ui);
    this.uiEl = ui;

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
    this.loading = loadingScreen;
    loadingScreen.setStage('editor', 'Preparando cena do PlayCanvas Editor…', true);

    const startNow = () => {
      this.mountRaf = null;
      if (this.sim || !this.enabled || this.uiEl !== ui) return;
      this.sim = startFlightSim(this.app, ui, { ...this.readOptions(), loadingScreen });
    };

    if (typeof requestAnimationFrame === 'function') {
      this.mountRaf = requestAnimationFrame(startNow);
    } else {
      startNow();
    }
  }

  private unmountSim() {
    if (this.mountRaf !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.mountRaf);
      this.mountRaf = null;
    }
    this.sim?.destroy();
    this.sim = null;
    this.loading?.destroy();
    this.loading = null;
    this.uiEl?.remove();
    this.uiEl = null;
    this.styleEl?.remove();
    this.styleEl = null;
    if (instanceSlot[INSTANCE_KEY] === this) delete instanceSlot[INSTANCE_KEY];
  }

  initialize() {
    this.on('disable', this.unmountSim, this);
    this.on('enable', this.mountSim, this);
    this.on('attr', this.syncOptions, this);
    this.once('destroy', () => {
      this.off('disable', this.unmountSim, this);
      this.off('enable', this.mountSim, this);
      this.off('attr', this.syncOptions, this);
      this.unmountSim();
    });

    this.mountSim();
  }
}
