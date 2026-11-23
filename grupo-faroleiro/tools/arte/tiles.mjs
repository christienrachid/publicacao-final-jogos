// Os 32 tiles do Faroleiro, desenhados com papéis de cor.
// Cada tile é uma grade 16x16 de números de papel (0 = transparente). O
// desenho vira imagem nas cores do estilo em montarTileset(estilo).
// Usado por tools/gerar-tileset.mjs (folhas e prévia) e tools/gerar-fase1.mjs (prévia do mapa).
import { Imagem, lerDesenho } from "./png.mjs";
import { PAPEL, corDoPapel } from "./paletas.mjs";

export const T = 16; // lado do tile
export const COLUNAS = 8;
export const LINHAS = 4;
export const QUANTIDADE = COLUNAS * LINHAS;

// ids dos tiles (o gid no Tiled é id + 1)
export const TILE = {
    chao: 0, // 0 é o comum; 1–3 são variantes
    chaoRachado: 4,
    chaoMusgo: 5,
    sombra: 6,
    sombraVariante: 7,
    topo: 8,
    topoVariante: 9,
    face: 10,
    faceFresta: 11,
    faceMusgo: 12,
    agua: 16, // 16–19 são os quadros da animação
    margem: 20,
    grama: 21, // 21–23
    pedrinhas: 24,
    corda: 25,
    rede: 26,
    conchas: 27,
    poca: 28,
    tabuas: 29,
    espinha: 30,
    flores: 31,
};

// caractere -> papel, para os desenhos em texto ("." é transparente)
const LEGENDA = {
    k: PAPEL.contorno,
    s: PAPEL.sombra,
    d: PAPEL.pedraEscura,
    p: PAPEL.pedra,
    l: PAPEL.pedraClara,
    b: PAPEL.brilhoFrio,
    w: PAPEL.madeiraEscura,
    m: PAPEL.madeira,
    a: PAPEL.aguaEscura,
    g: PAPEL.agua,
    e: PAPEL.espuma,
    f: PAPEL.folhaEscura,
    h: PAPEL.folha,
    c: PAPEL.pele,
};

// ---------- utilidades de grade ----------

function vazio(papel = 0) {
    return Array.from({ length: T }, () => new Array(T).fill(papel));
}

function copiar(grade) {
    return grade.map((linha) => linha.slice());
}

// desenho em texto 16x16 -> grade
function desenho(texto) {
    const d = lerDesenho(texto, LEGENDA);
    if (d.largura !== T || d.altura !== T) {
        throw new Error(`tile: desenho ${d.largura}x${d.altura}, esperado ${T}x${T}`);
    }
    return d.papeis;
}

// pinta pontos [x, y, "caractere"] com volta nas bordas (o tile se repete)
function marcar(grade, pontos) {
    for (const [x, y, c] of pontos) {
        grade[(y + T) % T][(x + T) % T] = LEGENDA[c];
    }
    return grade;
}

// troca papéis numa área: mapa {papel: novoPapel}
function trocar(grade, x0, y0, largura, altura, mapa) {
    for (let y = y0; y < y0 + altura; y++) {
        for (let x = x0; x < x0 + largura; x++) {
            const atual = grade[y][x];
            if (mapa[atual] !== undefined) grade[y][x] = mapa[atual];
        }
    }
    return grade;
}

// contorno de 1 px (vizinhança de 4) em volta de tudo que não é transparente
function contornar(grade, papel = PAPEL.contorno) {
    const saida = copiar(grade);
    for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
            if (grade[y][x] !== 0) continue;
            const vizinhos = [
                [x - 1, y],
                [x + 1, y],
                [x, y - 1],
                [x, y + 1],
            ];
            if (vizinhos.some(([vx, vy]) => vx >= 0 && vy >= 0 && vx < T && vy < T && grade[vy][vx] !== 0)) {
                saida[y][x] = papel;
            }
        }
    }
    return saida;
}

