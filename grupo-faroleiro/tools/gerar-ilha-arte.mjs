// Gera a arte da ilha de lado e do menu no estilo do jogo (<t> = id do estilo):
//   ilha-tiles-<t>.png  128×96  tiles de 16×16 em 8 colunas (ids em gradesDosTiles)
//   casa-<t>.png         64×48  casa do faroleiro (porta de x 26 a 37, base em y 47)
//   torre-<t>.png       288×128 6 quadros de 48×128: ruína, conserto 1 a 4, farol pronto
//                               (lanterna do quadro 5 centrada em x 24, y 14)
//   poste-<t>.png        32×48  2 quadros de 16×48: apagado e aceso (lâmpada em x 8, y 6)
//   lua-<t>.png          24×24  lua crescente
//   sol-<t>.png          48×48  sol com brilho
//   nuvens-<t>.png      192×32  3 quadros de 64×32
//   fundo-ilhas-<t>.png 640×64  ilhas e morros distantes, emendam na horizontal
//   menu-fundo-<t>.png  640×360 pôr do sol com a ilha, a casa, a torre quebrada e o faroleiro
// e as prévias previas/previa-ilha-tiles-<t>.png (4×), previa-ilha-cena-<t>.png
// (uma cena montada com os tiles) e previa-menu-<t>.png (menu com o logo por cima).
//   node tools/gerar-ilha-arte.mjs
//
// Visão de lado (jogo de plataforma). Luz de cima e da esquerda; no menu o sol
// fica atrás das coisas, então elas viram silhueta com a borda acesa.
// Tudo é desenhado em papéis de cor (tools/arte/paletas.mjs); nada de cor fixa.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Imagem, criarAleatorio } from "./arte/png.mjs";
import { PAPEL as P, ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";
import { gradeParaImagem, ampliar, pontilhar } from "./arte/util-sprites.mjs";
import { existsSync } from "node:fs";
import { Tela, materiais, ruido, voronoiPeriodico, lerPng } from "./arte/util-ilha.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = 16;
const k = P.contorno;

// suavização 0..1 (para relevo)
const suave = (t) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
};

// ===========================================================================
// TILES (ilha-tiles-<t>.png)
// ===========================================================================

const novoTile = () => new Tela(T, T, { repete: true });

// ---- terra: torrões com brilho em cima e sombra embaixo, sem chuvisco ----
const TORROES = [
    [1, 2, 3],
    [9, 4, 2],
    [12, 9, 3],
    [3, 10, 2],
    [8, 13, 3],
    [14, 0, 1],
];
const ESTRATOS = [
    [5, 7, 3],
    [14, 6, 2],
    [0, 14, 2],
    [11, 15, 2],
];
const PINTAS = [
    [6, 1],
    [15, 12],
    [1, 6],
    [10, 10],
];

function terra(t, M) {
    const [e, m, c] = M.terra;
    t.ret(0, 0, T, T, m);
    for (const [x, y, l] of ESTRATOS) for (let i = 0; i < l; i++) t.pinta(x + i, y, e);
    for (const [x, y, l] of TORROES) {
        for (let i = 0; i < l; i++) t.pinta(x + i + 1, y + 1, e);
        for (let i = 0; i < l; i++) t.pinta(x + i, y, c);
    }
    for (const [x, y] of PINTAS) t.pinta(x, y, e);
    return t;
}

function terraComPedra(M) {
    const t = terra(novoTile(), M);
    const [re, rm, rc] = M.rocha;
    // pedra deitada de 7×4, metida na terra
    t.desenho(
        `
        .kkkkk..
        kccccmk.
        krmmmmek
        kmmmmeek
        .kkkkkk.
        `,
        { k, c: rc, m: rm, r: rc, e: re },
        4,
        6,
    );
    return t;
}

// ---- grama no topo ----
// fundo da grama (linha onde começa a terra) por coluna; as pontas valem 5 nas
// duas variantes, então qualquer grama emenda com qualquer outra
const PERFIS = [
    [5, 5, 6, 6, 5, 4, 4, 5, 6, 7, 7, 6, 5, 5, 4, 5],
    [5, 4, 4, 5, 6, 6, 5, 5, 4, 5, 6, 7, 6, 5, 5, 5],
];
const ENTALHES = [
    [3, 4, 10],
    [6, 12, 13],
];
const FIOS = [
    [
        [2, 2],
        [7, 2],
        [12, 3],
    ],
    [
        [1, 3],
        [9, 2],
        [14, 2],
    ],
];
const RAIZES = [
    [
        [4, 2],
        [11, 3],
    ],
    [
        [7, 2],
        [13, 2],
    ],
];

function gramaTopo(M, v) {
    const t = terra(novoTile(), M);
    const [ge, gm, gc] = M.grama;
    const perfil = PERFIS[v];
    for (let x = 0; x < T; x++) {
        const p = perfil[x];
        for (let y = 0; y < p; y++) t.pinta(x, y, y < 2 ? gc : gm);
        t.pinta(x, p - 1, ge);
        t.pinta(x, p, M.terra[0]); // sombra da grama na terra
    }
    for (const [x, y] of FIOS[v]) {
        t.pinta(x, y, gc);
        t.pinta(x, y + 1, gc);
    }
    for (const [x, l] of RAIZES[v]) for (let i = 0; i < l; i++) t.pinta(x + (i === l - 1 ? 1 : 0), perfil[x] + 1 + i, ge);
    for (const x of ENTALHES[v]) {
        t.pinta(x, 0, 0);
        t.pinta(x, 1, gm); // sombra entre os tufos
    }
    return t;
}

// recuo da lateral de terra por linha (emenda na vertical: período 16)
const LATERAL = [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];

// borda exposta: contorno e, por dentro, brilho (esquerda, lado da luz) ou sombra (direita)
function bordaDeTerra(t, M, lado, y, b) {
    const X = (x) => (lado === "esq" ? x : T - 1 - x);
    for (let x = 0; x < b; x++) t.pinta(X(x), y, 0);
    t.pinta(X(b), y, k);
    t.pinta(X(b + 1), y, lado === "esq" ? M.terra[2] : M.terra[0]);
}

function lateralDeTerra(M, lado) {
    const t = terra(novoTile(), M);
    for (let y = 0; y < T; y++) bordaDeTerra(t, M, lado, y, LATERAL[y]);
    return t;
}

function quinaDeGrama(M, lado) {
    const t = gramaTopo(M, 0);
    const [ge, gm, gc] = M.grama;
    const X = (x) => (lado === "esq" ? x : T - 1 - x);
    const curva = [3, 1];
    // a grama desce um pouco pela lateral, com pontas desencontradas
    const saia = [9, 8, 6];
    for (let y = 0; y < T; y++) {
        if (y < 2) {
            for (let x = 0; x < curva[y]; x++) t.pinta(X(x), y, 0);
            t.pinta(X(curva[y]), y, gc);
            continue;
        }
        const b = LATERAL[y];
        if (y < saia[0]) {
            for (let x = 0; x < b; x++) t.pinta(X(x), y, 0);
            t.pinta(X(b), y, ge);
            if (y < saia[1]) t.pinta(X(b + 1), y, y < 3 ? gc : gm);
            if (y < saia[2]) t.pinta(X(b + 2), y, gm);
            if (y === saia[1]) t.pinta(X(b + 1), y, ge);
            if (y === saia[2]) t.pinta(X(b + 2), y, ge);
        } else {
            bordaDeTerra(t, M, lado, y, b);
        }
    }
    return t;
}

// ---- areia ----
const ONDULAS = [
    [1, 5, 4],
    [9, 8, 4],
    [4, 12, 3],
    [12, 14, 3],
];

function areia(t, M) {
    const [e, m, c] = M.areia;
    t.ret(0, 0, T, T, m);
    for (const [x, y, l] of ONDULAS) {
        for (let i = 0; i < l; i++) t.pinta(x + i, y, e);
        t.pinta(x - 1, y - 1, c);
    }
    for (const [x, y] of [
        [6, 3],
        [14, 10],
        [2, 9],
        [10, 1],
    ]) {
        t.pinta(x, y, e);
    }
    return t;
}

function areiaTopo(M) {
    const t = areia(novoTile(), M);
    const [e, m, c] = M.areia;
    for (let x = 0; x < T; x++) {
        t.pinta(x, 0, c);
        t.pinta(x, 1, x % 5 === 2 ? c : m);
    }
    for (const x of [5, 11]) t.pinta(x, 0, m);
    t.pinta(8, 2, e);
    return t;
}

function quinaDeAreia(M, lado) {
    const t = areiaTopo(M);
    const [e, , c] = M.areia;
    const X = (x) => (lado === "esq" ? x : T - 1 - x);
    const curva = [3, 1, 1];
    for (let y = 0; y < T; y++) {
        const b = y < 3 ? curva[y] : y < 9 ? 0 : 1;
        for (let x = 0; x < b; x++) t.pinta(X(x), y, 0);
        if (y < 2) {
            t.pinta(X(b), y, c);
            continue;
        }
        t.pinta(X(b), y, k);
        t.pinta(X(b + 1), y, lado === "esq" ? c : e);
    }
    return t;
}

// ---- rocha (fundo) e pedra molhada (costa): pedras em Voronoi que emenda ----
const PEDRAS_ROCHA = [
    [2, 3],
    [10, 2],
    [6, 9],
    [14, 9],
    [10, 14, 0.9],
];
const PEDRAS_MOLHADAS = [
    [4, 4, 1.15],
    [12, 6],
    [6, 12],
    [14, 14, 0.9],
];

function pedregulho(t, M, material, pontos, { escuras = [], vazio = () => false, brilhoCurto = false, alcance = 3 } = {}) {
    const [e, m, c] = M[material];
    const vor = voronoiPeriodico(pontos, T);
    const cel = (x, y) => vor(((x % T) + T) % T, ((y % T) + T) % T);
    const junta = (a) => a.folga < 0.9;
    for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
            if (vazio(x, y)) continue;
            const a = cel(x, y);
            if (junta(a)) {
                t.pinta(x, y, e);
                continue;
            }
            const cima = cel(x, y - 1);
            const esquerda = cel(x - 1, y);
            const bordaCima = vazio(x, y - 1) || cima.id !== a.id || junta(cima);
            const bordaEsq = esquerda.id !== a.id || junta(esquerda);
            const escura = escuras.includes(a.id);
            let papel = escura ? e : m;
            let brilha = bordaCima || (bordaEsq && !brilhoCurto);
            // brilho curto: só a ponta esquerda da borda de cima (reflexo molhado)
            if (brilhoCurto && bordaCima) {
                const longe = cel(x - alcance, y);
                brilha = longe.id !== a.id || junta(longe) || vazio(x - alcance, y - 1) !== vazio(x, y - 1);
            }
            if (brilha) papel = escura ? m : c;
            t.pinta(x, y, papel);
        }
    }
    return t;
}

