import * as me from "../../lib/melonjs.module.js";
import Axe from "../weapons/axe.js";

export default class Player extends me.Entity {
  constructor(x, y) {
    super(x, y, {
      width: 16,
      height: 16,
      framewidth: 16,
      frameheight: 16,
    });

    this.z = 3;

    this.body.gravityScale = 0;

    this.renderable = new me.Sprite(0, 0, {
      image: "player",
      framewidth: 16,
      frameheight: 16,
    });

    this.velocidade = 0.35;
    this.ultimaDirecao = "baixo";
    this.vida = 4;
    this.pontuacao = 0;
    this.morto = false;
    this.invulneravel = false;
    this.tempoInvulnerabilidade = 0;
    this.duracaoInvulnerabilidade = 1000;
    this.podeAtacar = true;
    this.intervaloAtaque = 500;
    this.tempoUltimoAtaque = 0;

    this.criarAnimacoesDirecao();
    this.renderable.setCurrentAnimation("parado_baixo");

    me.event.on(me.event.KEYDOWN, (action, keyCode) => {
      if (action === "attack") {
        this.tentarAtacar();
      } else if (action === "debug_damage") {
        this.aplicarDanoTeste();
      }
    });

    this.body.setMaxVelocity(2, 2);
    this.body.setFriction(0, 0);

    this.body.collisionType = me.collision.types.PLAYER_OBJECT;
    this.body.setCollisionMask(
      me.collision.types.WORLD_SHAPE | me.collision.types.COLLECTABLE_OBJECT
    );
  }

  criarAnimacoesDirecao() {
    const direcoes = [
      "baixo",
      "baixo_esquerda",
      "esquerda",
      "cima_esquerda",
      "cima",
      "cima_direita",
      "direita",
      "baixo_direita",
    ];

    direcoes.forEach((direcao, i) => {
      const base = i * 4;

      this.renderable.addAnimation(`parado_${direcao}`, [base]);
      this.renderable.addAnimation(
        `andar_${direcao}`,
        [base, base + 1, base + 2, base + 3],
        100
      );
    });

    this.renderable.addAnimation("morte", [32, 33, 34], 150);
    this.renderable.addAnimation("morte_parado", [34]);
  }

  update(dt) {
    if (this.morto) {
      return super.update(dt);
    }

    const agora = performance.now();
    let dx = 0,
      dy = 0;

    if (me.input.isKeyPressed("up")) dy = -1;
    if (me.input.isKeyPressed("down")) dy = 1;
    if (me.input.isKeyPressed("left")) dx = -1;
    if (me.input.isKeyPressed("right")) dx = 1;

    const direcao = this.obterDirecao(dx, dy);

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    this.body.vel.x = dx * this.velocidade;
    this.body.vel.y = dy * this.velocidade;

    let animacaoEsperada;
    if (this.body.vel.x !== 0 || this.body.vel.y !== 0) {
      animacaoEsperada = "andar_" + direcao;
      this.ultimaDirecao = direcao;
    } else {
      const direcaoParada = ["baixo", "cima", "esquerda", "direita"].includes(
        this.ultimaDirecao
      )
        ? this.ultimaDirecao
        : "baixo";
      animacaoEsperada = "parado_" + direcaoParada;
    }

    if (this.renderable.current.name !== animacaoEsperada) {
      this.renderable.setCurrentAnimation(animacaoEsperada);
    }

    const updated = this.body.update(dt);

    if (this.invulneravel) {
      if (
        agora - this.tempoInvulnerabilidade >=
        this.duracaoInvulnerabilidade
      ) {
        this.invulneravel = false;
        this.renderable.alpha = 1;
      } else {
        this.renderable.alpha = Math.sin(agora * 0.02) > 0 ? 0.3 : 1;
      }
    }

    if (me.game.world.mapBounds) {
      const bounds = me.game.world.mapBounds;

      const margemReal = 16;

      if (this.pos.x < margemReal) {
        this.pos.x = margemReal;
        this.body.vel.x = 0;
      }
      if (this.pos.x + this.width > bounds.largura - margemReal) {
        this.pos.x = bounds.largura - margemReal - this.width;
        this.body.vel.x = 0;
      }
      if (this.pos.y < margemReal) {
        this.pos.y = margemReal;
        this.body.vel.y = 0;
      }
      if (this.pos.y + this.height > bounds.altura - margemReal) {
        this.pos.y = bounds.altura - margemReal - this.height;
        this.body.vel.y = 0;
      }
    }

    return super.update(dt) || updated;
  }

  obterDirecao(dx, dy) {
    if (dx === 0 && dy === 1) return "baixo";
    if (dx === -1 && dy === 1) return "baixo_esquerda";
    if (dx === -1 && dy === 0) return "esquerda";
    if (dx === -1 && dy === -1) return "cima_esquerda";
    if (dx === 0 && dy === -1) return "cima";
    if (dx === 1 && dy === -1) return "cima_direita";
    if (dx === 1 && dy === 0) return "direita";
    if (dx === 1 && dy === 1) return "baixo_direita";
    return this.ultimaDirecao;
  }

  tentarAtacar() {
    const agora = performance.now();
    if (
      this.podeAtacar &&
      agora - this.tempoUltimoAtaque >= this.intervaloAtaque
    ) {
      const machadoExistente = me.game.world
        .getChildren()
        .find((child) => child.tipo === "projetil");

      if (!machadoExistente) {
        this.atacar();
        this.tempoUltimoAtaque = agora;
      }
    }
  }

  atacar() {
    const offsetX = this.pos.x + this.width / 2 - 8;
    const offsetY = this.pos.y + this.height / 2 - 8;

    me.audio.play("8bitAxeThrow", false, null, 0.4);

    const axe = new Axe(offsetX, offsetY, this.ultimaDirecao, 1, this);
    axe.pos.z = this.pos.z;
    me.game.world.addChild(axe);
  }

  aplicarDanoTeste(quantidade = 1) {
    const estavaInvulneravel = this.invulneravel;
    this.invulneravel = false;
    this.tomarDano(quantidade);
    this.invulneravel = estavaInvulneravel;
  }

  tomarDano(quantidade = 1) {
    if (this.invulneravel) {
      return;
    }

    this.vida -= quantidade;

    me.audio.play("8bitPlayerHurt", false, null, 0.5);

    this.invulneravel = true;
    this.tempoInvulnerabilidade = performance.now();

    if (this.vida <= 0) {
      this.vida = 0;
      this.morrer();
    }
  }

  morrer() {
    this.morto = true;
  }

  onCollision(response, other) {
    if (
      other.body &&
      other.body.collisionType === me.collision.types.COLLECTABLE_OBJECT
    ) {
      return true;
    }
    return false;
  }
}
