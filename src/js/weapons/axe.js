import * as me from "../../lib/melonjs.module.js";

export default class Axe extends me.Entity {
  constructor(x, y, direcao, dano, jogador) {
    super(x, y, {
      width: 16,
      height: 16,
    });

    this.tipo = "projetil";
    this.dano = dano;
    this.velocidade = 1.5;
    this.direcao = direcao;
    this.jogador = jogador;
    this.inimigosAcertadosIda = new Set();
    this.inimigosAcertadosVolta = new Set();
    this.distanciaPercorrida = 0;
    this.distanciaMaxima = 100;
    this.retornando = false;

    this.body.gravityScale = 0;
    this.body.collisionType = me.collision.types.PROJECTILE_OBJECT;
    this.body.setCollisionMask(me.collision.types.ENEMY_OBJECT);

    this.renderable = new me.Sprite(0, 0, {
      image: "axe",
      framewidth: 16,
      frameheight: 16,
    });
    this.renderable.anchorPoint.set(0.5, 0.5);
    this.renderable.addAnimation("girar", [0, 1, 2, 3, 4, 5, 6, 7], 100);
    this.renderable.setCurrentAnimation("girar");

    this.definirVelocidade();

    this.alwaysUpdate = true;
  }

  definirVelocidade() {
    const velocidades = {
      baixo: { x: 0, y: 1 },
      baixo_esquerda: { x: -0.707, y: 0.707 },
      esquerda: { x: -1, y: 0 },
      cima_esquerda: { x: -0.707, y: -0.707 },
      cima: { x: 0, y: -1 },
      cima_direita: { x: 0.707, y: -0.707 },
      direita: { x: 1, y: 0 },
      baixo_direita: { x: 0.707, y: 0.707 },
    };

    const vel = velocidades[this.direcao] || { x: 1, y: 0 };
    this.body.vel.x = vel.x * this.velocidade;
    this.body.vel.y = vel.y * this.velocidade;
  }

  update(dt) {
    if (!this.retornando) {
      this.pos.x += this.body.vel.x;
      this.pos.y += this.body.vel.y;

      const velX = Math.abs(this.body.vel.x);
      const velY = Math.abs(this.body.vel.y);
      this.distanciaPercorrida += Math.sqrt(velX * velX + velY * velY);

      const bounds = me.game.world.mapBounds;
      const margem = 16;
      if (bounds) {
        if (
          this.pos.x < margem ||
          this.pos.x > bounds.largura - margem ||
          this.pos.y < margem ||
          this.pos.y > bounds.altura - margem
        ) {
          this.retornando = true;
          this.inimigosAcertadosVolta.clear();
        }
      }

      if (this.distanciaPercorrida >= this.distanciaMaxima) {
        this.retornando = true;
        this.inimigosAcertadosVolta.clear();
      }
    } else {
      const dx =
        this.jogador.pos.x +
        this.jogador.width / 2 -
        (this.pos.x + this.width / 2);
      const dy =
        this.jogador.pos.y +
        this.jogador.height / 2 -
        (this.pos.y + this.height / 2);
      const distancia = Math.sqrt(dx * dx + dy * dy);

      if (distancia < 16) {
        me.game.world.removeChild(this);
        return false;
      }

      const velocidadeRetorno = 2;
      this.body.vel.x = (dx / distancia) * velocidadeRetorno;
      this.body.vel.y = (dy / distancia) * velocidadeRetorno;

      this.pos.x += this.body.vel.x;
      this.pos.y += this.body.vel.y;
    }

    this.verificarColisoes();

    return super.update(dt) || true;
  }

  verificarColisoes() {
    const inimigos = me.game.world
      .getChildren()
      .filter(
        (child) =>
          child.body &&
          child.body.collisionType === me.collision.types.ENEMY_OBJECT &&
          !child.morto
      );

    for (const inimigo of inimigos) {
      const listaColisoes = this.retornando
        ? this.inimigosAcertadosVolta
        : this.inimigosAcertadosIda;

      const machadoCentroX = this.pos.x + this.width / 2;
      const machadoCentroY = this.pos.y + this.height / 2;
      const inimigoCentroX = inimigo.pos.x + inimigo.width / 2;
      const inimigoCentroY = inimigo.pos.y + inimigo.height / 2;

      const dx = machadoCentroX - inimigoCentroX;
      const dy = machadoCentroY - inimigoCentroY;
      const distancia = Math.sqrt(dx * dx + dy * dy);

      if (distancia < 16 && !listaColisoes.has(inimigo)) {
        listaColisoes.add(inimigo);
        if (inimigo.tomarDano) {
          inimigo.tomarDano(this.dano);
        }
      }
    }
  }
}