// escurece um trecho em um tom (sombra que deixa a textura aparecer)
const UM_TOM_ABAIXO = {
    [PAPEL.brilhoFrio]: PAPEL.pedraClara,
    [PAPEL.pedraClara]: PAPEL.pedra,
    [PAPEL.pedra]: PAPEL.pedraEscura,
    [PAPEL.pedraEscura]: PAPEL.sombra,
    [PAPEL.folha]: PAPEL.folhaEscura,
};

// ---------- chão de pedra ----------
// Lajes em cata-vento: quatro lajes de 10x6 em volta de uma pedrinha de 4x4.
// Nenhuma junta atravessa o chão inteiro (toda junta termina num T), então o
// chão não vira listras nem parece uma parede deitada. O desenho todo é
// deslocado em (3, 2) para a borda do tile não cair numa junta. Com período
// 16 o cata-vento emenda sozinho com o vizinho.
const LAJES = [
    { x: 0, y: 0, largura: 10, altura: 6 },
    { x: 10, y: 0, largura: 6, altura: 10 },
    { x: 6, y: 10, largura: 10, altura: 6 },
    { x: 0, y: 6, largura: 6, altura: 10 },
    { x: 6, y: 6, largura: 4, altura: 4 },
];
const DESLOCAMENTO = [3, 2];

// pontos em coordenadas do cata-vento (antes do deslocamento)
function noChao(pontos) {
    return pontos.map(([x, y, c]) => [x + DESLOCAMENTO[0], y + DESLOCAMENTO[1], c]);
}

// mapa de juntas: true onde é junta. Cada laje ocupa a célula menos a última
// coluna e a última linha, que viram a junta. juntasExtras parte lajes por dentro.
function mapaDeJuntas(juntasExtras = []) {
    const junta = vazio(1).map((linha) => linha.map(() => true));
    for (const laje of LAJES) {
        for (let y = 0; y < laje.altura - 1; y++) {
            for (let x = 0; x < laje.largura - 1; x++) {
                junta[(laje.y + y + DESLOCAMENTO[1]) % T][(laje.x + x + DESLOCAMENTO[0]) % T] = false;
            }
        }
    }
    for (const [x, y] of noChao(juntasExtras)) junta[y % T][x % T] = true;
    return junta;
}

// Sombreamento automático, com volta nas bordas: junta escura, quina chanfrada
// e borda de cima clara (a luz vem de cima). O chão é de propósito mais calmo
// que a face da parede, onde as pedras vão em fileiras deitadas e brilham mais.
function chaoDeLajes(mapa) {
    const g = vazio();
    const junta = (x, y) => mapa[(y + T) % T][(x + T) % T];
    for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
            if (junta(x, y)) {
                g[y][x] = PAPEL.sombra;
                continue;
            }
            const cima = junta(x, y - 1);
            const baixo = junta(x, y + 1);
            const esquerda = junta(x - 1, y);
            const direita = junta(x + 1, y);
            const quina = (cima && esquerda) || (cima && direita) || (baixo && esquerda) || (baixo && direita);
            if (quina) g[y][x] = PAPEL.pedraEscura;
            else if (cima && brilhaNaBorda(junta, x, y)) g[y][x] = PAPEL.pedraClara;
            else g[y][x] = PAPEL.pedra;
        }
    }
    return g;
}

// só a parte esquerda da borda de cima brilha (luz de cima-esquerda): o chão fica mais calmo
function brilhaNaBorda(junta, x, y) {
    let antes = 0;
    while (antes < T && !junta(x - antes - 1, y)) antes++;
    let depois = 0;
    while (depois < T && !junta(x + depois + 1, y)) depois++;
    return antes < Math.ceil((antes + depois + 1) * 0.6);
}

const POROS = [
    [3, 2, "d"],
    [12, 12, "d"],
];

function chaoBase() {
    // dois poros discretos para as lajes não ficarem lisas demais
    return marcar(chaoDeLajes(mapaDeJuntas()), noChao(POROS));
}