function rocha(M, v) {
    const t = pedregulho(novoTile(), M, "rocha", PEDRAS_ROCHA, { escuras: [3], brilhoCurto: true, alcance: 5 });
    const [e, , c] = M.rocha;
    if (v === 1) {
        // rachadura numa pedra e um fóssil de concha
        for (const [x, y] of [
            [6, 6],
            [7, 7],
            [7, 8],
            [8, 9],
        ]) {
            t.pinta(x, y, e);
        }
        t.pinta(2, 11, c);
        t.pinta(3, 11, e);
        t.pinta(2, 12, e);
    }
    return t;
}

const TOPO_COSTA = [2, 1, 1, 1, 2, 3, 3, 2, 1, 1, 1, 2, 3, 3, 2, 2];

function pedraMolhada(M, topo) {
    const vazio = topo ? (x, y) => y < TOPO_COSTA[((x % T) + T) % T] && y >= 0 && y < T : () => false;
    const t = pedregulho(novoTile(), M, "molhada", PEDRAS_MOLHADAS, { brilhoCurto: true, vazio });
    if (topo) {
        const [ge, gm] = M.grama;
        // algas penduradas e espuma nas fendas
        for (const [x, l] of [
            [4, 3],
            [5, 2],
            [12, 4],
        ]) {
            for (let i = 0; i < l; i++) t.pinta(x, TOPO_COSTA[x] + 1 + i, i === l - 1 ? ge : gm);
        }
        t.pinta(9, TOPO_COSTA[9], P.espuma);
        t.pinta(15, TOPO_COSTA[15], P.espuma);
    }
    return t;
}

// ---- caixas ----
function caixa(M, v) {
    const t = new Tela(T, T);
    const [e, m, c] = M.madeira;
    const [, mm, mc] = M.metal;
    t.ret(0, 0, T, T, k);
    t.ret(1, 1, 14, 14, m);
    t.ret(1, 1, 14, 1, c);
    t.ret(1, 1, 1, 14, c);
    t.ret(1, 14, 14, 1, e);
    t.ret(14, 1, 1, 14, e);
    // miolo afundado: a moldura faz sombra em cima e à esquerda
    t.ret(3, 3, 10, 1, e);
    t.ret(3, 3, 1, 10, e);
    t.ret(3, 12, 10, 1, c);
    t.ret(12, 3, 1, 10, c);
    t.ret(12, 3, 1, 1, e);
    if (v === 0) {
        for (const y of [6, 9]) t.ret(4, y, 8, 1, e);
        // travessa diagonal
        for (let i = 0; i < 9; i++) {
            const x = 3 + i;
            const y = 11 - i;
            if (y + 1 <= 11) t.pinta(x + 1, y + 1, e);
        }
        for (let i = 0; i < 9; i++) {
            const x = 3 + i;
            const y = 11 - i;
            t.pinta(x, y, c);
            if (x + 1 <= 11) t.pinta(x + 1, y, m);
        }
    } else {
        for (const x of [6, 9]) t.ret(x, 4, 1, 8, e);
        // cinta de ferro com rebites
        t.ret(1, 7, 14, 1, mc);
        t.ret(1, 8, 14, 1, mm);
        t.ret(1, 9, 14, 1, k);
        for (const x of [4, 11]) t.pinta(x, 8, k);
    }
    for (const [x, y] of [
        [2, 2],
        [13, 2],
        [2, 13],
        [13, 13],
    ]) {
        t.pinta(x, y, mm);
    }
    return t;
}

// ---- andaime ----
function tabua(M, parte) {
    const t = new Tela(T, T);
    const [e, m, c] = M.madeira;
    const [ce, cc] = M.corda;
    t.ret(0, 0, T, 1, k);
    t.ret(0, 1, T, 1, c);
    t.ret(0, 2, T, 2, m);
    t.ret(0, 4, T, 1, e);
    t.ret(0, 5, T, 1, k);
    for (const [x, y, l] of [
        [2, 3, 3],
        [9, 2, 3],
        [13, 3, 2],
    ]) {
        for (let i = 0; i < l; i++) t.pinta(x + i, y, e);
    }
    if (parte === "meio") {
        t.ret(8, 1, 1, 4, k);
        t.pinta(6, 2, M.metal[1]);
        t.pinta(10, 2, M.metal[1]);
        return t;
    }
    const X = (x) => (parte === "esq" ? x : T - 1 - x);
    // ponta da tábua
    for (let y = 0; y < 6; y++) t.pinta(X(0), y, k);
    for (let y = 1; y < 5; y++) t.pinta(X(1), y, y === 1 ? c : e);
    // travessa por baixo (vista de ponta) e corda amarrando
    for (let y = 6; y < 10; y++) for (let x = 2; x < 7; x++) t.pinta(X(x), y, k);
    t.pinta(X(3), 6, c);
    t.pinta(X(4), 6, c);
    t.pinta(X(5), 6, m);
    t.pinta(X(3), 7, m);
    t.pinta(X(4), 7, e);
    t.pinta(X(5), 7, m);
    t.pinta(X(3), 8, m);
    t.pinta(X(4), 8, m);
    t.pinta(X(5), 8, e);
    for (let y = 1; y < 9; y++) t.pinta(X(y % 2 === 0 ? 4 : 3), y, y % 3 === 0 ? ce : cc);
    return t;
}

function pernaDeAndaime(M) {
    const t = new Tela(T, T, { repete: true });
    const [e, m, c] = M.madeira;
    const [ce, cc] = M.corda;
    // travessas em X por trás (emendam na vertical em zigue-zague)
    t.linha(5, 1, 10, 16, e);
    t.linha(10, 1, 5, 16, e);
    t.linha(5, 0, 10, 15, m);
    t.linha(10, 0, 5, 15, m);
    for (const x0 of [1, 11]) {
        t.ret(x0, 0, 1, T, k);
        t.ret(x0 + 1, 0, 1, T, c);
        t.ret(x0 + 2, 0, 1, T, m);
        t.ret(x0 + 3, 0, 1, T, k);
        t.pinta(x0 + 2, 6, e);
        t.pinta(x0 + 1, 11, m);
    }
    // amarrações de corda onde a travessa encosta no poste
    for (const [x, y] of [
        [2, 0],
        [3, 1],
        [12, 0],
        [13, 1],
    ]) {
        t.pinta(x, y, y === 0 ? cc : ce);
    }
    return t;
}

// ---- decoração ----
function barril(M) {
    const t = new Tela(T, T);
    const [e, m, c] = M.madeira;
    const [, mm, mc] = M.metal;
    for (let y = 2; y < T; y++) {
        const meia = 5 + Math.round(Math.sin((Math.PI * (y - 2)) / 13) * 1.2);
        const x0 = 8 - meia;
        const x1 = 7 + meia;
        for (let x = x0; x <= x1; x++) {
            const u = (x - x0) / (x1 - x0);
            let p = u < 0.25 ? c : u < 0.7 ? m : e;
            if ((x === 5 || x === 10) && p !== e) p = e;
            if (y === 5 || y === 12) p = u < 0.3 ? mc : u < 0.75 ? mm : k;
            if (y === 6 || y === 13) p = p === c ? m : p === m ? e : p;
            if (x === x0 || x === x1 || y === T - 1) p = k;
            t.pinta(x, y, p);
        }
    }
    // tampa vista de leve por cima
    for (let x = 3; x <= 12; x++) t.pinta(x, 2, k);
    for (let x = 4; x <= 11; x++) t.pinta(x, 3, x < 6 ? c : e);
    t.pinta(3, 3, k);
    t.pinta(12, 3, k);
    for (let x = 4; x <= 11; x++) t.pinta(x, 4, k);
    t.pinta(5, 3, m);
    return t;
}

function redeECorda(M) {
    const t = new Tela(T, T);
    const [e, m, c] = M.madeira;
    const [ce, cc] = M.corda;
    // estaca
    t.ret(11, 3, 2, 13, m);
    t.ret(11, 3, 1, 13, c);
    t.pinta(11, 2, c);
    t.pinta(12, 2, m);
    // rede caída da estaca até o chão
    for (let y = 3; y < T; y++) {
        const largura = Math.min(7, 1 + Math.floor((y - 3) * 0.6));
        for (let x = 11 - largura; x < 11; x++) {
            if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) t.pinta(x, y, (x + y) % 2 ? P.agua : P.espuma);
        }
    }
    // boia vermelha presa na rede
    t.ret(7, 8, 2, 2, P.capa);
    t.pinta(7, 8, M.branco[3]);
    // corda enrolada no chão
    t.elipse(4.5, 13.5, 4, 2, (x, y, u, v) => (Math.abs(v) > 0.45 || Math.abs(u) > 0.6 ? (v < 0 ? cc : ce) : 0));
    t.elipse(4.5, 11.8, 3, 1.3, (x, y, u, v) => (Math.abs(u) > 0.5 || v < 0 ? cc : ce));
    t.pinta(4, 13, k);
    t.pinta(5, 13, k);
    t.contornar();
    // a rede fica sem contorno por dentro: reabre os furos da trama
    for (let y = 4; y < 12; y++) {
        for (let x = 4; x < 11; x++) {
            if (t.le(x, y) === k && x + 1 < 11 && t.le(x + 1, y) !== P.capa && !(y >= 7 && y <= 10 && x >= 6 && x <= 9)) {
                const perto = (xx, yy) => [P.agua, P.espuma].includes(t.le(xx, yy));
                if (perto(x - 1, y) && perto(x + 1, y)) t.pinta(x, y, 0);
            }
        }
    }
    return t;
}

function laminas(t, M, lista) {
    const [ge, gm, gc] = M.grama;
    for (const [x, altura, inclina] of lista) {
        for (let i = 0; i < altura; i++) {
            const y = T - 1 - i;
            const dx = i >= altura * 0.6 ? inclina : 0;
            const p = i < 2 ? ge : i === altura - 1 ? gc : gm;
            t.pinta(x + dx, y, p);
        }
    }
}

function tufo(M) {
    const t = new Tela(T, T);
    laminas(t, M, [
        [2, 4, 0],
        [3, 6, -1],
        [5, 8, 0],
        [6, 5, 1],
        [8, 9, 1],
        [9, 6, 0],
        [11, 7, -1],
        [12, 4, 1],
        [13, 5, 1],
        [4, 3, 0],
        [7, 3, 0],
        [10, 3, 0],
    ]);
    return t;
}

