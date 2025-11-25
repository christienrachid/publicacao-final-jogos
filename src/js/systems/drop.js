import * as me from "../../lib/melonjs.module.js";

class Heart extends me.Entity {
  constructor(x, y) {
    super(x, y, {
      width: 20,
      height: 20,
    });

    this.name = "heart";
    this.body.setCollisionMask(me.collision.types.PLAYER_OBJECT);
    this.body.collisionType = me.collision.types.COLLECTABLE_OBJECT;
    this.body.setStatic(true);

    this.pos.z = 4;
    this.anchorPoint.set(0, 0);

    this.tempoVida = 8000;
    this.tempoInicio = performance.now();
    this.tempoPiscando = 6000;

    this.renderable = new me.Sprite(0, 0, {
      image: "heartsANDgold",
      framewidth: 16,
      frameheight: 16,
    });
    this.renderable.addAnimation("idle", [0, 1, 2, 3], 150);
    this.renderable.setCurrentAnimation("idle");

    this.alwaysUpdate = true;
  }

  update(dt) {
    const tempoDecorrido = performance.now() - this.tempoInicio;

    if (tempoDecorrido >= this.tempoVida) {
      me.game.world.removeChild(this);
      return false;
    }

    if (tempoDecorrido >= this.tempoPiscando) {
      this.alpha = Math.floor(tempoDecorrido / 100) % 2 === 0 ? 1 : 0.3;
    }

    this.body.update(dt);
    return super.update(dt);
  }

  onCollision(response, other) {
    if (
      other.body &&
      other.body.collisionType === me.collision.types.PLAYER_OBJECT
    ) {
      if (other.vida < 4) {
        other.vida = Math.min(4, other.vida + 1);
        me.audio.play("8bitPowerUp", false, null, 0.3);
      }
      me.game.world.removeChild(this);
    }
    return true;
  }
}

class Gold extends me.Entity {
  constructor(x, y) {
    super(x, y, {
      width: 20,
      height: 20,
    });

    this.name = "gold";
    this.body.setCollisionMask(me.collision.types.PLAYER_OBJECT);
    this.body.collisionType = me.collision.types.COLLECTABLE_OBJECT;
    this.body.setStatic(true);

    this.pos.z = 4;
    this.anchorPoint.set(0, 0);

    this.tempoVida = 10000;
    this.tempoInicio = performance.now();
    this.tempoPiscando = 8000;
    this.valorOuro = 10;

    this.renderable = new me.Sprite(0, 0, {
      image: "heartsANDgold",
      framewidth: 16,
      frameheight: 16,
    });
    this.renderable.addAnimation("idle", [8, 9, 10, 11], 150);
    this.renderable.setCurrentAnimation("idle");

    this.alwaysUpdate = true;
  }

  update(dt) {
    const tempoDecorrido = performance.now() - this.tempoInicio;

    if (tempoDecorrido >= this.tempoVida) {
      me.game.world.removeChild(this);
      return false;
    }

    if (tempoDecorrido >= this.tempoPiscando) {
      this.alpha = Math.floor(tempoDecorrido / 100) % 2 === 0 ? 1 : 0.3;
    }

    this.body.update(dt);
    return super.update(dt);
  }

  onCollision(response, other) {
    if (
      other.body &&
      other.body.collisionType === me.collision.types.PLAYER_OBJECT
    ) {
      if (other.pontuacao !== undefined) {
        other.pontuacao += this.valorOuro;
        me.audio.play("8bitPowerUp", false, null, 0.3);
        me.game.world.removeChild(this);
      }
    }
    return true;
  }
}

export class SistemaDrop {
  static dropHeart(x, y, chance = 0.04) {
    if (Math.random() < chance) {
      const heart = new Heart(x, y);
      me.game.world.addChild(heart);
    }
  }

  static dropGold(x, y, chance = 0.12) {
    if (Math.random() < chance) {
      const gold = new Gold(x, y);
      me.game.world.addChild(gold);
    }
  }
}