function chaoVariante1() {
    // uma pedrinha encaixada na laje da esquerda
    return marcar(chaoBase(), noChao([
        [2, 10, "l"],
        [3, 10, "l"],
        [2, 11, "d"],
        [3, 11, "d"],
    ]));
}

function chaoVariante2() {
    // a laje de cima está partida em duas (a junta nova fica só por dentro)
    const extras = [0, 1, 2, 3, 4].map((y) => [4, y]);
    return marcar(chaoDeLajes(mapaDeJuntas(extras)), noChao(POROS));
}

function chaoVariante3() {
    // laje gasta: mancha mais clara e um lasco na quina
    return marcar(chaoBase(), noChao([
        [11, 3, "l"],
        [12, 3, "l"],
        [11, 4, "l"],
        [13, 14, "d"],
        [14, 13, "d"],
    ]));
}

function chaoRachado() {
    // rachadura em zigue-zague na laje de cima, com a beirada de baixo clara
    return marcar(chaoBase(), noChao([
        [1, 1, "s"],
        [2, 1, "s"],
        [3, 2, "s"],
        [4, 2, "s"],
        [5, 3, "s"],
        [6, 3, "s"],
        [7, 4, "s"],
        [1, 2, "l"],
        [3, 3, "l"],
        [5, 4, "l"],
        [2, 8, "s"],
        [2, 9, "s"],
        [3, 10, "s"],
        [3, 11, "l"],
    ]));
}

function chaoMusgo() {
    // musgo nascendo nas juntas em volta da pedrinha do meio e numa quina
    return marcar(chaoBase(), noChao([
        [1, 5, "h"],
        [2, 5, "f"],
        [3, 5, "h"],
        [2, 6, "h"],
        [9, 7, "h"],
        [9, 8, "f"],
        [8, 9, "h"],
        [9, 9, "f"],
        [10, 9, "h"],
        [7, 9, "h"],
        [15, 14, "h"],
        [15, 15, "f"],
        [14, 15, "h"],
    ]));
}

// sombra da parede no alto do chão: 2 px cheios e 2 px de pedra um tom abaixo
function comSombra(grade, profundidade) {
    const g = copiar(grade);
    for (let x = 0; x < T; x++) {
        const fundo = profundidade(x);
        for (let y = 0; y < fundo; y++) {
            if (y < 2) g[y][x] = PAPEL.sombra;
            else g[y][x] = UM_TOM_ABAIXO[g[y][x]] ?? g[y][x];
        }
    }
    return g;
}

// ---------- parede ----------

function topo() {
    // escuro e quase liso: só umas juntas apagadas e três grãos de pedra
    return marcar(vazio(PAPEL.sombra), [
        [2, 3, "k"],
        [3, 3, "k"],
        [4, 3, "k"],
        [11, 6, "k"],
        [12, 6, "k"],
        [6, 11, "k"],
        [7, 11, "k"],
        [8, 11, "k"],
        [14, 13, "k"],
        [5, 2, "d"],
        [12, 10, "d"],
        [1, 13, "d"],
    ]);
}

function topoVariante() {
    return marcar(vazio(PAPEL.sombra), [
        [8, 2, "k"],
        [9, 2, "k"],
        [1, 7, "k"],
        [2, 7, "k"],
        [3, 7, "k"],
        [12, 12, "k"],
        [13, 12, "k"],
        [4, 14, "k"],
        [10, 3, "d"],
        [3, 8, "d"],
        [14, 9, "d"],
    ]);
}

// Face da parede: borda de cima clara, fileiras de pedra deslocadas, base escura.
const FILEIRAS = [
    { y: 3, juntas: [3, 11] },
    { y: 7, juntas: [7, 15] },
    { y: 11, juntas: [3, 11] },
];

