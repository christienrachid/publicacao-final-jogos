import * as me from "../../lib/melonjs.module.js";

export default class Health extends me.Container {
  constructor(jogador) {
    super(24, 24, 128, 16);

    this.jogador = jogador;
    this.maxVidas = 4;
    this.coracoes = [];

    this.fundo = new me.Renderable(0, 0, 88, 16);
    this.fundo.alpha = 0.25;
    this.addChild(this.fundo);

    for (let i = 0; i < this.maxVidas; i++) {
      const coracao = new me.Sprite(i * 20, 0, {
        image: "heartsANDgold",
        framewidth: 16,
        frameheight: 16,
      });

      coracao.addAnimation("cheio", [0, 1, 2, 3], 150);
      coracao.addAnimation("vazio", [4, 5, 6, 7], 150);

      coracao.setCurrentAnimation("cheio");
      this.coracoes.push(coracao);
      this.addChild(coracao);
    }

    this.floating = true;
    this.isPersistent = true;
    this.name = "barraVida";
  }

  draw(renderer) {
    super.draw(renderer);
  }

  update(dt) {
    const vidasAtuais = Math.max(0, this.jogador.vida);

    for (let i = 0; i < this.maxVidas; i++) {
      const animacaoAtual = this.coracoes[i].current.name;
      const deveEstarCheio = i < vidasAtuais;

      if (deveEstarCheio && animacaoAtual !== "cheio") {
        this.coracoes[i].setCurrentAnimation("cheio");
      } else if (!deveEstarCheio && animacaoAtual !== "vazio") {
        this.coracoes[i].setCurrentAnimation("vazio");
      }
    }

    return super.update(dt);
  }
}
