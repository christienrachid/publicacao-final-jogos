import * as me from "../../lib/melonjs.module.js";
import { SistemaDrop } from "../systems/drop.js";

export default class Bat extends me.Entity {
  constructor(x, y, jogador) {
    super(x, y, {
      width: 16,
      height: 16,
    });

    this.jogador = jogador;
    this.vida = 50;
    this.velocidade = 0.3;
    this.dano = 1;
    this.estadoAtual = "andar";
    this.distanciaAtaque = 10;
    this.morto = false;
    this.direcao = "direita";
    this.danoAplicado = false;
    this.containerPai = null;

    if (!Bat.ultimoSomHit) Bat.ultimoSomHit = 0;
    if (!Bat.ultimoSomMorte) Bat.ultimoSomMorte = 0;

    this.alwaysUpdate = true;

    this.body.gravityScale = 0;
    this.body.setMaxVelocity(1, 1);
    this.body.setFriction(0, 0);

    this.body.collisionType = me.collision.types.ENEMY_OBJECT;
    this.body.setCollisionMask(
      me.collision.types.PLAYER_OBJECT | me.collision.types.PROJECTILE_OBJECT
    );

    this.renderable = new me.Sprite(0, 0, {
      image: "bat",
      framewidth: 16,
      frameheight: 16,
    });
    this.renderable.anchorPoint.set(0.5, 0.5);

    this.criarAnimacoes();
    this.renderable.setCurrentAnimation("andar_direita");

    this.intervaloPiscar = null;
  }

  criarAnimacoes() {
    this.renderable.addAnimation("andar_direita", [0, 1, 2], 100);
    this.renderable.addAnimation("andar_esquerda", [4, 5, 6], 100);

    this.renderable.addAnimation("atacar_direita", [8, 9], 100);
    this.renderable.addAnimation("atacar_esquerda", [12, 13], 100);

    this.renderable.addAnimation("morte_direita", [16, 17, 18, 19], 100);
    this.renderable.addAnimation("morte_esquerda", [20, 21, 22, 23], 100);
  }

  update(dt) {
    if (this.morto) {
      return super.update(dt);
    }

    const dx = this.jogador.pos.x - this.pos.x;
    const dy = this.jogador.pos.y - this.pos.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);

    this.direcao = dx > 0 ? "direita" : "esquerda";

    if (distancia < this.distanciaAtaque) {
      this.atacar();
    } else {
      this.perseguir(dx, dy, distancia);
    }

    this.body.update(dt);
    return super.update(dt) || true;
  }

  perseguir(dx, dy, distancia) {
    const velX = (dx / distancia) * this.velocidade;
    const velY = (dy / distancia) * this.velocidade;

    this.body.vel.x = velX;
    this.body.vel.y = velY;

    if (this.estadoAtual !== "andar") {
      this.estadoAtual = "andar";
      this.danoAplicado = false;
    }

    const animacao = `andar_${this.direcao}`;
    if (this.renderable.current.name !== animacao) {
      this.renderable.setCurrentAnimation(animacao);
    }
  }

  atacar() {
    this.body.vel.x = 0;
    this.body.vel.y = 0;

    if (this.estadoAtual !== "atacar") {
      this.estadoAtual = "atacar";
      this.danoAplicado = false;
    }

    const animacao = `atacar_${this.direcao}`;
    if (this.renderable.current.name !== animacao) {
      this.renderable.setCurrentAnimation(animacao);
      this.danoAplicado = false;
    }

    const frameAtual = this.renderable.current.idx;
    if (frameAtual === 1 && !this.danoAplicado) {
      this.causarDano();
      this.danoAplicado = true;
    }
  }

  causarDano() {
    const dx = this.jogador.pos.x - this.pos.x;
    const dy = this.jogador.pos.y - this.pos.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);

    if (distancia < this.distanciaAtaque && this.jogador.tomarDano) {
      this.jogador.tomarDano(this.dano);
    }
  }

  tomarDano(quantidade) {
    if (this.morto) return;

    this.vida -= quantidade;

    if (this.vida <= 0) {
      this.morrer();
    } else {
      const agora = Date.now();
      if (agora - Bat.ultimoSomHit > 100) {
        me.audio.play("8bitEnemyHit", false, null, 0.3);
        Bat.ultimoSomHit = agora;
      }
      this.piscar();
    }
  }

  piscar() {
    if (this.intervaloPiscar) {
      clearInterval(this.intervaloPiscar);
    }

    const spriteOriginal = this.renderable;
    let piscadas = 0;
    this.intervaloPiscar = setInterval(() => {
      if (!spriteOriginal || this.morto) {
        clearInterval(this.intervaloPiscar);
        this.intervaloPiscar = null;
        return;
      }
      spriteOriginal.alpha = spriteOriginal.alpha === 1 ? 0.3 : 1;
      piscadas++;
      if (piscadas >= 6) {
        clearInterval(this.intervaloPiscar);
        this.intervaloPiscar = null;
        spriteOriginal.alpha = 1;
      }
    }, 80);
  }

  morrer() {
    if (this.morto) return;

    if (this.intervaloPiscar) {
      clearInterval(this.intervaloPiscar);
      this.intervaloPiscar = null;
    }

    if (this.jogador && this.jogador.pontuacao !== undefined) {
      this.jogador.pontuacao += 10;
    }

    SistemaDrop.dropGold(this.pos.x, this.pos.y, 0.35);
    SistemaDrop.dropHeart(this.pos.x, this.pos.y, 0.15);

    const agora = Date.now();
    if (agora - Bat.ultimoSomMorte > 100) {
      me.audio.play("8bitEnemyDeath", false, null, 0.4);
      Bat.ultimoSomMorte = agora;
    }

    this.morto = true;
    this.estadoAtual = "morte";
    this.body.vel.x = 0;
    this.body.vel.y = 0;

    if (this.ancestor) {
      this.ancestor.removeChild(this);
    }
  }
  onCollision(response, other) {
    if (other.tipo === "projetil") {
      this.tomarDano(other.dano || 1);
      return false;
    }
    return true;
  }
}
