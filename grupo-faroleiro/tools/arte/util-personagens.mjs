// Ferramentas de desenho do gerador de personagens (tools/gerar-personagens.mjs).
// Os desenhos são grades de LETRAS (um tom do desenho por letra, "." vazio);
// só no fim cada letra vira um papel de cor (e, se preciso, uma transparência)
// no estilo escolhido. Aqui ficam: leitura de desenho em texto, formas
// (elipse, polígono, linha grossa), contorno automático, sombreado pela luz de
// cima e da esquerda, pontilhado de sumiço e a montagem das prévias.
import { Imagem, hex } from "./png.mjs";
import { corDoPapel } from "./paletas.mjs";
import { BAYER4 } from "./util-sprites.mjs";

// ---------------------------------------------------------------------------
// Grades de letras
// ---------------------------------------------------------------------------

// desenho em texto -> matriz de letras; confere a largura de cada linha
export function linhas(texto, largura = null) {
    const ls = texto
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    if (largura !== null) {
        ls.forEach((l, i) => {
            if (l.length !== largura) {
                throw new Error(`desenho: linha ${i} com ${l.length} colunas, esperado ${largura}: '${l}'`);
            }
        });
    }
    return ls.map((l) => Array.from(l));
}

export function vazio(largura, altura) {
    return Array.from({ length: altura }, () => new Array(largura).fill("."));
}

export function copiar(letras) {
    return letras.map((l) => [...l]);
}

// carimba letras sobre letras; "." não apaga
export function sobrepor(base, desenho, dx = 0, dy = 0) {
    for (let y = 0; y < desenho.length; y++) {
        for (let x = 0; x < desenho[y].length; x++) {
            const c = desenho[y][x];
            if (c === ".") continue;
            const gy = y + dy;
            const gx = x + dx;
            if (gy < 0 || gx < 0 || gy >= base.length || gx >= base[0].length) continue;
            base[gy][gx] = c;
        }
    }
    return base;
}

export function espelhar(letras) {
    return letras.map((l) => [...l].reverse());
}

export function deslocar(letras, dx, dy) {
    return sobrepor(vazio(letras[0].length, letras.length), letras, dx, dy);
}

// troca letras: mapa {de: para}
export function trocar(letras, mapa) {
    return letras.map((l) => l.map((c) => (c in mapa ? mapa[c] : c)));
}

// pinta todo pixel não vazio com `letra`, menos as letras de `manter`
export function silhueta(letras, letra, manter = "o") {
    return letras.map((l) => l.map((c) => (c === "." || manter.includes(c) ? c : letra)));
}

// some aos poucos: mantém o pixel só onde o Bayer fica abaixo de `fracao` (0..1)
export function sumir(letras, fracao, dx = 0, dy = 0) {
    return letras.map((l, y) => l.map((c, x) => (c !== "." && BAYER4[(y + dy) & 3][(x + dx) & 3] < fracao ? c : ".")));
}

// ---------------------------------------------------------------------------
// Máscaras (matriz de booleanos) e formas
// ---------------------------------------------------------------------------

export function mascaraVazia(largura, altura) {
    return Array.from({ length: altura }, () => new Array(largura).fill(false));
}

export function dentro(m, x, y) {
    return y >= 0 && x >= 0 && y < m.length && x < m[0].length && m[y][x];
}

export function marcar(m, x, y, valor = true) {
    x = Math.round(x);
    y = Math.round(y);
    if (y >= 0 && x >= 0 && y < m.length && x < m[0].length) m[y][x] = valor;
}

// elipse cheia (centro em pixels inteiros ou meio pixel)
export function elipse(m, cx, cy, rx, ry, valor = true) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
        for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            if (dx * dx + dy * dy <= 1) marcar(m, x, y, valor);
        }
    }
    return m;
}

// polígono cheio (regra par-ímpar, amostra no centro do pixel)
export function poligono(m, pontos, valor = true) {
    const ys = pontos.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
        const cy = y + 0.5;
        const cortes = [];
        for (let i = 0; i < pontos.length; i++) {
            const [ax, ay] = pontos[i];
            const [bx, by] = pontos[(i + 1) % pontos.length];
            if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
                cortes.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
            }
        }
        cortes.sort((a, b) => a - b);
        for (let k = 0; k + 1 < cortes.length; k += 2) {
            for (let x = Math.ceil(cortes[k] - 0.5); x <= Math.floor(cortes[k + 1] - 0.5); x++) marcar(m, x, y, valor);
        }
    }
    return m;
}

// linha com espessura (pincel quadrado de lado `grossura`)
export function linha(m, x0, y0, x1, y1, grossura = 1, valor = true) {
    const passos = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    const r0 = -Math.floor((grossura - 1) / 2);
    for (let i = 0; i <= passos; i++) {
        const t = i / passos;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t);
        for (let a = 0; a < grossura; a++) {
            for (let b = 0; b < grossura; b++) marcar(m, x + r0 + a, y + r0 + b, valor);
        }
    }
    return m;
}

// forma descrita por uma função dentro(x, y) amostrada no centro do pixel
export function formaPorFuncao(m, teste, valor = true) {
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[0].length; x++) if (teste(x + 0.5, y + 0.5)) m[y][x] = valor;
    }
    return m;
}