function face() {
    const g = vazio(PAPEL.sombra);
    for (let x = 0; x < T; x++) {
        g[0][x] = PAPEL.brilhoFrio; // a lua batendo na borda
        g[1][x] = PAPEL.pedraClara;
        g[15][x] = PAPEL.contorno; // pé da parede
    }
    for (const { y, juntas } of FILEIRAS) {
        for (let x = 0; x < T; x++) {
            if (juntas.includes(x)) continue; // a junta fica na cor da argamassa
            const comecoDaPedra = juntas.includes((x + T - 1) % T);
            g[y][x] = PAPEL.pedraClara;
            g[y + 1][x] = comecoDaPedra ? PAPEL.pedraClara : PAPEL.pedra;
            g[y + 2][x] = PAPEL.pedraEscura;
        }
    }
    return g;
}

function faceBase() {
    // uma pedra mais escura e um lasco, para a parede não parecer carimbada
    const g = face();
    trocar(g, 8, 7, 7, 3, UM_TOM_ABAIXO);
    return marcar(g, [
        [13, 4, "d"],
        [5, 12, "d"],
    ]);
}

function faceFresta() {
    // seteira estreita: buraco escuro com moldura clara e peitoril iluminado
    const g = face();
    return marcar(g, [
        [6, 3, "l"],
        [7, 3, "s"],
        [8, 3, "s"],
        [9, 3, "l"],
        [6, 4, "l"],
        [7, 4, "k"],
        [8, 4, "k"],
        [9, 4, "d"],
        [6, 5, "l"],
        [7, 5, "k"],
        [8, 5, "k"],
        [9, 5, "d"],
        [6, 6, "l"],
        [7, 6, "k"],
        [8, 6, "k"],
        [9, 6, "d"],
        [6, 7, "l"],
        [7, 7, "k"],
        [8, 7, "k"],
        [9, 7, "d"],
        [6, 8, "b"],
        [7, 8, "b"],
        [8, 8, "b"],
        [9, 8, "l"],
    ]);
}

function faceMusgo() {
    // musgo escorrendo da borda de cima, mais claro em cima e escuro na ponta
    const g = faceBase();
    const fios = [
        [1, 6],
        [2, 9],
        [3, 3],
        [7, 4],
        [8, 7],
        [12, 11],
        [13, 5],
    ];
    for (const [x, comprimento] of fios) {
        for (let y = 1; y < 1 + comprimento; y++) {
            g[y][x] = y < comprimento - 1 ? PAPEL.folha : PAPEL.folhaEscura;
        }
    }
    return marcar(g, [
        [0, 1, "h"],
        [4, 1, "h"],
        [6, 1, "h"],
        [9, 1, "h"],
        [11, 1, "h"],
        [14, 1, "h"],
    ]);
}

// ---------- água ----------
// Cristas de onda em arco que pulsam e andam 4 px por quadro: em 4 quadros
// cada uma anda 16 px, a largura do tile, e o laço fecha sem emenda.
const CRISTAS = [
    { x: 1, y: 3, fase: 0, anda: 1 },
    { x: 9, y: 5, fase: 2, anda: 0 },
    { x: 5, y: 9, fase: 1, anda: 1 },
    { x: 12, y: 12, fase: 3, anda: 0 },
    { x: 1, y: 13, fase: 2, anda: 1 },
];
const LARGURAS_DA_CRISTA = [4, 5, 6, 5];

function agua(quadro, { linhaInicial = 0 } = {}) {
    const g = vazio(PAPEL.aguaEscura);
    for (const crista of CRISTAS) {
        if (crista.y - 1 < linhaInicial) continue;
        const passo = (quadro + crista.fase) % 4;
        const largura = LARGURAS_DA_CRISTA[passo];
        const x0 = crista.x + crista.anda * quadro * 4 - Math.floor((largura - 4) / 2);
        // arco: o meio sobe um pixel
        for (let i = 1; i < largura - 1; i++) marcar(g, [[x0 + i, crista.y - 1, "g"]]);
        marcar(g, [
            [x0, crista.y, "g"],
            [x0 + largura - 1, crista.y, "g"],
        ]);
        // brilho da lua na crista, só em metade dos quadros
        if (passo === 1) marcar(g, [[x0 + 1, crista.y - 1, "e"]]);
    }
    return g;
}

