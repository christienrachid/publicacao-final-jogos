// Ferramentas de desenho por papéis para tools/gerar-ilha-arte.mjs (ilha de lado,
// torre, casa, céu e menu). Tudo continua em papéis de cor: a cor de verdade só
// aparece em gradeParaImagem (util-sprites.mjs), no estilo pedido.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { Imagem, lerDesenho } from "./png.mjs";
import { PAPEL as P } from "./paletas.mjs";
import { novaGrade } from "./util-sprites.mjs";

// Uma grade de papéis com pincéis simples. Com `repete`, as coordenadas dão a
// volta nas bordas: o que sai pela direita entra pela esquerda (tiles que emendam).
export class Tela {
    constructor(largura, altura, { repete = false } = {}) {
        this.largura = largura;
        this.altura = altura;
        this.repete = repete;
        this.g = novaGrade(largura, altura);
    }

    posicao(x, y) {
        x = Math.round(x);
        y = Math.round(y);
        if (this.repete) {
            x = ((x % this.largura) + this.largura) % this.largura;
            y = ((y % this.altura) + this.altura) % this.altura;
        } else if (x < 0 || y < 0 || x >= this.largura || y >= this.altura) {
            return null;
        }
        return [x, y];
    }

    pinta(x, y, papel) {
        if (papel === undefined || papel === null) throw new Error(`pinta: papel indefinido em (${x}, ${y})`);
        const p = this.posicao(x, y);
        if (p) this.g[p[1]][p[0]] = papel;
    }

    le(x, y) {
        const p = this.posicao(x, y);
        return p ? this.g[p[1]][p[0]] : 0;
    }

    ret(x, y, largura, altura, papel) {
        for (let yy = y; yy < y + altura; yy++) for (let xx = x; xx < x + largura; xx++) this.pinta(xx, yy, papel);
    }

    // linha de Bresenham
    linha(x0, y0, x1, y1, papel) {
        x0 = Math.round(x0);
        y0 = Math.round(y0);
        x1 = Math.round(x1);
        y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0);
        const dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let erro = dx + dy;
        for (;;) {
            this.pinta(x0, y0, papel);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * erro;
            if (e2 >= dy) {
                erro += dy;
                x0 += sx;
            }
            if (e2 <= dx) {
                erro += dx;
                y0 += sy;
            }
        }
    }

    // elipse cheia; `papel` pode ser função (x, y, u, v) -> papel, com u e v de -1 a 1
    elipse(cx, cy, rx, ry, papel) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const u = (x - cx) / rx;
                const v = (y - cy) / ry;
                if (u * u + v * v > 1) continue;
                const p = typeof papel === "function" ? papel(x, y, u, v) : papel;
                if (p) this.pinta(x, y, p);
            }
        }
    }

    // desenho em texto ("." é transparente) com a legenda caractere -> papel
    desenho(texto, legenda, x0 = 0, y0 = 0) {
        const { papeis } = lerDesenho(texto, legenda);
        this.colar(papeis, x0, y0);
    }

    // copia os papéis não transparentes de uma grade
    colar(grade, x0 = 0, y0 = 0) {
        for (let y = 0; y < grade.length; y++) {
            for (let x = 0; x < grade[y].length; x++) if (grade[y][x]) this.pinta(x0 + x, y0 + y, grade[y][x]);
        }
    }

    // contorno de 1 px (4 vizinhos) em volta do que já está pintado
    contornar(papel = P.contorno) {
        const antes = this.g.map((l) => l.slice());
        const pintado = (x, y) => {
            if (this.repete) {
                const p = this.posicao(x, y);
                return antes[p[1]][p[0]] !== 0;
            }
            return x >= 0 && y >= 0 && x < this.largura && y < this.altura && antes[y][x] !== 0;
        };
        for (let y = 0; y < this.altura; y++) {
            for (let x = 0; x < this.largura; x++) {
                if (antes[y][x] !== 0) continue;
                if (pintado(x - 1, y) || pintado(x + 1, y) || pintado(x, y - 1) || pintado(x, y + 1)) this.g[y][x] = papel;
            }
        }
    }

    // troca papéis numa área: mapa {papel: novoPapel}
    trocar(mapa, x0 = 0, y0 = 0, largura = this.largura, altura = this.altura) {
        for (let y = y0; y < y0 + altura; y++) {
            for (let x = x0; x < x0 + largura; x++) {
                const atual = this.le(x, y);
                if (mapa[atual] !== undefined) this.pinta(x, y, mapa[atual]);
            }
        }
    }

    recorte(x0, y0, largura, altura) {
        const g = novaGrade(largura, altura);
        for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) g[y][x] = this.le(x0 + x, y0 + y);
        return g;
    }
}

