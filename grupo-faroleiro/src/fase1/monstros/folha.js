import { loader } from "melonjs";
import { imagem } from "../../systems/estilo.js";

// Folha inimigos-<estilo>.png: quadros de 32×32 em
// 8 colunas, monstros de lado olhando para a esquerda (o jogo espelha), com
// a base na linha 31. Os mini-chefes usam os mesmos quadros em escala 2.

export const QUADRO = 32;
const COLUNAS = 8;

// quadros de cada monstro (o pirata é do Holandês, src/fase1/holandes/)
export const QUADROS = {
    caranguejo: { andar: [0, 1, 2, 3], ataque: [4, 5], dano: 6, morte: 7 },
    alma: { voar: [8, 9, 10, 11], mergulho: [12, 13], dano: 14, morte: 15 },
    pirata: { andar: [16, 17, 18, 19], ataque: [20, 21], dano: 22, morte: 23 },
    // v3: a lápide (inteira e rachada) e o vampiro ficam nas fileiras 4 e 5 da folha
    lapide: [24, 25],
    vampiro: { parado: 32, andando: [33, 36], dash: 37, dano: 38, morte: 39 },
    // o zumbi usa outra folha, zumbi-<tema>.png (quadros de 24×24, o layout
    // do jogador, olhando para a direita): src/fase1/monstros/Zumbi.js. O
    // dano é o quadro 15, a silhueta branca (o 10 é o tranco do faroleiro,
    // escuro demais para piscar como os outros monstros)
    zumbi: { parado: [0, 1], andar: [2, 3, 4, 5, 6, 7], dano: 15, morte: 11, morrendo: [11, 12, 13, 14] },
};

// Imagem da folha no tema atual.
export function folhaDeInimigos() {
    return loader.getImage(imagem("inimigos"));
}

// Desenha o quadro com o meio da base em (x, base): `base` é a linha logo
// abaixo dos pés (a linha 31 do quadro fica em base - 1). olhando: -1
// esquerda (como na folha), 1 direita (espelhado).
export function desenharInimigo(renderer, img, quadro, x, base, olhando = -1, escala = 1, alfa = 1) {
    if (alfa <= 0) {
        return;
    }
    const lado = QUADRO * escala;
    const sx = (quadro % COLUNAS) * QUADRO;
    const sy = Math.floor(quadro / COLUNAS) * QUADRO;
    const esquerda = Math.round(x - lado / 2);
    const topo = Math.round(base - lado);
    renderer.save();
    renderer.setGlobalAlpha(alfa);
    if (olhando > 0) {
        renderer.translate(esquerda + lado, topo);
        renderer.scale(-1, 1);
        renderer.drawImage(img, sx, sy, QUADRO, QUADRO, 0, 0, lado, lado);
    } else {
        renderer.drawImage(img, sx, sy, QUADRO, QUADRO, esquerda, topo, lado, lado);
    }
    renderer.restore();
}

// Olhos de cada quadro, para desenhar por cima da escuridão (depois das 21h
// os monstros somem no escuro e só os olhos aparecem): [x, y, largura] em
// pixels do quadro (olhando para a esquerda), lidos de inimigos-<tema>.png.
// Os quadros de dano (6, 14, 22 e 38) são silhuetas: usam os olhos do quadro
// parado.
const OLHOS = [
    // caranguejo: andar 0–3, ataque 4–5, dano 6, morte 7 (olhos boiando na fumaça)
    [[16, 13, 2], [12, 14, 2]],
    [[16, 14, 2], [12, 15, 2]],
    [[16, 13, 2], [11, 14, 2]],
    [[16, 14, 2], [12, 15, 2]],
    [[16, 13, 2], [13, 14, 1]],
    [[16, 13, 2], [12, 14, 2]],
    [[16, 13, 2], [12, 14, 2]],
    [[14, 16, 1], [17, 16, 1]],
    // alma: voar 8–11, mergulho 12–13, dano 14, morte 15
    [[8, 14, 2], [11, 14, 2]],
    [[8, 13, 2], [11, 13, 2]],
    [[8, 13, 2], [11, 13, 2]],
    [[8, 14, 2], [11, 14, 2]],
    [[12, 12, 1], [8, 15, 2]],
    [[11, 15, 1], [8, 19, 1]],
    [[8, 13, 2], [11, 13, 2]],
    [[9, 12, 1], [12, 12, 1]],
    // pirata: andar 16–19, ataque 20–21, dano 22, morte 23
    [[12, 12, 1], [15, 12, 1]],
    [[12, 13, 1], [15, 13, 1]],
    [[12, 12, 1], [15, 12, 1]],
    [[12, 13, 1], [15, 13, 1]],
    [[15, 12, 1]],
    [[12, 12, 1], [15, 12, 1]],
    [[12, 12, 1], [15, 12, 1]],
    [[12, 10, 1]],
    // lápide 24–25 (sem olhos) e quadros 26–31 sem uso
    [], [], [], [], [], [], [], [],
    // vampiro: parado 32, andando 33–36, dash 37, dano 38, morte 39
    [[12, 10, 1], [15, 10, 1]],
    [[12, 10, 1], [15, 10, 1]],
    [[12, 11, 1], [15, 11, 1]],
    [[12, 10, 1], [15, 10, 1]],
    [[12, 11, 1], [15, 11, 1]],
    [[5, 13, 1], [8, 13, 1]],
    [[12, 10, 1], [15, 10, 1]],
    [],
];

// Desenha só os olhos do quadro, no mesmo lugar e espelhamento que
// desenharInimigo, na cor dada (pixels de 1×1 ou 2×1, vezes a escala).
export function desenharOlhos(renderer, quadro, x, base, olhando, escala, cor, alfa = 1) {
    const olhos = OLHOS[quadro];
    if (olhos === undefined || alfa <= 0) {
        return;
    }
    const lado = QUADRO * escala;
    const esquerda = Math.round(x - lado / 2);
    const topo = Math.round(base - lado);
    renderer.save();
    renderer.setGlobalAlpha(alfa);
    renderer.setColor(cor);
    for (const [ox, oy, largura] of olhos) {
        const px = olhando > 0 ? esquerda + lado - (ox + largura) * escala : esquerda + ox * escala;
        renderer.fillRect(px, topo + oy * escala, largura * escala, escala);
    }
    renderer.restore();
}
