// Gera public/data/img/tileset-<estilo>.png (128x64, 32 tiles de 16x16, 8 colunas)
// no estilo do jogo, e a prévia previas/previa-tileset-<estilo>.png.
// O desenho dos tiles fica em tools/arte/tiles.mjs; as cores, em tools/arte/paletas.mjs.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Imagem, hex } from "./arte/png.mjs";
import { ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";
import { T, COLUNAS, gradesDosTiles, montarTileset, pintarGrade } from "./arte/tiles.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESCALA = 4;
const MARGEM = 8;

// fundo xadrez para enxergar o que é transparente
function xadrez(imagem, x0, y0, largura, altura) {
    const claro = hex("#3a3a44");
    const escuro = hex("#2a2a32");
    for (let y = y0; y < y0 + altura; y++) {
        for (let x = x0; x < x0 + largura; x++) {
            imagem.pintar(x, y, ((x - x0) >> 3) % 2 === ((y - y0) >> 3) % 2 ? claro : escuro);
        }
    }
}

// um bloco 3x3 do mesmo tile, para conferir a emenda
function blocoRepetido(estilo, ids) {
    const bloco = new Imagem(3 * T, ids.length * T);
    const grades = gradesDosTiles();
    ids.forEach((id, linha) => {
        for (let coluna = 0; coluna < 3; coluna++) pintarGrade(bloco, grades[id], coluna * T, linha * T, estilo);
    });
    return bloco;
}

for (const estilo of ORDEM_DOS_ESTILOS) {
    const folha = montarTileset(estilo);
    const saida = resolve(raiz, `public/data/img/tileset-${estilo}.png`);
    folha.salvar(saida);

    // prévia: a folha a 4x e, embaixo, blocos 3x3 dos tiles que precisam emendar (a 2x)
    const blocos = [
        blocoRepetido(estilo, [0, 0, 0]),
        blocoRepetido(estilo, [8, 10, 6]),
        blocoRepetido(estilo, [20, 16, 16]),
        blocoRepetido(estilo, [21, 22, 23]),
        blocoRepetido(estilo, [1, 2, 3]),
    ];
    const larguraFolha = folha.largura * ESCALA;
    const alturaBlocos = 3 * T * 2;
    const previa = new Imagem(larguraFolha + 2 * MARGEM, folha.altura * ESCALA + alturaBlocos + 3 * MARGEM);
    previa.retangulo(0, 0, previa.largura, previa.altura, hex("#101014"));
    xadrez(previa, MARGEM, MARGEM, larguraFolha, folha.altura * ESCALA);
    previa.colar(folha, MARGEM, MARGEM, ESCALA);
    const yBlocos = folha.altura * ESCALA + 2 * MARGEM;
    blocos.forEach((bloco, i) => previa.colar(bloco, MARGEM + i * (3 * T * 2 + MARGEM), yBlocos, 2));
    previa.salvar(resolve(raiz, `previas/previa-tileset-${estilo}.png`));

    console.log(`tileset gerado: ${saida} (${COLUNAS * T}x${folha.altura})`);
}
