import { NineSliceSprite } from "melonjs";
import { desenharSprite } from "../entities/folha.js";
import { imagem } from "../systems/estilo.js";

// Painel 9-slice da imagem painel-<estilo>.png (48×48, bordas de 16 px):
// os cantos ficam do tamanho da arte e as bordas
// e o miolo esticam até o tamanho pedido. A arte é opaca; a transparência
// vem de `opacidade`.

const BORDA = 16;
// menor lado que ainda mostra os quatro cantos inteiros
const MINIMO = BORDA * 2;

export class Painel {
    constructor() {
        // criado no primeiro desenho
        this.s = null;
    }

    sprite() {
        let s = this.s;
        if (s === null) {
            s = new NineSliceSprite(0, 0, {
                image: imagem("painel"),
                width: MINIMO,
                height: MINIMO,
                insetx: BORDA,
                insety: BORDA,
                anchorPoint: { x: 0, y: 0 },
            });
            this.s = s;
        }
        return s;
    }

    // Desenha o painel com o canto superior esquerdo em (x, y).
    desenhar(renderer, x, y, largura, altura, opacidade = 0.92) {
        const s = this.sprite();
        s.width = Math.max(MINIMO, Math.round(largura));
        s.height = Math.max(MINIMO, Math.round(altura));
        s.pos.set(Math.round(x), Math.round(y));
        s.alpha = opacidade;
        desenharSprite(renderer, s);
    }

    destroy() {
        if (this.s !== null) {
            this.s.destroy();
            this.s = null;
        }
    }
}
