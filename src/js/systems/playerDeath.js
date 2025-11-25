import * as me from "../../lib/melonjs.module.js";
import { mostrarGameOver } from "../ui/overlays.js";

class TelaPreta extends me.Renderable {
  constructor(player) {
    super(0, 0, 960, 960);

    this.floating = false;
    this.isPersistent = true;
    this.pos.z = 150;
    this.anchorPoint.set(0, 0);

    this.player = player;
    this.raioCirculo = 300;
    this.raioJusto = 40;
    this.velocidadeFase1 = 6;
    this.velocidadeFase3 = 4;
    this.callback = null;
    this.faseMorte = 0;
    this.inicioFechamento = null;
    this.tempoInicioParada = null;
  }

  iniciarFechamento(callback) {
    this.callback = callback;
    this.faseMorte = 1;
  }

  update(dt) {
    if (this.faseMorte === 1) {
      if (this.raioCirculo > this.raioJusto) {
        this.raioCirculo = Math.max(
          this.raioJusto,
          this.raioCirculo - this.velocidadeFase1
        );
      } else {
        this.raioCirculo = this.raioJusto;
        this.faseMorte = 2;
      }
    } else if (this.faseMorte === 2) {
    } else if (this.faseMorte === 3) {
      if (this.raioCirculo > 0) {
        this.raioCirculo = Math.max(0, this.raioCirculo - this.velocidadeFase3);
      } else {
        this.raioCirculo = 0;
        if (!this.tempoInicioParada) {
          this.tempoInicioParada = performance.now();
        } else if (performance.now() - this.tempoInicioParada >= 800) {
          if (this.callback) {
            this.callback();
            this.callback = null;
          }
        }
      }
    }

    return true;
  }

  draw(renderer) {
    renderer.save();
    renderer.setColor("#000000");

    const playerX = this.player.pos.x;
    const playerY = this.player.pos.y;
    const raio = this.raioCirculo;

    const vp = me.game.viewport;
    const margemExtra = 1000;

    const totalWidth = vp.width + margemExtra * 2;
    const totalHeight = vp.height + margemExtra * 2;
    const startX = vp.pos.x - margemExtra;
    const startY = vp.pos.y - margemExtra;

    for (let y = startY; y < startY + totalHeight; y += 2) {
      const distY = y - playerY;

      if (Math.abs(distY) > raio) {
        renderer.fillRect(startX, y, totalWidth, 2);
      } else {
        const distX = Math.sqrt(raio * raio - distY * distY);

        const leftWidth = playerX - distX - startX;
        if (leftWidth > 0) {
          renderer.fillRect(startX, y, leftWidth, 2);
        }

        const rightStart = playerX + distX;
        const rightWidth = startX + totalWidth - rightStart;
        if (rightWidth > 0) {
          renderer.fillRect(rightStart, y, rightWidth, 2);
        }
      }
    }

    renderer.restore();
  }
}

export default class PlayerDeath {
  constructor(jogador, sistemaHorda) {
    this.jogador = jogador;
    this.sistemaHorda = sistemaHorda;
    this.morto = false;
    this.animacaoMorte = null;
    this.gameOverMostrado = false;
  }

  verificarMorte() {
    if (this.morto) return true;

    if (this.jogador.vida <= 0 && !this.morto) {
      this.iniciarMorte();
      return true;
    }

    return false;
  }

  iniciarMorte() {
    this.morto = true;

    this.jogador.body.vel.x = 0;
    this.jogador.body.vel.y = 0;

    me.audio.unload("8bitMusic");
    me.audio.stopTrack();

    setTimeout(() => {
      me.audio.play("8bitGameOver", false, null, 0.5);
    }, 100);

    const inimigos = me.game.world
      .getChildByType(me.Sprite)
      .filter(
        (sprite) =>
          sprite.name === "rat" ||
          sprite.name === "slime" ||
          sprite.name === "bat"
      );
    inimigos.forEach((inimigo) => me.game.world.removeChild(inimigo));

    const projeteis = me.game.world
      .getChildren()
      .filter((child) => child.tipo === "projetil");
    projeteis.forEach((projetil) => me.game.world.removeChild(projetil));

    const drops = me.game.world
      .getChildren()
      .filter((child) => child.name === "heart" || child.name === "gold");
    drops.forEach((drop) => me.game.world.removeChild(drop));

    const huds = me.game.world.getChildByName("HordaHUD");
    huds.forEach((hud) => me.game.world.removeChild(hud));

    const healthBars = me.game.world.getChildByName("HealthBar");
    healthBars.forEach((bar) => me.game.world.removeChild(bar));

    const mascara = new TelaPreta(this.jogador);
    me.game.world.addChild(mascara);
    this.mascara = mascara;

    mascara.iniciarFechamento(() => {
      if (!this.gameOverMostrado) {
        this.gameOverMostrado = true;
        this.mostrarGameOver();
      }
    });

    const checkFase = () => {
      if (mascara.faseMorte === 2 && !this.animacaoMorte) {
        this.animacaoMorte = true;

        this.jogador.renderable.setCurrentAnimation("morte", () => {
          this.jogador.renderable.setCurrentAnimation("morte_parado");
          mascara.faseMorte = 3;
        });
      } else if (mascara.faseMorte < 2) {
        requestAnimationFrame(checkFase);
      }
    };
    checkFase();
  }

  mostrarGameOver() {
    mostrarGameOver(this.sistemaHorda.hordaAtual, this.jogador.pontuacao);
  }
}