// ---------------------------------------------------------------------------
// Sombreado e contorno
// ---------------------------------------------------------------------------

// Pinta a máscara em `q` com 3 ou 4 tons, luz de cima e da esquerda:
//  borda: pixel sem vizinho em cima (luar na borda de cima)
//  luz:   perto da borda de cima ou da esquerda
//  base:  o resto
//  escuro: perto da borda de baixo ou da direita (opcional)
export function sombrear(q, m, tons, opcoes = {}) {
    const { borda = tons.base, luz = tons.base, base, escuro = tons.base } = tons;
    const fundo = opcoes.fundo ?? 2; // espessura da faixa escura embaixo
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[0].length; x++) {
            if (!m[y][x]) continue;
            let c = base;
            const semCima = !dentro(m, x, y - 1);
            const semEsq = !dentro(m, x - 1, y);
            const perto = !dentro(m, x, y - 2);
            let embaixo = false;
            for (let k = 1; k <= fundo; k++) if (!dentro(m, x, y + k)) embaixo = true;
            const semDir = !dentro(m, x + 1, y);
            if (embaixo || semDir) c = escuro;
            if (perto || semEsq) c = luz;
            if (semCima) c = borda;
            q[y][x] = c;
        }
    }
    return q;
}

// contorno de 1 px em volta da máscara (4 vizinhos; `diagonais` fecha as quinas)
// `sobre`: true pinta o contorno também por cima do que já está desenhado
export function contornar(q, m, letra = "o", opcoes = {}) {
    const { diagonais = false, sobre = true } = opcoes;
    const viz = diagonais
        ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
        : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const marcas = [];
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[0].length; x++) {
            if (m[y][x]) continue;
            if (!sobre && q[y][x] !== ".") continue;
            if (viz.some(([dx, dy]) => dentro(m, x + dx, y + dy))) marcas.push([x, y]);
        }
    }
    for (const [x, y] of marcas) q[y][x] = letra;
    return q;
}

// máscara de tudo que não é vazio numa grade de letras
export function mascaraDe(letras, ignorar = "") {
    return letras.map((l) => l.map((c) => c !== "." && !ignorar.includes(c)));
}

// ---------------------------------------------------------------------------
// Letras -> imagem
// ---------------------------------------------------------------------------

// tons: {letra: papel} ou {letra: [papel, alfa 0..255]}
export function letrasParaImagem(letras, tons, estilo) {
    const img = new Imagem(letras[0].length, letras.length);
    for (let y = 0; y < letras.length; y++) {
        for (let x = 0; x < letras[0].length; x++) {
            const c = letras[y][x];
            if (c === ".") continue;
            const t = tons[c];
            if (t === undefined) throw new Error(`personagens: tom '${c}' sem papel`);
            const [papel, alfa] = Array.isArray(t) ? t : [t, 255];
            const cor = corDoPapel(estilo, papel);
            img.pintar(x, y, [cor[0], cor[1], cor[2], alfa]);
        }
    }
    return img;
}

// cola `origem` em `destino` misturando pela transparência (para as prévias)
export function colarMisturando(destino, origem, x0, y0, escala = 1) {
    for (let y = 0; y < origem.altura; y++) {
        for (let x = 0; x < origem.largura; x++) {
            const [r, g, b, a] = origem.ler(x, y);
            if (a === 0) continue;
            for (let ey = 0; ey < escala; ey++) {
                for (let ex = 0; ex < escala; ex++) {
                    const dx = x0 + x * escala + ex;
                    const dy = y0 + y * escala + ey;
                    if (dx < 0 || dy < 0 || dx >= destino.largura || dy >= destino.altura) continue;
                    const [R, G, B] = destino.ler(dx, dy);
                    const t = a / 255;
                    destino.pintar(dx, dy, [
                        Math.round(R + (r - R) * t),
                        Math.round(G + (g - G) * t),
                        Math.round(B + (b - B) * t),
                        255,
                    ]);
                }
            }
        }
    }
}

// recorte de uma imagem
export function recortar(img, x0, y0, largura, altura) {
    const nova = new Imagem(largura, altura);
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) nova.pintar(x, y, img.ler(x0 + x, y0 + y));
    }
    return nova;
}

// 9-slice: estica o miolo e as bordas (vizinho mais próximo), cantos fixos
export function esticar9(img, largura, altura, borda) {
    const nova = new Imagem(largura, altura);
    const origem = (d, total, totalOrigem) => {
        if (d < borda) return d;
        if (d >= total - borda) return totalOrigem - (total - d);
        const miolo = totalOrigem - 2 * borda;
        return borda + Math.floor(((d - borda) * miolo) / (total - 2 * borda));
    };
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            nova.pintar(x, y, img.ler(origem(x, largura, img.largura), origem(y, altura, img.altura)));
        }
    }
    return nova;
}

// retângulo de cor "#rrggbb" ou [r,g,b,a]
export function caixa(img, x, y, largura, altura, cor) {
    img.retangulo(x, y, largura, altura, typeof cor === "string" ? hex(cor) : cor);
}
