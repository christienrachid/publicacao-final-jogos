import { loader } from "melonjs";
import { imagem } from "../../systems/estilo.js";

// Folha inimigos-mar-<estilo>.png: quadros de 32×32
// em 8 colunas, monstros vistos de cima olhando para a direita (o jogo gira).

export const QUADRO = 32;
const COLUNAS = 8;

// quadros de cada monstro: nado ou voo, dano (branco) e morte
export const QUADROS = {
    morcego: { anim: [0, 1, 2, 3], dano: 4, morte: [5, 6, 7] },
    piranha: { anim: [8, 9, 10, 11], dano: 12, morte: [13, 14, 15] },
    serpente: { anim: [16, 17, 18, 19], dano: 20, morte: [21, 22, 23] },
};
export const SOMBRA = 24;
export const RESPINGO = [25, 26, 27];

// Imagem da folha no tema atual.
export function folhaDoMar() {
    return loader.getImage(imagem("inimigos-mar"));
}

// Desenha o quadro centrado em (x, y), girado `angulo` radianos e na
// escala dada. A posição sai em pixel inteiro para não borrar a arte.
export function desenharQuadro(renderer, img, quadro, x, y, angulo = 0, escala = 1, alfa = 1) {
    if (alfa <= 0) {
        return;
    }
    const lado = QUADRO * escala;
    renderer.save();
    renderer.setGlobalAlpha(alfa);
    renderer.translate(Math.round(x), Math.round(y));
    if (angulo !== 0) {
        renderer.rotate(angulo);
    }
    renderer.drawImage(
        img,
        (quadro % COLUNAS) * QUADRO,
        Math.floor(quadro / COLUNAS) * QUADRO,
        QUADRO,
        QUADRO,
        -lado / 2,
        -lado / 2,
        lado,
        lado,
    );
    renderer.restore();
}