function flores(M) {
    const t = new Tela(T, T);
    const [ge, gm] = M.grama;
    laminas(t, M, [
        [1, 3, 0],
        [6, 4, 1],
        [10, 3, 0],
        [14, 4, -1],
    ]);
    for (const [x, altura, cor, miolo] of [
        [3, 6, P.capa, P.solClaro],
        [8, 9, P.sol, P.fogoEscuro],
        [12, 5, P.capa, P.solClaro],
    ]) {
        for (let i = 0; i < altura; i++) t.pinta(x, T - 1 - i, i < 1 ? ge : gm);
        t.pinta(x + 1, T - 3, gm);
        t.pinta(x - 1, T - 4, gm);
        const y = T - 1 - altura;
        for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ]) {
            t.pinta(x + dx, y + dy, cor);
        }
        t.pinta(x, y, miolo);
        t.pinta(x + 1, y + 1, k);
        t.pinta(x - 1, y + 1, k);
    }
    return t;
}

function pedrinhas(M) {
    const t = new Tela(T, T);
    const [e, m, c] = M.rocha;
    const pedra = (x, y, u, v) => (v < -0.3 && u < 0.4 ? c : v > 0.4 || u > 0.6 ? e : m);
    t.elipse(4, 13.5, 2.6, 1.8, pedra);
    t.elipse(9, 14.2, 1.8, 1.2, pedra);
    t.elipse(12.5, 13.6, 2, 1.5, pedra);
    t.contornar();
    for (let x = 0; x < T; x++) if (t.le(x, T - 1) === k && t.le(x, T - 2) === 0) t.pinta(x, T - 1, 0);
    return t;
}

function cerca(M) {
    const t = new Tela(T, T);
    const [e, m, c] = M.madeira;
    for (const y of [7, 11]) {
        t.ret(0, y, T, 1, c);
        t.ret(0, y + 1, T, 1, m);
    }
    for (const x of [2, 11]) {
        t.ret(x, 4, 1, 12, c);
        t.ret(x + 1, 4, 1, 12, m);
        t.ret(x + 2, 4, 1, 12, e);
        t.pinta(x + 1, 3, m);
        t.pinta(x + 1, 9, e);
    }
    t.contornar();
    return t;
}

function placa(M) {
    const t = new Tela(T, T);
    const [e, m, c] = M.madeira;
    t.desenho(
        `
        ................
        ................
        ..kkkkkkkkkkkk..
        ..kccccccccccck.
        ..kcmmmmmmemmek.
        ..kceeeeeeeemek.
        ..kcmmmmmmemmek.
        ..kweeeeeeeeeek.
        ..kkkkkkkkkkkkk.
        ......kcmk......
        ......kcmk......
        ......kcek......
        ......kcmk......
        ......kcmk......
        .....kccmek.....
        .....kcmmek.....
        `,
        { k, c, m, e, w: e },
    );
    return t;
}

function ancora(M) {
    const t = new Tela(T, T);
    const [, mm, mc] = M.metal;
    const ferrugem = P.fogoEscuro;
    // argola
    t.elipse(7.5, 2.5, 2, 2, (x, y, u, v) => (u * u + v * v > 0.3 ? (v < 0 ? mc : mm) : 0));
    // haste e cepo
    t.ret(7, 4, 2, 10, mm);
    t.ret(7, 4, 1, 10, mc);
    t.ret(4, 6, 8, 1, mc);
    t.ret(4, 7, 8, 1, mm);
    // braços curvos com as patas
    for (let x = 2; x <= 13; x++) {
        const y = Math.round(14 - ((x - 7.5) * (x - 7.5)) / 7);
        t.pinta(x, y, mm);
        t.pinta(x, y + 1, x < 7 ? mc : mm);
    }
    t.ret(1, 9, 2, 2, mm);
    t.ret(13, 9, 2, 2, mm);
    t.pinta(1, 9, mc);
    // ferrugem
    for (const [x, y] of [
        [8, 9],
        [7, 12],
        [10, 7],
        [3, 12],
    ]) {
        t.pinta(x, y, ferrugem);
    }
    t.contornar();
    for (let x = 0; x < T; x++) if (t.le(x, T - 1) === k && t.le(x, T - 2) === 0) t.pinta(x, T - 1, 0);
    return t;
}

function conchas(M) {
    const t = new Tela(T, T);
    const [oe, om, oc] = M.osso;
    // vieira em leque
    t.elipse(5, 14.5, 3.6, 3.4, (x, y, u, v) => {
        if (v > 0.3) return 0;
        const raio = Math.round(Math.atan2(-v, u) * 2.6);
        return raio % 2 === 0 ? oc : P.pele;
    });
    t.ret(4, 14, 3, 1, oe);
    // caramujo
    t.desenho(
        `
        ..ppp.
        .pccpp
        pcppcp
        pcpccp
        .eppee
        `,
        { p: P.pele, c: oc, e: oe },
        9,
        10,
    );
    t.pinta(14, 12, om);
    t.contornar();
    for (let x = 0; x < T; x++) if (t.le(x, T - 1) === k && t.le(x, T - 2) === 0) t.pinta(x, T - 1, 0);
    return t;
}

function caveiraDePeixe(M) {
    const t = new Tela(T, T);
    const [oe, om, oc] = M.osso;
    // crânio
    t.elipse(3.5, 12, 2.4, 2.1, (x, y, u, v) => (v < 0 ? oc : om));
    t.pinta(3, 11, k);
    t.pinta(1, 13, om);
    t.pinta(1, 14, oc);
    t.pinta(2, 14, oe);
    // espinha e costelas
    for (let x = 6; x <= 11; x++) t.pinta(x, 12, x % 2 ? om : oc);
    for (const x of [7, 10]) {
        for (let y = 9; y <= 14; y++) if (y !== 12) t.pinta(x, y, y < 12 ? oc : om);
    }
    // rabo
    for (const [x, y, p] of [
        [12, 12, om],
        [13, 11, oc],
        [14, 10, oc],
        [13, 13, om],
        [14, 14, om],
        [14, 11, om],
        [14, 13, oe],
    ]) {
        t.pinta(x, y, p);
    }
    t.contornar();
    for (let x = 0; x < T; x++) if (t.le(x, T - 1) === k && t.le(x, T - 2) === 0) t.pinta(x, T - 1, 0);
    return t;
}

// ---- mar ----
// crista da onda (linha da superfície) por coluna; anda 4 px por quadro e o
// desenho tem período 16, então o quadro 4 seria igual ao 0 (loop perfeito)
const CRISTA = [7, 7, 7, 7, 6, 6, 5, 4, 4, 5, 6, 6, 7, 7, 7, 7];

function marSuperficie(M, quadro) {
    const t = new Tela(T, T, { repete: true });
    const [ae, am, ac] = M.agua;
    const desloca = quadro * 4;
    const crista = (x) => CRISTA[(((x - desloca) % T) + T) % T];
    for (let x = 0; x < T; x++) {
        const h = crista(x);
        for (let y = h; y < T; y++) {
            let p;
            if (y < 11) p = am;
            else if (y < 14) p = pontilhar(x, y, (y - 10) / 4) ? ae : am;
            else p = ae;
            t.pinta(x, y, p);
        }
        t.pinta(x, h, ac);
        if (h <= 5) t.pinta(x, h + 1, ac); // espuma na crista
        if (h === 6) t.pinta(x, h + 1, am);
    }
    // sombra embaixo da crista e brilhos que andam com a onda
    for (const [x, y, l, p] of [
        [7, 8, 3, ae],
        [1, 10, 2, ac],
        [12, 9, 2, ac],
        [4, 12, 3, am],
    ]) {
        for (let i = 0; i < l; i++) t.pinta(x + i + desloca, y, p);
    }
    return t;
}

function marFundo(M) {
    const t = new Tela(T, T, { repete: true });
    const [ae, am] = M.agua;
    t.ret(0, 0, T, T, ae);
    for (const [x, y, l] of [
        [2, 3, 3],
        [10, 7, 2],
        [5, 11, 3],
        [13, 14, 2],
    ]) {
        for (let i = 0; i < l; i++) t.pinta(x + i, y, am);
    }
    return t;
}

// Os 48 tiles na ordem dos ids do tileset (grade 16×16 cada)
function gradesDosTiles(estilo) {
    const M = materiais();
    const vazio = () => new Tela(T, T);
    const tiles = [
        gramaTopo(M, 0), // 0
        gramaTopo(M, 1), // 1
        terra(novoTile(), M), // 2
        terraComPedra(M), // 3
        rocha(M, 0), // 4
        rocha(M, 1), // 5
        areiaTopo(M), // 6
        areia(novoTile(), M), // 7
        quinaDeGrama(M, "esq"), // 8
        quinaDeGrama(M, "dir"), // 9
        lateralDeTerra(M, "esq"), // 10
        lateralDeTerra(M, "dir"), // 11
        quinaDeAreia(M, "esq"), // 12
        quinaDeAreia(M, "dir"), // 13
        pedraMolhada(M, true), // 14
        pedraMolhada(M, false), // 15
        caixa(M, 0), // 16
        caixa(M, 1), // 17
        tabua(M, "esq"), // 18
        tabua(M, "meio"), // 19
        tabua(M, "dir"), // 20
        pernaDeAndaime(M), // 21
        barril(M), // 22
        redeECorda(M), // 23
        marSuperficie(M, 0), // 24
        marSuperficie(M, 1), // 25
        marSuperficie(M, 2), // 26
        marSuperficie(M, 3), // 27
        marFundo(M), // 28
        vazio(), // 29
        vazio(), // 30
        vazio(), // 31
        tufo(M), // 32
        flores(M), // 33
        pedrinhas(M), // 34
        cerca(M), // 35
        placa(M), // 36
        ancora(M), // 37
        conchas(M), // 38
        caveiraDePeixe(M), // 39
    ];
    while (tiles.length < 48) tiles.push(vazio());
    return tiles.map((t) => t.g);
}

export const TILE = {
    grama: 0,
    terra: 2,
    terraPedra: 3,
    rocha: 4,
    areiaTopo: 6,
    areia: 7,
    quinaEsq: 8,
    quinaDir: 9,
    lateralEsq: 10,
    lateralDir: 11,
    quinaAreiaEsq: 12,
    quinaAreiaDir: 13,
    costaTopo: 14,
    costa: 15,
    caixa: 16,
    tabuaEsq: 18,
    tabuaMeio: 19,
    tabuaDir: 20,
    perna: 21,
    barril: 22,
    rede: 23,
    mar: 24,
    marFundo: 28,
    tufo: 32,
    flores: 33,
    pedrinhas: 34,
    cerca: 35,
    placa: 36,
    ancora: 37,
    conchas: 38,
    caveira: 39,
};

