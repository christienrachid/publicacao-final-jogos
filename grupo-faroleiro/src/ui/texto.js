import { BitmapText } from "melonjs";
import { desenharSprite } from "../entities/folha.js";
import { dadosDoEstilo } from "../systems/estilo.js";

// Texto da interface na fonte de pixel "pixel" (BitmapText), sempre com a
// sombra de 1 px abaixo na cor da escuridão do tema. `tamanho` é inteiro
// (1 = 11 px de altura de linha, 2 = o dobro), para os pixels ficarem nítidos.
export class Rotulo {
    constructor(texto = "", tamanho = 1) {
        this.bitmap = new BitmapText(0, 0, { font: "pixel", text: texto, size: tamanho });
        this.atual = texto;
        this.medida = null;
    }

    get texto() {
        return this.atual;
    }

    // só refaz o texto quando muda (setText refaz o layout das letras)
    set texto(valor) {
        const novo = String(valor);
        if (novo !== this.atual) {
            this.atual = novo;
            this.bitmap.setText(novo);
            this.medida = null;
        }
    }

    medir() {
        if (this.medida === null) {
            const m = this.bitmap.measureText();
            this.medida = { largura: Math.round(m.width), altura: Math.round(m.height) };
        }
        return this.medida;
    }

    get largura() {
        return this.medir().largura;
    }

    get altura() {
        return this.medir().altura;
    }

    // Desenha com a sombra. x é o canto esquerdo, o centro ou a borda
    // direita, conforme o alinhamento ("esquerda", "centro", "direita");
    // y é o topo da linha.
    desenhar(renderer, x, y, { cor, sombra, opacidade = 1, alinhamento = "esquerda" } = {}) {
        const { jogo } = dadosDoEstilo();
        let esquerda = x;
        if (alinhamento === "centro") {
            esquerda = x - this.largura / 2;
        } else if (alinhamento === "direita") {
            esquerda = x - this.largura;
        }
        // posição inteira: meio pixel borra a fonte
        esquerda = Math.round(esquerda);
        const topo = Math.round(y);
        const b = this.bitmap;
        b.alpha = opacidade;
        b.fillStyle = sombra ?? jogo.escuridao;
        b.pos.set(esquerda, topo + 1);
        desenharSprite(renderer, b);
        b.fillStyle = cor ?? jogo.texto;
        b.pos.set(esquerda, topo);
        desenharSprite(renderer, b);
    }

    destroy() {
        this.bitmap.destroy();
    }
}
