import * as me from "../../lib/melonjs.module.js";
import Rat from "../enemy/rat.js";
import Slime from "../enemy/slime.js";
import Bat from "../enemy/bat.js";
import { mostrarVitoria } from "../ui/overlays.js";

export default class SistemaHorda {
  constructor(jogador, entidadesJogo) {
    this.jogador = jogador;
    this.entidadesJogo = entidadesJogo;
    this.hordaAtual = 1;
    this.maxHordas = 20;
    this.intervaloHorda = 30000;
    this.tempoProximaHorda = this.intervaloHorda;
    this.jogoVencido = false;
    this.vitoriaMostrada = false;
    this.inimigosPorHorda = {
      rat: 0,
      slime: 0,
      bat: 0,
    };
    this.calcularInimigosDaHorda();
  }

  calcularInimigosDaHorda() {
    const nivel = this.hordaAtual;

    this.inimigosPorHorda.rat = Math.min(2 + Math.floor(nivel * 1.2), 10);
    this.inimigosPorHorda.slime = Math.min(Math.floor(nivel * 0.6), 6);
    this.inimigosPorHorda.bat = Math.min(Math.floor(nivel * 0.3), 4);
  }

  gerarInimigo(tipo) {
    const limites = me.game.world.mapBounds;
    const margem = 20;

    const borda = Math.floor(Math.random() * 4);
    let x, y;

    switch (borda) {
      case 0:
        x = Math.random() * limites.largura;
        y = -margem;
        break;
      case 1:
        x = Math.random() * limites.largura;
        y = limites.altura + margem;
        break;
      case 2:
        x = -margem;
        y = Math.random() * limites.altura;
        break;
      case 3:
        x = limites.largura + margem;
        y = Math.random() * limites.altura;
        break;
    }

    let inimigo;
    switch (tipo) {
      case "rat":
        inimigo = new Rat(x, y, this.jogador);
        break;
      case "slime":
        inimigo = new Slime(x, y, this.jogador);
        break;
      case "bat":
        inimigo = new Bat(x, y, this.jogador);
        break;
    }

    if (inimigo) {
      inimigo.pos.z = 3;
      inimigo.containerPai = this.entidadesJogo;
      this.entidadesJogo.addChild(inimigo);
    }
  }

  gerarHorda() {
    for (let i = 0; i < this.inimigosPorHorda.rat; i++) {
      setTimeout(() => this.gerarInimigo("rat"), i * 200);
    }

    for (let i = 0; i < this.inimigosPorHorda.slime; i++) {
      setTimeout(() => this.gerarInimigo("slime"), i * 300);
    }

    for (let i = 0; i < this.inimigosPorHorda.bat; i++) {
      setTimeout(() => this.gerarInimigo("bat"), i * 400);
    }
  }

  update(dt) {
    if (this.jogoVencido) return;

    this.tempoProximaHorda -= dt;

    const inimigosVivos = this.entidadesJogo
      .getChildren()
      .filter(
        (child) =>
          child.body &&
          child.body.collisionType === me.collision.types.ENEMY_OBJECT &&
          !child.morto
      ).length;

    if (inimigosVivos === 0 && this.hordaAtual > 0) {
      if (this.hordaAtual < this.maxHordas) {
        this.hordaAtual++;
        this.calcularInimigosDaHorda();
        this.gerarHorda();
        this.tempoProximaHorda = this.intervaloHorda;
      } else if (!this.vitoriaMostrada) {
        this.jogoVencido = true;
        this.vitoriaMostrada = true;
        this.mostrarVitoria();
      }
      return;
    }

    if (this.tempoProximaHorda <= 0) {
      if (this.hordaAtual < this.maxHordas) {
        this.hordaAtual++;
        this.calcularInimigosDaHorda();
        this.gerarHorda();
        this.tempoProximaHorda = this.intervaloHorda;
      } else if (!this.vitoriaMostrada) {
        this.jogoVencido = true;
        this.vitoriaMostrada = true;
        this.mostrarVitoria();
      }
    }
  }

  mostrarVitoria() {
    me.audio.unload("8bitMusic");
    me.audio.stopTrack();

    setTimeout(() => {
      me.audio.play("8bitVictory", false, null, 0.5);
    }, 100);

    const telaBranca = new me.Renderable(0, 0, 960, 960);
    telaBranca.floating = false;
    telaBranca.pos.z = 150;
    telaBranca.anchorPoint.set(0, 0);
    telaBranca.alpha = 0;
    telaBranca.tempoDecorrido = 0;
    telaBranca.faseVitoria = 1;

    telaBranca.update = function (dt) {
      this.tempoDecorrido += dt;

      if (this.faseVitoria === 1) {
        this.alpha = Math.min(1, this.tempoDecorrido / 600);
        if (this.alpha >= 1) {
          this.faseVitoria = 2;
          this.tempoDecorrido = 0;
        }
      } else if (this.faseVitoria === 2) {
        if (this.tempoDecorrido >= 400) {
          this.faseVitoria = 3;
        }
      }
      return true;
    };

    telaBranca.draw = function (renderer) {
      renderer.save();
      renderer.setColor("#9BBC0F");
      renderer.setGlobalAlpha(this.alpha);

      const vp = me.game.viewport;
      const margemExtra = 1000;
      const totalWidth = vp.width + margemExtra * 2;
      const totalHeight = vp.height + margemExtra * 2;
      const startX = vp.pos.x - margemExtra;
      const startY = vp.pos.y - margemExtra;

      renderer.fillRect(startX, startY, totalWidth, totalHeight);

      renderer.restore();
    };

    me.game.world.addChild(telaBranca);

    setTimeout(() => {
      mostrarVitoria(this.maxHordas, this.jogador.pontuacao);
    }, 1000);
  }
}