function folhaDeTiles(grades) {
    const t = new Tela(128, 96);
    grades.forEach((g, id) => t.colar(g, (id % 8) * T, Math.floor(id / 8) * T));
    return t.g;
}

// ===========================================================================
// CASA (64×48)
// ===========================================================================
function desenharCasa(estilo) {
    const M = materiais();
    const t = new Tela(64, 48);
    const [pe, pm, pc] = M.pedra;
    const [we, wm, wc] = M.madeiraClara;
    const [me, mm, mc] = M.madeira;
    const [ce, cm] = M.capa;
    const [le, lm, lc] = M.luz;

    // paredes de tábuas em pé
    for (let y = 19; y <= 40; y++) {
        for (let x = 5; x <= 58; x++) {
            const r = (x - 5) % 4;
            let p = r === 3 ? we : r === 0 ? wc : wm;
            if (y <= 21) p = we; // sombra do beiral
            if (x >= 54) p = r === 0 ? wm : we; // canto de trás, longe da luz
            t.pinta(x, y, p);
        }
    }
    // esteios dos cantos e viga de baixo
    for (const x of [5, 6, 57, 58]) for (let y = 21; y <= 40; y++) t.pinta(x, y, x === 5 ? mc : x === 58 ? me : mm);
    for (let x = 5; x <= 58; x++) t.pinta(x, 40, me);

    // alicerce de pedra
    for (let y = 41; y <= 47; y++) {
        for (let x = 3; x <= 60; x++) {
            const fileira = y < 44 ? 0 : 1;
            const junta = y === 44 || (x + fileira * 4) % 9 === 0;
            let p = junta ? pe : y === 41 || y === 45 ? pc : pm;
            if (x > 54 && !junta) p = pm;
            t.pinta(x, y, p);
        }
    }

    // telhado (de lado, com cumeeira) em fiadas de telha
    for (let i = 0; i <= 15; i++) {
        const y = 19 - i;
        for (let x = i; x <= 63 - i; x++) {
            const fiada = Math.floor(i / 3);
            let p = i % 3 === 0 ? ce : cm;
            if (i % 3 === 1 && (x + fiada * 3) % 6 === 0) p = ce;
            if (x === i || x === 63 - i) p = k;
            if (x > 52 - i * 0.3 && p === cm && x > 32) p = (x + y) % 2 === 0 ? cm : p; // lado de trás igual
            t.pinta(x, y, p);
        }
    }
    for (let x = 15; x <= 48; x++) t.pinta(x, 3, k); // cumeeira
    for (let x = 0; x <= 63; x++) t.pinta(x, 20, k); // beiral
    // chaminé
    for (let y = 0; y <= 9; y++) {
        for (let x = 44; x <= 50; x++) {
            let p = x === 44 || x === 50 ? k : x < 47 ? pc : pm;
            if (y === 0) p = k;
            if (y === 1) p = x === 44 || x === 50 ? k : pc;
            if (y === 4 && x > 44 && x < 50) p = pe;
            t.pinta(x, y, p);
        }
    }
    t.ret(43, 0, 9, 1, k);
    t.ret(43, 1, 1, 2, k);
    t.ret(51, 1, 1, 2, k);
    t.ret(44, 2, 7, 1, k);

    // janela acesa
    t.ret(10, 24, 11, 11, k);
    for (let y = 25; y <= 33; y++) {
        for (let x = 11; x <= 19; x++) {
            let p = lm;
            if (y >= 32 || x >= 18) p = le;
            if ((x <= 12 && y <= 26) || (x === 16 && y === 30)) p = lc;
            if (x === 15 || y === 29) p = mm;
            t.pinta(x, y, p);
        }
    }
    t.ret(9, 35, 13, 1, mc);
    t.ret(9, 36, 13, 1, k);

    // porta (x 26 a 37, base em y 47)
    t.ret(26, 26, 12, 22, k);
    for (let y = 27; y <= 47; y++) {
        for (let x = 27; x <= 36; x++) {
            const r = (x - 27) % 3;
            let p = r === 2 ? me : r === 0 ? mc : mm;
            if (y === 31 || y === 42) p = mc;
            if (y === 32 || y === 43) p = me;
            t.pinta(x, y, p);
        }
    }
    t.pinta(34, 37, M.metal[2]);
    t.pinta(34, 38, M.metal[1]);
    // lampiãozinho ao lado da porta
    t.ret(39, 25, 4, 1, k);
    t.ret(39, 26, 3, 4, k);
    t.pinta(40, 27, lc);
    t.pinta(40, 28, lm);

    // boia salva-vidas pendurada
    t.pinta(47, 23, k);
    t.elipse(47.5, 29, 4.2, 4.2, (x, y, u, v) => {
        const d = Math.hypot(u, v);
        if (d < 0.45) return 0;
        const ang = Math.atan2(v, u) + Math.PI / 4;
        const quarto = Math.floor(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
        return quarto % 2 === 0 ? P.capa : M.branco[2];
    });
    t.contornar();
    return t;
}

// ===========================================================================
// TORRE (6 quadros de 48×128)
// ===========================================================================
const TORRE = { largura: 48, altura: 128, cx: 24, topo: 30, base: 115, plinto: 116 };
const meiaDaTorre = (y) => Math.round(9 + ((y - TORRE.topo) / (TORRE.base - TORRE.topo)) * 4);
const FAIXA = (TORRE.base - TORRE.topo + 1) / 6;

// borda quebrada da ruína: frente (f) e parede de trás vista por dentro (b)
// dentes altos à esquerda, um entalhe fundo e degraus de tijolo descendo para a direita
const FRENTE_RUINA = [61, 58, 57, 58, 62, 66, 71, 73, 70, 66, 64, 63, 65, 69, 73, 75, 76, 78, 77, 80, 83, 84, 86, 87, 89, 90, 92];
const SERRA_TRAS = [0, 0, -1, 0, 1, 0, 0, -1, 0, 1, 1, 0, -1, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 0, 0];
const frenteQuebrada = (dx) => FRENTE_RUINA[dx + 13];
const trasQuebrada = (dx) => Math.min(frenteQuebrada(dx), Math.round(59 + (dx + 13) * 0.7 + SERRA_TRAS[dx + 13]));

function pedraDaTorre(x, y, mat, u, linha = 5, comprimento = 8) {
    const [e, m, c] = mat;
    const fileira = Math.floor(y / linha);
    const dentro = y % linha;
    const sombra = u > 0.78;
    if (dentro === linha - 1) return sombra ? k : e;
    if ((x + (fileira % 2) * (comprimento >> 1)) % comprimento === 0) return sombra ? k : e;
    if (sombra) return e;
    if (dentro === 0 && u < 0.55) return c;
    return m;
}

function pinturaDaTorre(y, u, M) {
    const faixa = Math.floor((y - TORRE.topo) / FAIXA);
    if (faixa % 2 === 0) return u < 0.78 ? M.capa[1] : M.capa[0];
    const [b0, b1, b2, b3] = M.branco;
    return u < 0.18 ? b3 : u < 0.58 ? b2 : u < 0.84 ? b1 : b0;
}

function andaime(t, M, { postes, topo, tabuas = [], niveis = [] }) {
    const [e, m, c] = M.madeira;
    const [ce, cc] = M.corda;
    const [xa, xb] = postes;
    const base = TORRE.altura - 1;
    // travessas diagonais entre os postes (atrás das tábuas)
    const ys = [base, ...niveis].sort((a, b) => b - a);
    for (let i = 0; i + 1 < ys.length; i++) {
        const de = i % 2 === 0 ? [xa + 2, ys[i] - 1, xb - 1, ys[i + 1] + 2] : [xb - 1, ys[i] - 1, xa + 2, ys[i + 1] + 2];
        t.linha(de[0], de[1] + 1, de[2], de[3] + 1, k);
        t.linha(de[0], de[1], de[2], de[3], m);
    }
    for (const x of postes) {
        for (let y = topo; y <= base; y++) {
            t.pinta(x - 1, y, k);
            t.pinta(x, y, c);
            t.pinta(x + 1, y, e);
            t.pinta(x + 2, y, k);
        }
        t.pinta(x, topo - 1, k);
        t.pinta(x + 1, topo - 1, k);
    }
    for (const [y, x0, x1] of tabuas) {
        for (let x = x0; x <= x1; x++) {
            t.pinta(x, y - 1, k);
            t.pinta(x, y, c);
            t.pinta(x, y + 1, (x * 7) % 9 === 0 ? e : m);
            t.pinta(x, y + 2, k);
        }
        t.ret(x0 - 1, y - 1, 1, 4, k);
        t.ret(x1 + 1, y - 1, 1, 4, k);
        for (const x of postes) {
            if (x >= x0 && x <= x1) {
                t.pinta(x, y + 3, cc);
                t.pinta(x + 1, y + 3, ce);
            }
        }
    }
}

function blocos(t, M, lista, mat = "pedra") {
    const [e, m, c] = M[mat];
    for (const [x0, y0, l, a] of lista) {
        t.ret(x0, y0, l, a, k);
        t.ret(x0 + 1, y0 + 1, l - 2, a - 2, m);
        t.ret(x0 + 1, y0 + 1, l - 2, 1, c);
        if (a > 3) t.ret(x0 + l - 2, y0 + 2, 1, a - 3, e);
    }
}

function desenharTorre(estilo, estagio) {
    const M = materiais();
    const t = new Tela(TORRE.largura, TORRE.altura);
    const { cx } = TORRE;
    const [ge, gm, gc] = M.grama;
    const novo = M.pedra;
    const velho = M.pedraVelha;

    // até onde a pedra nova chega em cada coluna (estágios 1 a 5)
    const topoNovo = (dx) => {
        if (estagio === 0) return Infinity;
        if (estagio === 1) return dx >= 4 ? Math.min(frenteQuebrada(dx), 80) : Infinity;
        if (estagio === 2) return dx < -4 ? 50 : dx < 4 ? 55 : 60;
        return TORRE.topo;
    };
    const pintadoDesde = estagio >= 4 ? TORRE.topo : estagio === 3 ? Math.ceil(TORRE.topo + 3 * FAIXA) : Infinity;

    // ---- plinto ----
    const matPlinto = estagio >= 3 ? novo : velho;
    for (let y = TORRE.plinto; y < TORRE.altura; y++) {
        for (let dx = -17; dx <= 17; dx++) {
            const u = (dx + 17) / 34;
            const x = cx + dx;
            let p = pedraDaTorre(x, y - TORRE.plinto, matPlinto, u, 4, 9);
            if (y === TORRE.plinto) p = u > 0.78 ? matPlinto[1] : matPlinto[2];
            t.pinta(x, y, p);
        }
    }

    // ---- corpo ----
    for (let y = TORRE.topo; y <= TORRE.base; y++) {
        const meia = meiaDaTorre(y);
        for (let dx = -meia; dx <= meia; dx++) {
            const x = cx + dx;
            const u = (dx + meia) / (2 * meia);
            const frente = Math.abs(dx) <= 13 ? frenteQuebrada(dx) : 62;
            const tras = Math.abs(dx) <= 13 ? trasQuebrada(dx) : 62;
            const novoAqui = y >= topoNovo(dx) && y < frente;
            if (y >= pintadoDesde && (y >= frente || novoAqui)) {
                t.pinta(x, y, pinturaDaTorre(y, u, M));
            } else if (novoAqui) {
                let p = pedraDaTorre(x, y, novo, u);
                if (y === topoNovo(dx) && u < 0.8) p = novo[2];
                t.pinta(x, y, p);
            } else if (y >= frente) {
                let p = pedraDaTorre(x, y, velho, u);
                if (y === frente && estagio < 2) p = u < 0.8 ? velho[2] : velho[1];
                t.pinta(x, y, p);
            } else if (estagio < 2 && y >= tras) {
                // parede de trás vista pelo buraco: lado de dentro, na sombra
                t.pinta(x, y, y === tras ? velho[1] : y % 5 === 4 ? k : velho[0]);
            }
        }
    }

    // ---- restos de tinta na ruína (estágios 0 a 2) ----
    if (estagio <= 2) {
        const y0 = Math.ceil(TORRE.topo + 4 * FAIXA);
        const y1 = Math.floor(TORRE.topo + 5 * FAIXA);
        for (let y = y0; y < y1; y++) {
            const meia = meiaDaTorre(y);
            for (let dx = -meia; dx <= meia; dx++) {
                // só onde ainda há pedra velha
                if (y < frenteQuebrada(dx) + 1) continue;
                const u = (dx + meia) / (2 * meia);
                // bordas da faixa rasgadas e umas lascas por dentro; o resto segue a faixa inteira
                const borda = Math.min(y - y0, y1 - 1 - y);
                if (borda === 0 && ruido(cx + dx, y, 3) < 0.5) continue;
                if (borda === 1 && ruido(cx + dx, y, 4) < 0.2) continue;
                if (ruido(Math.floor((cx + dx) / 2), Math.floor(y / 2), 7) < 0.1) continue;
                t.pinta(cx + dx, y, u < 0.78 ? M.capa[1] : M.capa[0]);
            }
        }
    }

    // ---- janelas ----
    for (const wy of [50, 80]) {
        // a janela só aparece onde já existe parede
        if (wy < Math.min(topoNovo(0), frenteQuebrada(0)) + 2) continue;
        t.ret(cx - 2, wy - 1, 5, 7, k);
        t.ret(cx - 1, wy, 3, 5, estagio === 5 ? M.luz[0] : P.sombra);
        if (estagio === 5) t.pinta(cx - 1, wy, M.luz[1]);
        t.ret(cx - 2, wy + 6, 5, 1, novo[2]);
    }

    // ---- porta ----
    const porta = { x0: cx - 4, x1: cx + 4, y0: 106 };
    for (let y = porta.y0; y < TORRE.altura; y++) {
        const recuo = y === porta.y0 ? 2 : y === porta.y0 + 1 ? 1 : 0;
        for (let x = porta.x0 + recuo; x <= porta.x1 - recuo; x++) {
            const borda = x === porta.x0 + recuo || x === porta.x1 - recuo || y === porta.y0;
            if (estagio < 2) {
                t.pinta(x, y, borda ? k : y % 4 === 0 ? k : P.sombra);
            } else {
                const r = (x - porta.x0) % 3;
                t.pinta(x, y, borda ? k : r === 0 ? M.madeira[2] : r === 2 ? M.madeira[0] : M.madeira[1]);
            }
        }
    }
    if (estagio < 2) {
        // tábuas pregadas em X na porta velha
        t.linha(porta.x0 + 1, 111, porta.x1 - 1, 121, M.madeira[1]);
        t.linha(porta.x0 + 1, 112, porta.x1 - 1, 122, k);
        t.linha(porta.x0 + 1, 120, porta.x1 - 1, 113, M.madeira[2]);
    } else {
        t.pinta(porta.x1 - 2, 117, M.metal[2]);
    }

    // ---- ruína: rachaduras, musgo, trepadeira e entulho ----
    if (estagio <= 1) {
        const rachar = (pontos) => {
            for (let i = 0; i + 1 < pontos.length; i++) t.linha(...pontos[i], ...pontos[i + 1], k);
        };
        rachar([
            [cx + 2, frenteQuebrada(2) + 1],
            [cx, frenteQuebrada(2) + 7],
            [cx + 3, frenteQuebrada(2) + 13],
            [cx + 1, frenteQuebrada(2) + 19],
        ]);
        rachar([
            [cx - 7, 99],
            [cx - 5, 105],
            [cx - 8, 112],
        ]);
        // musgo no alto da quebra, escorrendo
        for (const [dx, l] of [
            [-12, 3],
            [-11, 5],
            [-10, 2],
            [-5, 4],
            [-4, 2],
            [3, 3],
            [8, 2],
            [9, 4],
        ]) {
            const y = frenteQuebrada(dx);
            t.pinta(cx + dx, y - 1, gc);
            for (let i = 0; i < l; i++) t.pinta(cx + dx, y + i, i === l - 1 ? ge : gm);
        }
        // trepadeira subindo pela esquerda
        for (let y = 70; y <= 114; y++) {
            const x = cx - meiaDaTorre(y) + (Math.floor(y / 7) % 2);
            if (y < frenteQuebrada(x - cx) + 2) continue;
            t.pinta(x, y, y % 3 === 0 ? gm : ge);
            if (y % 6 === 0) {
                t.pinta(x + 1, y, gc);
                t.pinta(x - 1, y + 1, gm);
            }
        }
        // musgo no plinto
        for (const dx of [-16, -15, -9, 6, 7, 12]) t.pinta(cx + dx, TORRE.plinto, dx % 2 ? gm : gc);
    }
    if (estagio === 0) {
        blocos(
            t,
            M,
            [
                [0, 122, 6, 6],
                [5, 124, 4, 4],
                [41, 121, 5, 7],
                [44, 124, 4, 4],
                [9, 114, 4, 3],
                [cx - 12, 54, 4, 3],
                [cx + 4, 74, 3, 3],
            ],
            "pedraVelha",
        );
    }

    // ---- topo da obra no estágio 3: vigas da galeria saindo ----
    if (estagio === 3) {
        for (let x = cx - 14; x <= cx + 14; x++) {
            t.pinta(x, 27, k);
            t.pinta(x, 28, (x - cx) % 7 === 0 ? k : M.madeira[2]);
            t.pinta(x, 29, M.madeira[0]);
        }
        blocos(t, M, [
            [cx - 6, 22, 6, 5],
            [cx + 1, 23, 5, 4],
        ]);
    }

    // ---- galeria, sala da lanterna e cúpula (estágios 4 e 5) ----
    if (estagio >= 4) {
        const [mk, mm, mc] = M.metal;
        // mísulas de pedra embaixo da galeria
        for (let y = 30; y <= 33; y++) {
            const meia = 15 - (y - 30) * 2;
            for (let dx = -meia; dx <= meia; dx++) {
                if (Math.abs(dx) <= meiaDaTorre(y) && y > 30) continue;
                t.pinta(cx + dx, y, y === 30 ? novo[2] : dx < 0 ? novo[1] : novo[0]);
            }
        }
        // piso da galeria
        for (let dx = -15; dx <= 15; dx++) {
            t.pinta(cx + dx, 26, mc);
            t.pinta(cx + dx, 27, mm);
            t.pinta(cx + dx, 28, mm);
            t.pinta(cx + dx, 29, mk);
        }
        // pedestal branco embaixo da lanterna
        for (let y = 22; y <= 25; y++) {
            for (let dx = -8; dx <= 8; dx++) t.pinta(cx + dx, y, pinturaDaTorre(TORRE.topo + FAIXA + 1, (dx + 8) / 16, M));
        }
        // base da sala da lanterna
        for (let dx = -7; dx <= 7; dx++) {
            t.pinta(cx + dx, 20, mk);
            t.pinta(cx + dx, 21, dx < -2 ? mc : mm);
        }
        // vidro e montantes (lanterna centrada em x 24, y 14)
        for (let y = 8; y <= 19; y++) {
            for (let dx = -6; dx <= 6; dx++) {
                const x = cx + dx;
                const montante = Math.abs(dx) === 6 || Math.abs(dx) === 3 || y === 8 || y === 19;
                if (montante) {
                    t.pinta(x, y, k);
                    continue;
                }
                if (estagio === 5) {
                    const d = Math.hypot(dx, y - 14);
                    t.pinta(x, y, d < 2.3 ? M.luz[2] : d < 3.8 ? M.luz[1] : pontilhar(x, y, 0.5) ? M.luz[1] : M.luz[0]);
                } else {
                    // vidro novo, ainda apagado
                    t.pinta(x, y, dx === -5 && y < 14 ? P.brilhoFrio : dx === -4 && y < 11 ? P.espuma : P.aguaEscura);
                }
            }
        }
        // cúpula vermelha com respiro
        for (let y = 3; y <= 7; y++) {
            const meia = y === 7 ? 8 : Math.round(Math.sqrt(1 - Math.pow((7 - y) / 5, 2)) * 7);
            for (let dx = -meia; dx <= meia; dx++) {
                const u = (dx + meia) / (2 * meia || 1);
                let p = u < 0.6 ? M.capa[1] : M.capa[0];
                if (y === 7) p = mk;
                if (y === 4 && dx === -3) p = M.branco[2];
                t.pinta(cx + dx, y, p);
            }
        }
        t.ret(cx - 1, 1, 3, 2, mm);
        t.pinta(cx - 1, 1, mc);
        t.pinta(cx, 0, mk);
        // grade da galeria (na frente do pedestal)
        for (let dx = -15; dx <= 15; dx++) {
            t.pinta(cx + dx, 21, Math.abs(dx) > 7 ? mm : t.le(cx + dx, 21));
            t.pinta(cx + dx, 22, Math.abs(dx) > 7 ? mk : t.le(cx + dx, 22));
            if ((dx + 15) % 3 === 0) for (let y = 22; y <= 25; y++) t.pinta(cx + dx, y, mk);
        }
    }

    // ---- andaimes, tábuas e pedras novas (estágios 1 a 4) ----
    const [ce, cc] = M.corda;
    if (estagio === 1) {
        andaime(t, M, { postes: [2, 8], topo: 80, niveis: [101, 83], tabuas: [[101, 0, 20], [83, 0, 17]] });
        // balde pendurado na corda
        t.ret(15, 86, 1, 8, cc);
        t.desenho(
            `
            kkkkk
            kmcmk
            kmmek
            .kkk.
            `,
            { k, m: M.metal[1], c: M.metal[2], e: k },
            13,
            94,
        );
        blocos(t, M, [
            [38, 122, 6, 6],
            [43, 122, 5, 6],
            [40, 117, 6, 5],
        ]);
    }
    if (estagio === 2) {
        andaime(t, M, {
            postes: [2, 8],
            topo: 47,
            niveis: [101, 79, 57],
            tabuas: [
                [101, 0, 20],
                [79, 0, 18],
                [57, 0, 17],
            ],
        });
        andaime(t, M, {
            postes: [39, 45],
            topo: 63,
            niveis: [92, 66],
            tabuas: [
                [92, 31, 47],
                [66, 30, 47],
            ],
        });
        // balde de argamassa e pedra esperando na tábua de cima
        t.desenho(
            `
            kkkkk
            kccck
            kmmek
            .kkk.
            `,
            { k, m: M.metal[1], c: novo[2], e: k },
            10,
            52,
        );
        blocos(t, M, [
            [40, 61, 5, 4],
            [42, 122, 6, 6],
        ]);
    }
    if (estagio === 3) {
        andaime(t, M, {
            postes: [2, 8],
            topo: 25,
            niveis: [101, 79, 57, 35],
            tabuas: [
                [101, 0, 20],
                [79, 0, 18],
                [57, 0, 17],
                [35, 0, 16],
            ],
        });
        andaime(t, M, {
            postes: [39, 45],
            topo: 25,
            niveis: [90, 68, 46],
            tabuas: [
                [90, 31, 47],
                [68, 30, 47],
                [46, 32, 47],
            ],
        });
        // lata de tinta na tábua
        t.desenho(
            `
            kkkk
            krrk
            kmek
            kkkk
            `,
            { k, r: P.capa, m: M.metal[1], e: k },
            40,
            64,
        );
    }
    if (estagio === 4) {
        andaime(t, M, {
            postes: [40, 45],
            topo: 18,
            niveis: [56, 34],
            tabuas: [
                [56, 34, 47],
                [34, 38, 47],
            ],
        });
        // roldana com corda
        t.ret(36, 17, 11, 1, k);
        t.ret(36, 16, 11, 1, M.madeira[2]);
        t.ret(36, 15, 11, 1, k);
        for (let y = 18; y <= 30; y++) t.pinta(37, y, y % 2 ? cc : ce);
        t.pinta(36, 31, k);
        t.pinta(37, 31, M.metal[1]);
        t.pinta(38, 31, k);
    }

    t.contornar();
    // a base não leva contorno embaixo (encosta no chão)
    return t;
}

// ===========================================================================
// POSTE (2 quadros de 16×48)
// ===========================================================================
function desenharPoste(estilo, aceso) {
    const M = materiais();
    const t = new Tela(16, 48);
    const [mk, mm, mc] = M.metal;
    const [pe, pm, pc] = M.pedra;
    // sapata de pedra
    for (let y = 43; y <= 47; y++) for (let x = 4; x <= 11; x++) t.pinta(x, y, y === 43 ? pc : x < 7 ? pm : x > 9 ? pe : pm);
    // haste
    for (let y = 12; y <= 42; y++) {
        t.pinta(7, y, mc);
        t.pinta(8, y, mm);
        t.pinta(9, y, mk);
    }
    for (const y of [30, 40]) {
        t.ret(6, y, 5, 2, mm);
        t.ret(6, y, 2, 1, mc);
    }
    // braço e lanterna (lâmpada em x 8, y 6)
    t.ret(5, 10, 7, 2, mm);
    t.ret(5, 10, 3, 1, mc);
    t.ret(4, 2, 9, 1, mm);
    t.ret(5, 1, 7, 1, mm);
    t.ret(6, 1, 2, 1, mc);
    t.pinta(8, 0, mk);
    for (let y = 3; y <= 9; y++) {
        for (let x = 5; x <= 11; x++) {
            if (x === 5 || x === 11) {
                t.pinta(x, y, mk);
                continue;
            }
            if (aceso) {
                const d = Math.hypot(x - 8, y - 6);
                t.pinta(x, y, d < 1.5 ? M.luz[2] : y >= 8 || x === 10 ? M.luz[0] : M.luz[1]);
            } else {
                t.pinta(x, y, x === 6 && y <= 5 ? P.brilhoFrio : P.aguaEscura);
            }
        }
    }
    if (!aceso) t.pinta(8, 7, mk);
    t.contornar();
    return t;
}

// ===========================================================================
// LUA, SOL, NUVENS, FUNDO DE ILHAS
// ===========================================================================
function desenharLua() {
    const t = new Tela(24, 24);
    const c = { x: 11.5, y: 11.5, r: 10.5 };
    for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
            const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
            if (d > c.r) continue;
            const corte = Math.hypot(x + 0.5 - (c.x + 6), y + 0.5 - (c.y - 3));
            if (corte < c.r - 1.5) continue;
            let p = d > c.r - 1.4 ? P.espuma : P.brilhoFrio;
            if (corte < c.r) p = P.pedraClara; // terminador
            t.pinta(x, y, p);
        }
    }
    for (const [x, y] of [
        [4, 12],
        [5, 8],
        [6, 16],
        [7, 17],
    ]) {
        if (t.le(x, y) === P.brilhoFrio) t.pinta(x, y, P.pedraClara);
    }
    return t;
}

