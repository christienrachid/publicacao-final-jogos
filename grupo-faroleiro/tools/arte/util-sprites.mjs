// Ferramentas de desenho por papéis usadas por gerar-sprites, gerar-fonte e gerar-titulo.
// Uma "grade" é uma matriz [y][x] de números de papel (0 = transparente).
// Só depois de montada ela vira cor, num estilo, com gradeParaImagem.
import { Imagem, hex, lerDesenho } from "./png.mjs";
import { corDoPapel } from "./paletas.mjs";

export function novaGrade(largura, altura) {
    return Array.from({ length: altura }, () => new Array(largura).fill(0));
}

// copia os papéis não transparentes de `papeis` para `grade` em (dx, dy)
export function carimbar(grade, papeis, dx = 0, dy = 0) {
    for (let y = 0; y < papeis.length; y++) {
        for (let x = 0; x < papeis[y].length; x++) {
            const p = papeis[y][x];
            if (!p) continue;
            const gy = y + dy;
            const gx = x + dx;
            if (gy < 0 || gx < 0 || gy >= grade.length || gx >= grade[0].length) continue;
            grade[gy][gx] = p;
        }
    }
    return grade;
}

// lê um desenho em texto e devolve só a matriz de papéis
export function papeisDe(texto, legenda) {
    return lerDesenho(texto, legenda).papeis;
}

export function espelharGrade(grade) {
    return grade.map((linha) => [...linha].reverse());
}

export function deslocarGrade(grade, dx, dy) {
    const alt = grade.length;
    const larg = grade[0].length;
    const nova = novaGrade(larg, alt);
    return carimbar(nova, grade, dx, dy);
}

// converte uma grade de papéis em imagem, nas cores de um estilo
export function gradeParaImagem(grade, estilo) {
    const img = new Imagem(grade[0].length, grade.length);
    for (let y = 0; y < grade.length; y++) {
        for (let x = 0; x < grade[y].length; x++) {
            if (grade[y][x]) img.pintar(x, y, corDoPapel(estilo, grade[y][x]));
        }
    }
    return img;
}

// cópia ampliada (vizinho mais próximo), para as prévias
export function ampliar(img, escala) {
    const nova = new Imagem(img.largura * escala, img.altura * escala);
    nova.colar(img, 0, 0, escala);
    return nova;
}

// cor sólida "#rrggbb" num retângulo
export function preencher(img, x, y, largura, altura, corHex) {
    img.retangulo(x, y, largura, altura, hex(corHex));
}

// matriz de Bayer 4×4 normalizada para 0..1 (pontilhado ordenado)
export const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
].map((l) => l.map((v) => (v + 0.5) / 16));

// verdadeiro se o pixel (x, y) deve usar o tom "de cima" para a fração t (0..1)
export function pontilhar(x, y, t) {
    return t > BAYER4[y & 3][x & 3];
}
