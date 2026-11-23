import { Color } from "melonjs";

// Ajudas de desenho do Kraken: cor CSS → Color guardada e "pontos"
// (quadradinhos) em série com uma cor e uma opacidade só, para desenhar
// anéis e linhas grossos em pixel sem um save/restore por quadradinho.

const CORES = new Map();

// Color de uma string CSS, criada uma vez.
export function cor(css) {
    let c = CORES.get(css);
    if (c === undefined) {
        c = new Color().parseCSS(css);
        CORES.set(css, c);
    }
    return c;
}

// Começa uma série de pontos: guarda o estado e define cor e opacidade.
// Termine com renderer.restore().
export function comecarPontos(renderer, css, alfa) {
    renderer.save();
    renderer.setGlobalAlpha(Math.max(0, Math.min(1, alfa)));
    renderer.setColor(cor(css));
}

// Um quadradinho de lado `lado` centrado em (x, y), na grade de pixels.
export function ponto(renderer, x, y, lado) {
    renderer.fillRect(Math.round(x - lado / 2), Math.round(y - lado / 2), lado, lado);
}

// Brilho redondo aditivo em (x, y): `camadas` elipses de raio decrescente.
export function brilhoRedondo(renderer, css, x, y, raio, alfa, camadas = 3) {
    if (alfa <= 0.004 || raio <= 0) {
        return;
    }
    renderer.save();
    renderer.setBlendMode("additive");
    renderer.setColor(cor(css));
    renderer.setGlobalAlpha(Math.min(1, alfa));
    for (let i = 0; i < camadas; i++) {
        const r = raio * (1 - i / (camadas + 1));
        renderer.fillEllipse(Math.round(x), Math.round(y), r, r);
    }
    renderer.setBlendMode("normal");
    renderer.restore();
}
