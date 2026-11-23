// Ferramentas de desenho da fase do farol (tools/gerar-farol-arte.mjs).
// Tudo trabalha sobre "grades" de papéis de cor (matriz [y][x], 0 = transparente),
// como em util-sprites.mjs: só no fim a grade vira cor num estilo.
import { novaGrade } from "./util-sprites.mjs";

// Grade com pincel: pintar fora dela é ignorado, coordenadas são arredondadas.
export class Tela {
    constructor(largura, altura) {
        this.largura = largura;
        this.altura = altura;
        this.grade = novaGrade(largura, altura);
    }

    dentro(x, y) {
        return x >= 0 && y >= 0 && x < this.largura && y < this.altura;
    }

    pinta(x, y, papel) {
        x = Math.round(x);
        y = Math.round(y);
        if (this.dentro(x, y)) this.grade[y][x] = papel;
    }

    le(x, y) {
        x = Math.round(x);
        y = Math.round(y);
        return this.dentro(x, y) ? this.grade[y][x] : 0;
    }

    // pinta cada pixel do retângulo com f(x, y), que devolve um papel ou null (não pinta)
    cada(x0, y0, x1, y1, f) {
        for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.altura - 1, Math.ceil(y1)); y++) {
            for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.largura - 1, Math.ceil(x1)); x++) {
                const p = f(x, y);
                if (p !== null && p !== undefined) this.grade[y][x] = p;
            }
        }
    }
}

// Ruído de valor 2D com semente, suave, de 0 a 1 (soma de oitavas).
export function criarRuido(semente) {
    const hash = (ix, iy) => {
        let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(semente, 982451653)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
    const suave = (t) => t * t * (3 - 2 * t);
    const valor = (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = suave(x - x0);
        const fy = suave(y - y0);
        const a = hash(x0, y0);
        const b = hash(x0 + 1, y0);
        const c = hash(x0, y0 + 1);
        const d = hash(x0 + 1, y0 + 1);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    return (x, y, oitavas = 3) => {
        let soma = 0;
        let amplitude = 1;
        let total = 0;
        let freq = 1;
        for (let i = 0; i < oitavas; i++) {
            soma += valor(x * freq + i * 17.3, y * freq - i * 9.1) * amplitude;
            total += amplitude;
            amplitude *= 0.5;
            freq *= 2;
        }
        return soma / total;
    };
}

// Distância (aproximada, chanfro 3-4) de cada pixel até o pixel mais próximo
// com mascara[y][x] === alvo. Devolve Float32Array largura*altura em pixels.
export function distancias(mascara, largura, altura, alvo) {
    const INF = 1e9;
    const d = new Float32Array(largura * altura);
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) d[y * largura + x] = mascara[y][x] === alvo ? 0 : INF;
    }
    const passo = (x, y, dx, dy, custo) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) return;
        const v = d[ny * largura + nx] + custo;
        if (v < d[y * largura + x]) d[y * largura + x] = v;
    };
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            passo(x, y, -1, 0, 3);
            passo(x, y, 0, -1, 3);
            passo(x, y, -1, -1, 4);
            passo(x, y, 1, -1, 4);
        }
    }
    for (let y = altura - 1; y >= 0; y--) {
        for (let x = largura - 1; x >= 0; x--) {
            passo(x, y, 1, 0, 3);
            passo(x, y, 0, 1, 3);
            passo(x, y, 1, 1, 4);
            passo(x, y, -1, 1, 4);
        }
    }
    for (let i = 0; i < d.length; i++) d[i] /= 3;
    return d;
}

// Contorno de 1 px (vizinhança de 4) em volta de tudo que não é transparente.
// `papelDoTopo`, se dado, é usado no contorno das bordas de cima (reflexo da lua).
export function contornar(grade, papel, papelDoTopo = null) {
    const alt = grade.length;
    const larg = grade[0].length;
    const saida = grade.map((l) => l.slice());
    for (let y = 0; y < alt; y++) {
        for (let x = 0; x < larg; x++) {
            if (grade[y][x] !== 0) continue;
            const cheio = (vx, vy) => vx >= 0 && vy >= 0 && vx < larg && vy < alt && grade[vy][vx] !== 0;
            if (cheio(x - 1, y) || cheio(x + 1, y) || cheio(x, y - 1) || cheio(x, y + 1)) {
                saida[y][x] = papelDoTopo !== null && cheio(x, y + 1) && !cheio(x, y - 1) ? papelDoTopo : papel;
            }
        }
    }
    return saida;
}

// ponto dentro de polígono [[x, y], ...] (regra par-ímpar)
export function dentroDoPoligono(px, py, pontos) {
    let dentro = false;
    for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
        const [xi, yi] = pontos[i];
        const [xj, yj] = pontos[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
}

// curva Catmull-Rom pelos pontos; devolve pontos a cada ~1 px
export function curva(pontos) {
    const saida = [];
    for (let i = 0; i < pontos.length - 1; i++) {
        const p0 = pontos[Math.max(0, i - 1)];
        const p1 = pontos[i];
        const p2 = pontos[i + 1];
        const p3 = pontos[Math.min(pontos.length - 1, i + 2)];
        const passos = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
        for (let s = 0; s < passos; s++) {
            const t = s / passos;
            const t2 = t * t;
            const t3 = t2 * t;
            const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            saida.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
        }
    }
    saida.push(pontos[pontos.length - 1]);
    return saida;
}

// troca papéis da grade segundo o mapa {papel: novoPapel} (os outros ficam)
export function trocarPapeis(grade, mapa) {
    return grade.map((l) => l.map((p) => (mapa[p] !== undefined ? mapa[p] : p)));
}

// A matriz de Bayer 8×8, de 0 a 1, para dissolver sem chuvisco aleatório
const BAYER8 = (() => {
    const m = [[0]];
    let n = 1;
    let atual = m;
    while (n < 8) {
        const nova = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0));
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const v = atual[y][x] * 4;
                nova[y][x] = v;
                nova[y][x + n] = v + 2;
                nova[y + n][x] = v + 3;
                nova[y + n][x + n] = v + 1;
            }
        }
        atual = nova;
        n *= 2;
    }
    return atual.map((l) => l.map((v) => (v + 0.5) / 64));
})();

export function limiarBayer8(x, y) {
    return BAYER8[y & 7][x & 7];
}
