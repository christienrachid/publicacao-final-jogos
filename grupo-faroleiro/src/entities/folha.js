import { Sprite } from "melonjs";
import { imagem } from "../systems/estilo.js";

// Folha de sprites do estilo atual (sprites-<estilo>.png): quadros de 16×16,
// 8 colunas; o índice de cada quadro está no desenho de tools/gerar-sprites.mjs.
export const QUADRO = 16;

// Sprite da folha com pos no canto superior esquerdo do quadro (x, y).
// As entidades com corpo guardam um destes e o desenham no próprio draw, em
// vez de virarem Sprite: assim pos, corpo e hitbox continuam como estavam.
export function criarSpriteDaFolha(x, y) {
    return new Sprite(x, y, {
        image: imagem("sprites"),
        framewidth: QUADRO,
        frameheight: QUADRO,
        anchorPoint: { x: 0, y: 0 },
    });
}

// Desenha um Sprite que não está em nenhum container (o renderer já está na
// origem do container do dono, então pos vale em pixels do mundo).
export function desenharSprite(renderer, sprite) {
    sprite.preDraw(renderer);
    sprite.draw(renderer);
    sprite.postDraw(renderer);
}

// Pinta um retângulo de cor opaca (string CSS) com a opacidade dada.
// save/restore em volta: nos renderizadores de GPU o setColor multiplica a
// opacidade pela cor anterior, e no Canvas ela valeria para o que vem depois.
export function pintar(renderer, cor, x, y, largura = 1, altura = 1, opacidade = 1) {
    renderer.save();
    renderer.setGlobalAlpha(opacidade);
    renderer.setColor(cor);
    renderer.fillRect(x, y, largura, altura);
    renderer.restore();
}