// Materiais: três papéis por material, do escuro ao claro (regra dos 3 tons).
export function materiais() {
    const madeira = [P.madeiraEscura, P.madeira, P.areiaEscura];
    return {
        grama: [P.folhaEscura, P.folha, P.gramaClara],
        terra: madeira,
        madeira,
        // tábuas claras da casa
        madeiraClara: [P.madeira, P.areiaEscura, P.areia],
        // rocha do fundo da ilha e pedra velha da ruína
        rocha: [P.sombra, P.pedraEscura, P.pedra],
        // pedra velha da torre quebrada
        pedraVelha: [P.sombra, P.pedraEscura, P.pedra],
        // pedra nova, de construção
        pedra: [P.pedraEscura, P.pedra, P.pedraClara],
        molhada: [P.sombra, P.pedra, P.brilhoFrio],
        areia: [P.areiaEscura, P.areia, P.solClaro],
        agua: [P.aguaEscura, P.agua, P.espuma],
        metal: [P.contorno, P.metal, P.brilhoFrio],
        // faixa colorida do farol e telhado: a paleta não tem "capa escura"
        capa: [P.madeira, P.capa],
        // faixa branca do farol, do escuro ao claro
        branco: [P.pedra, P.pedraClara, P.brilhoFrio, P.espuma],
        luz: [P.fogoEscuro, P.fogo, P.fogoClaro],
        osso: [P.areiaEscura, P.areia, P.solClaro],
        corda: [P.areiaEscura, P.areia],
    };
}

// valor pseudoaleatório estável por posição (0..1), para variar sem chuvisco
export function ruido(x, y, semente = 0) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(semente | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Voronoi num toro de lado `lado`: para cada pixel, a célula mais perto e a
// folga até a segunda. Serve para pedras que emendam nas quatro bordas.
export function voronoiPeriodico(pontos, lado) {
    return (x, y) => {
        let d1 = Infinity;
        let d2 = Infinity;
        let id = -1;
        pontos.forEach(([px, py, peso = 1], i) => {
            let dx = Math.abs(x + 0.5 - px);
            let dy = Math.abs(y + 0.5 - py);
            dx = Math.min(dx, lado - dx);
            dy = Math.min(dy, lado - dy);
            const d = Math.hypot(dx, dy * 1.25) / peso;
            if (d < d1) {
                d2 = d1;
                d1 = d;
                id = i;
            } else if (d < d2) {
                d2 = d;
            }
        });
        return { id, folga: d2 - d1 };
    };
}

// Lê um PNG RGBA de 8 bits (como os que png.mjs grava) para uma Imagem.
// Só para as prévias: o logo do título vai por cima do menu.
export function lerPng(caminho) {
    const dados = readFileSync(caminho);
    let pos = 8;
    let largura = 0;
    let altura = 0;
    const partes = [];
    while (pos < dados.length) {
        const tamanho = dados.readUInt32BE(pos);
        const tipo = dados.toString("ascii", pos + 4, pos + 8);
        const corpo = dados.subarray(pos + 8, pos + 8 + tamanho);
        if (tipo === "IHDR") {
            largura = corpo.readUInt32BE(0);
            altura = corpo.readUInt32BE(4);
            if (corpo[8] !== 8 || corpo[9] !== 6) throw new Error(`${caminho}: só PNG RGBA de 8 bits`);
        } else if (tipo === "IDAT") {
            partes.push(corpo);
        }
        pos += 12 + tamanho;
    }
    const bruto = inflateSync(Buffer.concat(partes));
    const img = new Imagem(largura, altura);
    const linha = largura * 4;
    const anterior = new Uint8Array(linha);
    for (let y = 0; y < altura; y++) {
        const filtro = bruto[y * (linha + 1)];
        const atual = new Uint8Array(bruto.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1)));
        for (let i = 0; i < linha; i++) {
            const a = i >= 4 ? atual[i - 4] : 0;
            const b = anterior[i];
            const c = i >= 4 ? anterior[i - 4] : 0;
            let somar = 0;
            if (filtro === 1) somar = a;
            else if (filtro === 2) somar = b;
            else if (filtro === 3) somar = (a + b) >> 1;
            else if (filtro === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                somar = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            atual[i] = (atual[i] + somar) & 0xff;
        }
        img.pixels.set(atual, y * linha);
        anterior.set(atual);
    }
    return img;
}