function desenharSol() {
    const t = new Tela(48, 48);
    const c = 23.5;
    for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 48; x++) {
            const d = Math.hypot(x + 0.5 - c - 0.5, y + 0.5 - c - 0.5);
            if (d < 11) t.pinta(x, y, d < 8.5 && !(d > 6.5 && y > c + 3) ? P.solClaro : P.sol);
            else if (d < 15) {
                if (pontilhar(x, y, 0.6 * (1 - (d - 11) / 4) + 0.15)) t.pinta(x, y, P.sol);
            } else if (d < 23) {
                if (pontilhar(x, y, 0.32 * (1 - (d - 15) / 8))) t.pinta(x, y, P.ceuBaixo);
            }
        }
    }
    return t;
}

// nuvem fina iluminada por baixo: borda de baixo clara, miolo e topo esfumado
function pintarNuvem(t, elipses, { brilho = P.sol, corpo = P.ceuBaixo, topo = P.ceuMeio } = {}) {
    const dentro = (x, y) => elipses.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [cx, cy, rx, ry] of elipses) {
        x0 = Math.min(x0, Math.floor(cx - rx));
        x1 = Math.max(x1, Math.ceil(cx + rx));
        y0 = Math.min(y0, Math.floor(cy - ry));
        y1 = Math.max(y1, Math.ceil(cy + ry));
    }
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            if (!dentro(x, y)) continue;
            let p = corpo;
            if (!dentro(x, y + 1)) p = brilho;
            else if (!dentro(x, y - 1) || !dentro(x, y - 2)) p = pontilhar(x, y, 0.5) ? corpo : topo;
            t.pinta(x, y, p);
        }
    }
}