function margem() {
    // meio-fio de pedra na beira, sombra na linha d'água, espuma e água parada
    const g = agua(0, { linhaInicial: 6 });
    const juntas = [5, 13];
    for (let x = 0; x < T; x++) {
        const junta = juntas.includes(x);
        g[0][x] = PAPEL.sombra; // junta com o chão de cima
        g[1][x] = junta ? PAPEL.sombra : PAPEL.pedraClara;
        g[2][x] = junta ? PAPEL.sombra : juntas.includes(x - 1) ? PAPEL.pedraClara : PAPEL.pedra;
        g[3][x] = PAPEL.pedraEscura;
        g[4][x] = PAPEL.contorno;
        g[5][x] = x % 4 === 1 || x % 4 === 2 ? PAPEL.espuma : PAPEL.agua;
    }
    return marcar(g, [
        [3, 6, "g"],
        [9, 6, "g"],
        [10, 6, "g"],
        [15, 6, "g"],
    ]);
}

// ---------- grama ----------
// tufos em V (lâminas saindo da raiz), escuros sobre a grama média
const TUFO_PEQUENO = [
    [0, 0],
    [2, 0],
    [1, 1],
];
const TUFO_GRANDE = [
    [0, 0],
    [4, 0],
    [1, 1],
    [3, 1],
    [2, 2],
    [2, 1],
];

function grama(tufos, extras = []) {
    const g = vazio(PAPEL.folha);
    for (const [forma, x, y] of tufos) {
        for (const [dx, dy] of forma) marcar(g, [[x + dx, y + dy, "f"]]);
    }
    return marcar(g, extras);
}

// ---------- decorações (fundo transparente, contorno automático) ----------

const PEDRINHAS = `
................
................
................
................
................
.....bl.........
....blll........
....llpp........
................
..........bl....
.........blll...
...bl.....pp....
..blll..........
..llpp..........
...pp...........
................
`;

const CORDA = `
................
................
................
................
......mmmm......
....mcccccm.....
...mcmwwwwmm....
..mcmwmccmwmm...
..mmwmkkkkmwm...
..mmwmmmmmwmw...
...mmwwwwwmw....
....wmmmmmw.mm..
......wwww..mw..
................
................
................
`;

const REDE = `
................
................
................
.....mwmwm......
...mwcwmwcwm....
..mcmwmcmwmcw...
..wmwmwmwmwmwm..
.mcmwmcmwmcmwmw.
.wmwmwbbwmwmwm..
.mwmwmbewmwmwm..
..wmwmwmwmwmw...
...mwmwmwmwm....
.....wmwmw......
................
................
................
`;

const CONCHAS = `
................
................
................
................
....ccc.........
...cmcmc........
...cmcmc........
....cmc.........
.....m..........
................
..........cc....
.........cmcc...
.........ccmc...
..........cc....
................
................
`;

const POCA = `
................
................
................
................
................
.....dddddd.....
...ddaggaaaadd..
..daeegaaaaaaad.
..dagaaaaaagaad.
..daaaaaaaaaaad.
...ddaaaaaaadd..
.....dddddd.....
................
................
................
................
`;

const TABUAS = `
................
................
................
.cccccccccc.....
.mmwmmmmmmmm....
.mmmmmmmwmmm....
.wwwwwwwwwww....
................
....ccccccccccc.
....mmmmmwmmmmm.
....mmwmmmmmwmm.
....wwwwwwwwwww.
................
................
................
................
`;

const ESPINHA = `
................
................
................
................
................
.......b.b.b....
..bb...b.b.b.b..
.bdbbbbbbbbbbb..
..bb...b.b.b.b..
.......b.b.b....
................
................
................
................
................
................
`;

const FLORES = `
................
................
................
...b............
..bmb.....b.....
...b.....bmb....
...h......b.....
..hf......h.....
.........fh.....
................
......b.........
.....bmb........
......b.........
......hf........
................
................
`;

