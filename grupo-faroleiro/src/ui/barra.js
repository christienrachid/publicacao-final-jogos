import { math } from "melonjs";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo } from "../systems/estilo.js";
import { Rotulo } from "./texto.js";

// Barra de vida (mini-chefes, chefes, torre): moldura escura, trilho fraco,
// a vida na cor pedida e um rastro claro do dano recente que encolhe aos
// poucos. Uso:
//   const barra = new BarraDeVida({ largura: 160, rotulo: "Kraken" });
//   barra.definir(vida / vidaMaxima);      // quando a vida muda
//   barra.atualizar(dt);                   // todo quadro (o rastro)
//   barra.desenhar(renderer, x, y);        // x, y = canto da barra
export class BarraDeVida {
    constructor({ largura = 120, altura = 6, rotulo = "" } = {}) {
        this.largura = largura;
        this.altura = altura;
        this.fracao = 1;
        this.rastro = 1;
        this.rotulo = rotulo === "" ? null : new Rotulo(rotulo);
    }

    // Vida de 0 a 1. Subir de vida não deixa rastro.
    definir(fracao) {
        this.fracao = Math.min(1, Math.max(0, fracao));
        if (this.fracao > this.rastro) {
            this.rastro = this.fracao;
        }
    }

    atualizar(dt) {
        // o rastro alcança a vida em cerca de meio segundo
        this.rastro = math.damp(this.rastro, this.fracao, 6, dt / 1000);
    }

    // Desenha com o rótulo (se houver) em cima da barra. `cor` muda a cor
    // da vida (o padrão é o destaque do tema).
    desenhar(renderer, x, y, { cor } = {}) {
        const { jogo } = dadosDoEstilo();
        let topo = Math.round(y);
        const esquerda = Math.round(x);
        if (this.rotulo !== null) {
            this.rotulo.desenhar(renderer, esquerda, topo);
            topo += this.rotulo.altura + 2;
        }
        pintar(renderer, jogo.escuridao, esquerda - 1, topo - 1, this.largura + 2, this.altura + 2, 0.9);
        pintar(renderer, jogo.textoFraco, esquerda, topo, this.largura, this.altura, 0.35);
        const rastro = Math.round(this.largura * this.rastro);
        if (rastro > 0) {
            pintar(renderer, jogo.texto, esquerda, topo, rastro, this.altura, 0.75);
        }
        const vida = Math.round(this.largura * this.fracao);
        if (vida > 0) {
            pintar(renderer, cor ?? jogo.destaque, esquerda, topo, vida, this.altura);
            // brilho de 1 px no alto da barra
            pintar(renderer, jogo.texto, esquerda, topo, vida, 1, 0.35);
        }
    }

    destroy() {
        this.rotulo?.destroy();
    }
}