const NUVENS = [
    [
        [20, 16, 16, 3],
        [36, 14, 13, 4],
        [50, 17, 10, 2.5],
        [8, 18, 7, 2],
    ],
    [
        [16, 10, 12, 2.5],
        [28, 9, 9, 3],
        [40, 20, 18, 3],
        [56, 21, 6, 2],
    ],
    [
        [32, 15, 26, 2.5],
        [24, 12, 10, 3],
        [44, 13, 8, 2.5],
        [12, 17, 7, 1.6],
    ],
];

function desenharNuvens() {
    const t = new Tela(192, 32);
    NUVENS.forEach((lista, i) => pintarNuvem(t, lista.map(([x, y, rx, ry]) => [x + i * 64, y, rx, ry])));
    return t;
}

// altura em pixels a partir de baixo, com período 640 (emenda na horizontal)
function ondaPeriodica(x, termos) {
    return termos.reduce((s, [amp, ciclos, fase]) => s + amp * Math.sin((2 * Math.PI * ciclos * x) / 640 + fase), 0);
}

function desenharFundoIlhas() {
    const t = new Tela(640, 64, { repete: true });
    // morros distantes, com névoa perto da água
    for (let x = 0; x < 640; x++) {
        const h = Math.round(
            24 +
                ondaPeriodica(x, [
                    [8, 2, 0.3],
                    [6, 5, 1.2],
                    [3, 11, 2.1],
                    [1.5, 23, 0.7],
                ]),
        );
        for (let y = 64 - h; y < 64; y++) {
            const bruma = (y - 46) / 18;
            t.pinta(x, y, bruma > 0 && pontilhar(x, y, bruma * 0.7) ? P.ceuBaixo : P.ceuMeio);
        }
    }
    // ilhas mais perto, escuras, com pinheirinhos
    const ilhas = [
        [70, 80, 20],
        [250, 45, 12],
        [430, 110, 26],
        [585, 40, 9],
    ];
    const alturaIlha = (x) => {
        let h = 0;
        for (const [cx, larg, alt] of ilhas) {
            let d = Math.abs(x - cx);
            d = Math.min(d, 640 - d);
            if (d < larg / 2) h = Math.max(h, alt * Math.pow(Math.cos((d / (larg / 2)) * (Math.PI / 2)), 0.7));
        }
        return h > 0 ? Math.round(h + 1.5 * Math.sin(x / 3.1) + Math.sin(x / 1.7)) : 0;
    };
    for (let x = 0; x < 640; x++) {
        const h = alturaIlha(x);
        for (let y = 64 - h; y < 64; y++) t.pinta(x, y, P.ceuAlto);
    }
    for (const [x, alt] of [
        [52, 7],
        [58, 9],
        [64, 6],
        [418, 8],
        [425, 11],
        [433, 9],
        [441, 6],
        [247, 5],
    ]) {
        const base = 64 - alturaIlha(x) + 1;
        for (let i = 0; i < alt; i++) {
            const meia = Math.floor((alt - i) / 3);
            for (let dx = -meia; dx <= meia; dx++) t.pinta(x + dx, base - i, P.ceuAlto);
        }
    }
    return t;
}

// ===========================================================================
// MENU (640×360)
// ===========================================================================
const MENU = { horizonte: 212, sol: { x: 150, r: 30 } };

