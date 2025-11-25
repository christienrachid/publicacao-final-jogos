import * as me from "../../lib/melonjs.module.js";

export default class HordaHUD extends me.Container {
  constructor(sistemaHorda, jogador) {
    super(0, 16, 256, 20);

    this.sistemaHorda = sistemaHorda;
    this.jogador = jogador;
    this.floating = true;
    this.isPersistent = true;
    this.name = "hordaHUD";

    this.textoHorda = new me.Text(128, 220, {
      font: "EarlyGameBoy",
      size: 8,
      fillStyle: "#0F380F",
      textAlign: "center",
      textBaseline: "middle",
    });

    this.textoTempo = new me.Text(128, 10, {
      font: "EarlyGameBoy",
      size: 8,
      fillStyle: "#0F380F",
      textAlign: "center",
      textBaseline: "middle",
    });

    this.textoPontuacao = new me.Text(235, 10, {
      font: "EarlyGameBoy",
      size: 8,
      fillStyle: "#0F380F",
      textAlign: "right",
      textBaseline: "middle",
    });

    this.addChild(this.textoHorda);
    this.addChild(this.textoTempo);
    this.addChild(this.textoPontuacao);
  }

  draw(renderer) {
    super.draw(renderer);
  }

  update(dt) {
    this.textoHorda.setText(`Horda: ${this.sistemaHorda.hordaAtual}/20`);
    const tempoRestante = Math.ceil(this.sistemaHorda.tempoProximaHorda / 1000);
    this.textoTempo.setText(`${tempoRestante}s`);
    this.textoPontuacao.setText(`${this.jogador.pontuacao}`);

    return super.update(dt) || true;
  }
}