function decoracao(texto) {
    return contornar(desenho(texto));
}

function poca() {
    // a poça não leva contorno preto (pareceria um buraco): a borda é pedra molhada
    return desenho(POCA);
}

// ---------- montagem ----------

let cache = null;

// devolve as 32 grades de papéis, na ordem dos ids
export function gradesDosTiles() {
    if (cache) return cache;
    const tiles = new Array(QUANTIDADE).fill(null).map(() => vazio());

    tiles[0] = chaoBase();
    tiles[1] = chaoVariante1();
    tiles[2] = chaoVariante2();
    tiles[3] = chaoVariante3();
    tiles[4] = chaoRachado();
    tiles[5] = chaoMusgo();
    tiles[6] = comSombra(chaoBase(), () => 4);
    // variante: a sombra recua no meio, onde a parede de cima tem uma reentrância
    tiles[7] = comSombra(chaoVariante1(), (x) => (x >= 5 && x <= 10 ? 3 : 4));
    tiles[8] = topo();
    tiles[9] = topoVariante();
    tiles[10] = faceBase();
    tiles[11] = faceFresta();
    tiles[12] = faceMusgo();
    // 13–15 ficam transparentes (reservados)
    for (let q = 0; q < 4; q++) tiles[16 + q] = agua(q);
    tiles[20] = margem();
    tiles[21] = grama([
        [TUFO_PEQUENO, 2, 2],
        [TUFO_GRANDE, 9, 4],
        [TUFO_PEQUENO, 4, 10],
        [TUFO_PEQUENO, 12, 12],
        [TUFO_PEQUENO, 14, 0],
        [TUFO_PEQUENO, 7, 14],
        [TUFO_PEQUENO, 0, 7],
    ], [
        [11, 4, "b"],
        [5, 6, "f"],
    ]);
    tiles[22] = grama([
        [TUFO_GRANDE, 1, 6],
        [TUFO_PEQUENO, 10, 2],
        [TUFO_PEQUENO, 9, 11],
        [TUFO_PEQUENO, 4, 1],
        [TUFO_PEQUENO, 13, 7],
        [TUFO_PEQUENO, 3, 13],
    ], [
        [3, 6, "b"],
        [14, 13, "f"],
    ]);
    tiles[23] = grama([
        [TUFO_PEQUENO, 6, 1],
        [TUFO_PEQUENO, 13, 7],
        [TUFO_GRANDE, 3, 11],
        [TUFO_PEQUENO, 0, 5],
        [TUFO_PEQUENO, 9, 4],
        [TUFO_PEQUENO, 11, 13],
    ], [
        [5, 11, "b"],
        [14, 2, "f"],
    ]);
    tiles[24] = decoracao(PEDRINHAS);
    tiles[25] = decoracao(CORDA);
    tiles[26] = decoracao(REDE);
    tiles[27] = decoracao(CONCHAS);
    tiles[28] = poca();
    tiles[29] = decoracao(TABUAS);
    tiles[30] = decoracao(ESPINHA);
    tiles[31] = decoracao(FLORES);

    cache = tiles;
    return tiles;
}

// desenha uma grade de papéis numa imagem, na posição (x, y)
export function pintarGrade(imagem, grade, x, y, estilo) {
    for (let yy = 0; yy < T; yy++) {
        for (let xx = 0; xx < T; xx++) {
            const papel = grade[yy][xx];
            if (papel === 0) continue;
            imagem.pintar(x + xx, y + yy, corDoPapel(estilo, papel));
        }
    }
}

// a folha do tileset de um estilo: 128x64, 8 colunas
export function montarTileset(estilo) {
    const imagem = new Imagem(COLUNAS * T, LINHAS * T);
    gradesDosTiles().forEach((grade, id) => {
        pintarGrade(imagem, grade, (id % COLUNAS) * T, Math.floor(id / COLUNAS) * T, estilo);
    });
    return imagem;
}