function desenharMenu(estilo, gradeTorre0, gradeCasa) {
    const M = materiais();
    const t = new Tela(640, 360);
    const H = MENU.horizonte;
    const sol = { x: MENU.sol.x, y: H, r: MENU.sol.r };
    const calmo = (x, y) => x >= 220 && x <= 420 && y >= 150 && y <= 330;

    // ---- céu em faixas com pontilhado Bayer ----
    const tons = [P.ceuAlto, P.ceuMeio, P.ceuBaixo];
    for (let y = 0; y < H; y++) {
        const v = Math.pow(y / H, 1.25) * (tons.length - 1);
        const i = Math.min(Math.floor(v), tons.length - 2);
        const tt = Math.max(0, (v - i - 0.5) / 0.5);
        for (let x = 0; x < 640; x++) t.pinta(x, y, pontilhar(x, y, tt) ? tons[i + 1] : tons[i]);
    }
    // brilho em volta do sol, achatado
    for (let y = 120; y < H; y++) {
        for (let x = 0; x < 420; x++) {
            const d = Math.hypot((x - sol.x) / 150, (y - sol.y) / 62);
            if (d < 1 && pontilhar(x, y, Math.pow(1 - d, 1.4) * 0.85)) t.pinta(x, y, P.sol);
        }
    }
    // estrelas no alto
    const sorte = criarAleatorio(2026);
    for (let i = 0; i < 46; i++) {
        const x = Math.floor(sorte() * 640);
        const y = Math.floor(Math.pow(sorte(), 1.6) * 80);
        if (t.le(x, y) !== P.ceuAlto) continue;
        t.pinta(x, y, sorte() < 0.25 ? P.brilhoFrio : P.ceuMeio);
    }
    // nuvens finas acesas por baixo
    const nuvens = [
        [70, 130, 64, 3],
        [112, 123, 34, 3.5],
        [36, 100, 30, 2.5],
        [70, 96, 18, 2],
        [520, 112, 74, 3],
        [584, 103, 40, 3],
        [470, 134, 40, 2.5],
        [300, 128, 50, 2.2],
        [340, 124, 22, 2.4],
        [52, 50, 36, 2],
        [596, 46, 40, 2],
        [560, 52, 20, 1.6],
    ];
    for (const n of nuvens) {
        const perto = Math.abs(n[0] - sol.x) < 120;
        pintarNuvem(t, [n], { brilho: perto ? P.solClaro : P.sol, corpo: n[1] < 80 ? P.ceuMeio : P.ceuBaixo, topo: n[1] < 80 ? P.ceuAlto : P.ceuMeio });
    }
    // gaivotas
    for (const [x, y] of [
        [246, 104],
        [259, 97],
        [236, 112],
        [470, 86],
    ]) {
        for (const [dx, dy] of [
            [-2, -1],
            [-1, 0],
            [0, 0],
            [1, 0],
            [2, -1],
            [0, 1],
        ]) {
            t.pinta(x + dx, y + dy, P.ceuAlto);
        }
    }

    // ---- sol (metade no horizonte) ----
    for (let y = sol.y - sol.r; y < H; y++) {
        for (let x = sol.x - sol.r; x <= sol.x + sol.r; x++) {
            const d = Math.hypot(x + 0.5 - sol.x, y + 0.5 - sol.y);
            if (d > sol.r) continue;
            let p = d < sol.r - 6 ? P.solClaro : P.sol;
            // faixas finas cortando a parte de baixo do sol (calor no horizonte)
            if (y > H - 10 && (H - y) % 4 === 1) p = P.sol;
            t.pinta(x, y, p);
        }
    }

    // ---- ilhas distantes no horizonte (fora do miolo) ----
    for (let x = 0; x < 640; x++) {
        let h = 0;
        if (x < 112) h = 9 + 3 * Math.sin(x / 13) + 2 * Math.sin(x / 5.3) - Math.max(0, (x - 80) / 4);
        if (x > 196 && x < 216) h = 3 - Math.abs(x - 206) / 4;
        if (x > 424) h = 6 + 3 * Math.sin(x / 17);
        for (let y = Math.round(H - h); y < H; y++) t.pinta(x, y, P.ceuMeio);
    }

    // ---- mar ----
    for (let y = H; y < 360; y++) {
        const prof = (y - H) / (360 - H);
        for (let x = 0; x < 640; x++) {
            let p = P.agua;
            if (y < H + 6) p = pontilhar(x, y, 1 - (y - H) / 6) ? P.ceuMeio : P.agua;
            else if (prof > 0.25) p = pontilhar(x, y, Math.min(1, (prof - 0.25) / 0.35)) ? P.aguaEscura : P.agua;
            t.pinta(x, y, p);
        }
    }
    for (let x = 0; x < 640; x++) t.pinta(x, H, Math.abs(x - sol.x) < 90 ? P.sol : P.ceuBaixo);
    // reflexos do céu e ondas: tracinhos, mais compridos e espaçados perto de quem olha
    const ondas = criarAleatorio(77);
    for (let y = H + 3; y < 360; ) {
        const prof = (y - H) / (360 - H);
        const quantos = 30 - Math.floor(prof * 14);
        for (let i = 0; i < quantos; i++) {
            const x = Math.floor(ondas() * 640);
            const comp = 2 + Math.floor(ondas() * (3 + prof * 14));
            const sorteio = ondas();
            if (calmo(x, y) && sorteio < 0.6) continue;
            let p;
            if (prof < 0.12) p = sorteio < 0.5 ? P.ceuBaixo : P.ceuMeio;
            else if (prof < 0.3) p = sorteio < 0.3 ? P.ceuBaixo : P.aguaEscura;
            else p = sorteio < 0.12 ? P.espuma : P.agua;
            for (let j = 0; j < (calmo(x, y) ? Math.min(comp, 5) : comp); j++) t.pinta(x + j, y, p);
        }
        y += 2 + Math.floor(prof * 6);
    }
    // reflexo do sol: coluna de faixas quebradas
    for (let y = H + 1; y < 336; y++) {
        const prof = (y - H) / (336 - H);
        if ((y - H) % 3 === 2) continue;
        const meia = sol.r * 0.85 + prof * 14 + ruido(y, 1, 5) * 6 - 3;
        const centro = sol.x + (ruido(y, 2, 5) - 0.5) * 8;
        for (let x = Math.round(centro - meia); x <= Math.round(centro + meia); x++) {
            if (ruido(Math.floor(x / 5), y, 9) < 0.18 + prof * 0.45) continue;
            const borda = Math.abs(x - centro) / meia;
            let p;
            if (borda < 0.3 - prof * 0.15) p = P.solClaro;
            else if (borda < 0.7) p = P.sol;
            else if (pontilhar(x, y, 1 - borda)) p = P.ceuBaixo;
            else continue;
            t.pinta(x, y, p);
        }
    }

    // ---- a ilha à direita ----
    const topoIlha = (x) =>
        Math.round(212 - 7 * suave((x - 430) / 26) - 33 * suave((x - 458) / 38) + 1.4 * Math.sin(x / 9) + Math.sin(x / 4.1));
    const linhaDagua = 215;
    const vorIlha = voronoiPeriodico(
        Array.from({ length: 70 }, (_, i) => [430 + ruido(i, 1, 4) * 210, 170 + ruido(i, 2, 4) * 50]),
        4096,
    );
    const [re, rm, rc] = M.rocha;
    const [ge, gm, gc] = M.grama;
    const [ae, am, ac] = M.areia;
    // reflexo escuro da ilha na água
    for (let y = linhaDagua; y < linhaDagua + 18; y++) {
        for (let x = 432; x < 640; x++) {
            if (y - linhaDagua > (212 - topoIlha(x)) * 0.55) continue;
            if ((y - linhaDagua) % 3 === 2 || ruido(Math.floor(x / 7), y, 11) < 0.2) continue;
            t.pinta(x, y, P.aguaEscura);
        }
    }
    for (let x = 428; x < 640; x++) {
        const topo = topoIlha(x);
        const praia = x < 466;
        for (let y = topo; y <= linhaDagua; y++) {
            const fundo = y - topo;
            let p;
            if (praia) {
                p = fundo === 0 ? ac : fundo < 4 ? am : ae;
                if (fundo > 4) p = pontilhar(x, y, 0.5) ? ae : re;
            } else if (fundo < 4) {
                p = fundo === 0 ? gc : fundo === 3 ? ge : gm;
            } else {
                const a = vorIlha(x, y);
                const cima = vorIlha(x, y - 1);
                p = a.folga < 1.1 ? P.sombra : cima.id !== a.id || cima.folga < 1.1 ? rm : re;
                if (y > linhaDagua - 6 && p !== P.sombra) p = pontilhar(x, y, 0.5) ? re : P.sombra;
            }
            t.pinta(x, y, p);
        }
        // grama pingando na rocha
        if (!praia && ruido(x, 3, 1) < 0.35) t.pinta(x, topo + 4, ge);
        // espuma no pé da ilha
        if ((x * 7) % 5 < 3) t.pinta(x, linhaDagua + 1, P.espuma);
        if ((x * 3) % 7 < 2) t.pinta(x - 3, linhaDagua + 2, P.agua);
    }
    // casa e torre quebrada (o mesmo desenho do jogo)
    const xCasa = 494;
    t.colar(gradeCasa, xCasa, topoIlha(xCasa + 32) - 46);
    const xTorre = 560;
    t.colar(gradeTorre0, xTorre, topoIlha(xTorre + 24) - 126);
    // pinheiro na ponta e moitas
    const xPinho = 618;
    const basePinho = topoIlha(xPinho);
    for (let i = 0; i < 30; i++) {
        const meia = Math.floor(((i % 8) + 2) * (1 - i / 34) * 0.9) + 1;
        for (let dx = -meia; dx <= meia; dx++) t.pinta(xPinho + dx, basePinho - 4 - i, dx < 0 ? gm : ge);
        t.pinta(xPinho - meia, basePinho - 4 - i, k);
        t.pinta(xPinho + meia, basePinho - 4 - i, k);
        if (i % 8 === 0) for (let dx = -meia; dx <= meia; dx++) t.pinta(xPinho + dx, basePinho - 4 - i, k);
    }
    t.ret(xPinho - 1, basePinho - 4, 2, 5, M.madeira[0]);
    for (const [x, r] of [
        [474, 4],
        [482, 3],
        [552, 3],
        [610, 3],
    ]) {
        const y = topoIlha(x);
        t.elipse(x, y - 1, r + 0.5, r * 0.7, (xx, yy, u, v) => (v < -0.3 && u < 0.2 ? gc : u > 0.4 ? ge : gm));
    }

    // ---- rochedo da frente, à esquerda, com o faroleiro ----
    const topoRocha = (x) => {
        const jag = 1.5 * Math.sin(x / 5) + Math.sin(x / 2.3);
        if (x <= 104) return Math.round(302 + Math.pow((104 - x) / 104, 1.6) * 16 + jag);
        return Math.round(302 + Math.pow((x - 104) / 72, 1.8) * 44 + jag);
    };
    const vorRocha = voronoiPeriodico(
        Array.from({ length: 40 }, (_, i) => [ruido(i, 5, 2) * 180, 295 + ruido(i, 6, 2) * 65]),
        4096,
    );
    for (let x = 0; x < 182; x++) {
        const topo = topoRocha(x);
        for (let y = topo; y < 360; y++) {
            const a = vorRocha(x, y);
            const cima = vorRocha(x, y - 1);
            let p = a.folga < 1.1 ? k : cima.id !== a.id || cima.folga < 1.1 ? P.pedraEscura : P.sombra;
            if (y === topo) p = x > 70 && x < 150 ? P.sol : P.ceuBaixo; // borda acesa pelo sol atrás
            else if (y === topo + 1) p = x > 60 && x < 160 ? P.ceuBaixo : k;
            t.pinta(x, y, p);
        }
        if (topo > 330) {
            const espuma = topo + 2 + ((x * 5) % 3);
            if (espuma < 360) t.pinta(x + 2, espuma, P.espuma);
        }
    }
    // capim seco no rochedo
    for (const x of [22, 25, 47, 51, 132, 136]) {
        const y = topoRocha(x);
        t.pinta(x, y - 1, k);
        t.pinta(x + 1, y - 2, k);
        t.pinta(x - 1, y - 2, k);
    }
    // o faroleiro (≈8×12), olhando para o farol, com a lamparina acesa
    const corCapa = P.capa;
    const sombraCapa = M.capa[0];
    const faroleiro = `
        ..kkkk..
        .kCCCCk.
        .kCCCpk.
        .kcCCkk.
        kcCCCCk.
        kcCCCCCk
        kcCCCCCk
        .kcCCCk.
        .kcCCCk.
        ..kddk..
        ..kd.dk.
        ..kk.kk.
    `;
    const xf = 92;
    const yf = topoRocha(96) - 12;
    t.desenho(faroleiro, { k, C: corCapa, c: sombraCapa, p: P.pele, d: P.madeiraEscura }, xf, yf);
    // borda acesa do lado do sol
    t.pinta(xf + 6, yf + 4, P.sol);
    t.pinta(xf + 7, yf + 6, P.sol);
    // lamparina na mão
    t.pinta(xf + 8, yf + 6, k);
    t.pinta(xf + 8, yf + 7, P.fogoClaro);
    t.pinta(xf + 8, yf + 8, k);
    for (const [dx, dy] of [
        [9, 7],
        [8, 5],
        [10, 6],
        [9, 9],
    ]) {
        t.pinta(xf + dx, yf + dy, P.fogo);
    }
    return t;
}

// ===========================================================================
// PRÉVIAS
// ===========================================================================
function previaTiles(estilo, folha) {
    const img = new Imagem(128 * 4, 96 * 4);
    const fundo = new Tela(128, 96);
    for (let y = 0; y < 96; y++) for (let x = 0; x < 128; x++) fundo.pinta(x, y, ((x >> 2) + (y >> 2)) % 2 ? P.sombra : P.pedraEscura);
    img.colar(ampliar(gradeParaImagem(fundo.g, estilo), 4), 0, 0);
    img.colar(ampliar(gradeParaImagem(folha, estilo), 4), 0, 0);
    return img;
}

// trecho de ilha montado com os tiles, para conferir emendas e relevo
function previaCena(estilo, grades, torre2, casa, poste, sol, nuvens, fundoIlhas) {
    const t = new Tela(640, 360);
    const H = 272; // superfície do mar (linha 17)
    // céu de fim de tarde simples
    const tons = [P.ceuAlto, P.ceuMeio, P.ceuBaixo];
    for (let y = 0; y < H; y++) {
        const v = Math.pow(y / H, 1.1) * 2;
        const i = Math.min(Math.floor(v), 1);
        const tt = Math.max(0, (v - i - 0.5) / 0.5);
        for (let x = 0; x < 640; x++) t.pinta(x, y, pontilhar(x, y, tt) ? tons[i + 1] : tons[i]);
    }
    t.colar(sol.g, 556, 204);
    t.colar(nuvens.recorte(0, 0, 64, 32), 60, 60);
    t.colar(nuvens.recorte(64, 0, 64, 32), 380, 40);
    t.colar(nuvens.recorte(128, 0, 64, 32), 520, 110);
    t.colar(fundoIlhas.g, 0, H - 64 + 8);

    // relevo: linha do topo por coluna (40 colunas) e o material do topo
    const alto = [99, 99, 99, 16, 16, 16, 16, 15, 14, 14, 14, 12, 12, 12, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12, 12, 12, 14, 14, 14, 16, 16, 99, 99, 99, 99, 99, 99];
    const material = (c) => (c >= 3 && c <= 6 ? "areia" : c >= 32 && c <= 33 ? "costa" : "grama");
    const mapa = Array.from({ length: 23 }, () => new Array(40).fill(-1));
    const temChao = (c) => c >= 0 && c < 40 && alto[c] < 99;
    for (let c = 0; c < 40; c++) {
        if (!temChao(c)) {
            mapa[17][c] = TILE.mar + (c % 4 === 1 ? 2 : 0);
            for (let r = 18; r < 23; r++) mapa[r][c] = TILE.marFundo;
            continue;
        }
        const h = alto[c];
        const esq = temChao(c - 1) ? alto[c - 1] : 99;
        const dir = temChao(c + 1) ? alto[c + 1] : 99;
        const mat = material(c);
        for (let r = h; r < 23; r++) {
            let id;
            if (r === h) {
                if (mat === "areia") id = esq > h ? TILE.quinaAreiaEsq : dir > h && dir < 99 ? TILE.quinaAreiaDir : TILE.areiaTopo;
                else if (mat === "costa") id = TILE.costaTopo;
                else id = esq > h ? TILE.quinaEsq : dir > h ? TILE.quinaDir : (c * 7) % 3 === 0 ? 1 : 0;
            } else if (mat === "costa") {
                id = TILE.costa;
            } else if (mat === "areia") {
                id = r <= h + 3 ? TILE.areia : TILE.rocha;
            } else if (r <= h + 4) {
                const lateralEsq = esq > r && esq < 99;
                const lateralDir = dir > r && dir < 99;
                id = lateralEsq ? TILE.lateralEsq : lateralDir ? TILE.lateralDir : (c * 5 + r) % 7 === 0 ? TILE.terraPedra : TILE.terra;
            } else {
                id = (c + r) % 5 === 0 ? 5 : TILE.rocha;
            }
            mapa[r][c] = id;
        }
    }
    // andaime (tábua em cima de duas pernas) e caixas
    mapa[9][26] = TILE.tabuaEsq;
    mapa[9][27] = TILE.tabuaMeio;
    mapa[9][28] = TILE.tabuaDir;
    const atras = [
        [10, 26, TILE.perna],
        [11, 26, TILE.perna],
        [10, 28, TILE.perna],
        [11, 28, TILE.perna],
    ];
    const deco = [
        [13, 29, TILE.caixa],
        [13, 30, TILE.caixa + 1],
        [12, 29, TILE.caixa + 1],
        [13, 31, TILE.barril],
        [13, 8, TILE.rede],
        [13, 9, TILE.tufo],
        [11, 12, TILE.placa],
        [11, 13, TILE.pedrinhas],
        [11, 11, TILE.flores],
        [9, 14, TILE.tufo],
        [9, 24, TILE.cerca],
        [9, 25, TILE.cerca],
        [15, 4, TILE.conchas],
        [15, 5, TILE.ancora],
        [15, 6, TILE.caveira],
        [14, 7, TILE.tufo],
        [11, 27, TILE.flores],
        [15, 32, TILE.pedrinhas],
    ];
    for (const [r, c, id] of atras) t.colar(grades[id], c * T, r * T);
    for (let r = 0; r < 23; r++) for (let c = 0; c < 40; c++) if (mapa[r][c] >= 0) t.colar(grades[mapa[r][c]], c * T, r * T);
    // objetos grandes no platô (chão em y 160)
    t.colar(casa.g, 15 * T, 160 - 48);
    t.colar(torre2, 20 * T, 160 - 128);
    t.colar(poste.recorte(0, 0, 16, 48), 19 * T, 160 - 48);
    t.colar(poste.recorte(16, 0, 16, 48), 10 * T, 14 * T - 48);
    for (const [r, c, id] of deco) t.colar(grades[id], c * T, r * T);
    return t;
}

// ===========================================================================
for (const estilo of ORDEM_DOS_ESTILOS) {
    const salvar = (grade, nome) => gradeParaImagem(grade, estilo).salvar(resolve(raiz, `public/data/img/${nome}-${estilo}.png`));

    const grades = gradesDosTiles(estilo);
    const folha = folhaDeTiles(grades);
    salvar(folha, "ilha-tiles");

    const casa = desenharCasa(estilo);
    salvar(casa.g, "casa");

    const torre = new Tela(288, 128);
    const quadros = [];
    for (let e = 0; e < 6; e++) {
        const q = desenharTorre(estilo, e);
        quadros.push(q.g);
        torre.colar(q.g, e * 48, 0);
    }
    salvar(torre.g, "torre");

    const poste = new Tela(32, 48);
    poste.colar(desenharPoste(estilo, false).g, 0, 0);
    poste.colar(desenharPoste(estilo, true).g, 16, 0);
    salvar(poste.g, "poste");

    salvar(desenharLua().g, "lua");
    const sol = desenharSol();
    salvar(sol.g, "sol");
    const nuvens = desenharNuvens();
    salvar(nuvens.g, "nuvens");
    const fundoIlhas = desenharFundoIlhas();
    salvar(fundoIlhas.g, "fundo-ilhas");

    const menu = desenharMenu(estilo, quadros[0], casa.g);
    salvar(menu.g, "menu-fundo");

    // prévias
    previaTiles(estilo, folha).salvar(resolve(raiz, `previas/previa-ilha-tiles-${estilo}.png`));
    const cena = previaCena(estilo, grades, quadros[2], casa, poste, sol, nuvens, fundoIlhas);
    gradeParaImagem(cena.g, estilo).salvar(resolve(raiz, `previas/previa-ilha-cena-${estilo}.png`));
    const previaMenu = gradeParaImagem(menu.g, estilo);
    const caminhoLogo = resolve(raiz, `public/data/img/logo-${estilo}.png`);
    if (existsSync(caminhoLogo)) {
        const logo = lerPng(caminhoLogo);
        previaMenu.colar(logo, Math.floor((640 - logo.largura) / 2), 14);
    }
    previaMenu.salvar(resolve(raiz, `previas/previa-menu-${estilo}.png`));
    console.log(`ilha (${estilo}): tiles, casa, torre, poste, lua, sol, nuvens, fundo-ilhas, menu e prévias`);
}
