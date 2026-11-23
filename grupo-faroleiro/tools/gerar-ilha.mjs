// Gera o mapa da ilha da Fase 1 (vista de lado) no estilo do jogo:
//   node tools/gerar-ilha.mjs
//
// Saída:
//   public/data/map/ilha-<t>.tmj         mapa do Tiled (JSON) com o tileset
//                                        embutido "ilha-tiles-<t>"
//   previas/previa-ilha-mapa-<t>.png   o mapa montado (1×), com a casa, a
//                                        torre e os postes, para conferir
//
// Rode depois de tools/gerar-ilha-arte.mjs (a prévia lê os PNG gerados por ele).
//
// O relevo é uma lista de trechos (coluna inicial, final, linha do topo e
// material). Daí saem as camadas:
//   fundo        pernas de andaime (atrás de tudo)
//   mar          superfície animada (tiles 24 a 27) e mar fundo
//   decoracao    tufos, flores, cerca, placa, âncora, conchas, barris, rede
//   terreno      chão sólido e caixas (sólidas)
//   plataformas  tábuas de andaime (plataformas de mão única)
//   frente       alguns tufos por cima do jogador
// e os objetos:
//   collision    retângulos fundidos do terreno (e das caixas)
//   maoUnica     um retângulo por tábua de andaime, propriedade maoUnica
//   pontos       Jogador, Casa, Porta, Torre, Poste ×N, PecaEsquerda,
//                PecaDireita, SpawnMarEsquerda, SpawnMarDireita e
//                ChefeNavio (área no mar à direita, para o Holandês)
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { Imagem } from "./arte/png.mjs";
import { ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = 16;
const LARGURA = 110;
const ALTURA = 34;
// linha da superfície do mar (y = 416)
const MAR = 26;

// ids do tileset ilha-tiles (tools/gerar-ilha-arte.mjs, gradesDosTiles)
const TILE = {
    grama: 0,
    grama2: 1,
    terra: 2,
    terraPedra: 3,
    rocha: 4,
    rocha2: 5,
    areiaTopo: 6,
    areia: 7,
    quinaEsq: 8,
    quinaDir: 9,
    lateralEsq: 10,
    lateralDir: 11,
    quinaAreiaEsq: 12,
    quinaAreiaDir: 13,
    caixa: 16,
    caixa2: 17,
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

// ---------------------------------------------------------------------------
// Relevo: [primeira coluna, última coluna, linha do topo, material]. Fora dos
// trechos é mar. Degraus de 1 tile se sobem andando com pulo curto; os de 2
// pedem o pulo inteiro ou uma caixa/andaime; os de 3 só com caixa/andaime.
// ---------------------------------------------------------------------------
const TRECHOS = [
    [4, 11, 25, "areia"], // praia da esquerda (8)
    [12, 14, 24, "grama"], // degrau de 1
    [15, 18, 22, "grama"],
    [19, 26, 21, "grama"], // patamar largo, degrau de 1
    [27, 30, 19, "grama"],
    [31, 33, 20, "grama"], // pequeno vale (desce 1)
    [34, 39, 18, "grama"],
    [40, 42, 17, "grama"], // degrau de 1
    [43, 47, 15, "grama"],
    [48, 49, 14, "grama"], // patamar curto, degrau de 1
    [50, 73, 12, "grama"], // morro: casa e torre
    [74, 76, 14, "grama"],
    [77, 78, 15, "grama"], // degrau de 1
    [79, 82, 17, "grama"],
    [83, 84, 19, "grama"],
    [85, 86, 21, "grama"],
    [87, 88, 23, "grama"],
    [89, 93, 25, "areia"], // praia da direita
];

const alto = new Array(LARGURA).fill(null);
const material = new Array(LARGURA).fill(null);
for (const [c0, c1, linha, mat] of TRECHOS) {
    for (let c = c0; c <= c1; c++) {
        alto[c] = linha;
        material[c] = mat;
    }
}
const PRIMEIRA = TRECHOS[0][0];
const ULTIMA = TRECHOS[TRECHOS.length - 1][1];

// caixas sólidas [coluna, linha, variante]
const CAIXAS = [
    [68, 11, 0],
    [69, 11, 1],
    [69, 10, 0],
    [12, 23, 0], // degrau extra na subida da praia da esquerda
    [84, 18, 1], // degrau extra na descida para a praia da direita
];

// andaimes: tábuas [coluna inicial, coluna final, linha]; as pernas descem
// das pontas até o chão
const ANDAIMES = [
    [30, 32, 17], // sobre o vale
    [80, 82, 15], // atalho acima do degrau da descida
    [70, 72, 8],
    // praia da esquerda: patamares escalonados em direção ao sopé do morro
    [8, 13, 23], // 2 tiles acima da praia
    [10, 14, 21], // 4 tiles acima da praia
    [14, 19, 19],
    // praia da direita
    [88, 93, 21], // 4 tiles acima da praia
    [85, 89, 19],
];

// casa (64×48) e torre (48×128): coluna da esquerda, de pé no chão
const CASA_COLUNA = 52;
const TORRE_COLUNA = 64;
// porta da casa dentro da imagem (casa-<t>.png): x 26 a 37
const PORTA_CENTRO = 32;
const POSTES = [7, 25, 41, 59, 80, 87, 91];
const JOGADOR_COLUNA = 57;
const PECA_ESQUERDA = 8;
const PECA_DIREITA = 91;
// pontos de lápide (Tarefa 7): encostas e praias, no chão
const LAPIDES = [6, 10, 16, 22, 84, 88, 92];
const SPAWN_ESQUERDA = 1;
const SPAWN_DIREITA = 97;

// ---------------------------------------------------------------------------
// camadas
// ---------------------------------------------------------------------------
const nova = () => new Array(LARGURA * ALTURA).fill(-1);
const fundo = nova();
const mar = nova();
const decoracao = nova();
const terreno = nova();
const plataformas = nova();
const frente = nova();
const em = (camada, c, r, id) => {
    if (c >= 0 && c < LARGURA && r >= 0 && r < ALTURA) camada[r * LARGURA + c] = id;
};
const ler = (camada, c, r) => (c >= 0 && c < LARGURA && r >= 0 && r < ALTURA ? camada[r * LARGURA + c] : -1);
const temChao = (c) => c >= 0 && c < LARGURA && alto[c] !== null;
// pseudoaleatório fixo por posição (o mesmo mapa a cada geração)
const sorte = (c, r, k = 0) => {
    const h = Math.sin(c * 127.1 + r * 311.7 + k * 74.7) * 43758.5453;
    return h - Math.floor(h);
};

// mar: superfície animada e fundo, só onde não há chão
for (let c = 0; c < LARGURA; c++) {
    if (temChao(c)) continue;
    em(mar, c, MAR, TILE.mar + (c % 4));
    for (let r = MAR + 1; r < ALTURA; r++) em(mar, c, r, TILE.marFundo);
}

// terreno
for (let c = 0; c < LARGURA; c++) {
    if (!temChao(c)) continue;
    const h = alto[c];
    const esq = temChao(c - 1) ? alto[c - 1] : Infinity;
    const dir = temChao(c + 1) ? alto[c + 1] : Infinity;
    const mat = material[c];
    for (let r = h; r < ALTURA; r++) {
        let id;
        if (mat === "areia") {
            if (r === h) {
                id = esq > h ? TILE.quinaAreiaEsq : dir > h ? TILE.quinaAreiaDir : TILE.areiaTopo;
            } else {
                id = r <= h + 3 ? TILE.areia : sorte(c, r) < 0.25 ? TILE.rocha2 : TILE.rocha;
            }
        } else if (r === h) {
            id = esq > h ? TILE.quinaEsq : dir > h ? TILE.quinaDir : sorte(c, r) < 0.35 ? TILE.grama2 : TILE.grama;
        } else if (r <= h + 4) {
            const lateralEsq = esq > r && esq !== Infinity;
            const lateralDir = dir > r && dir !== Infinity;
            id = lateralEsq ? TILE.lateralEsq : lateralDir ? TILE.lateralDir : sorte(c, r) < 0.14 ? TILE.terraPedra : TILE.terra;
        } else {
            id = sorte(c, r, 1) < 0.25 ? TILE.rocha2 : TILE.rocha;
        }
        em(terreno, c, r, id);
    }
}
for (const [c, r, v] of CAIXAS) {
    if (ler(terreno, c, r) !== -1) throw new Error(`caixa em (${c}, ${r}) cai dentro do terreno`);
    em(terreno, c, r, TILE.caixa + v);
}

// andaimes: tábuas na camada de plataformas, pernas atrás
for (const [c0, c1, r] of ANDAIMES) {
    for (let c = c0; c <= c1; c++) {
        em(plataformas, c, r, c === c0 ? TILE.tabuaEsq : c === c1 ? TILE.tabuaDir : TILE.tabuaMeio);
    }
    for (const c of [c0, c1]) {
        for (let rr = r + 1; rr < ALTURA && ler(terreno, c, rr) === -1; rr++) em(fundo, c, rr, TILE.perna);
    }
}

// ---------------------------------------------------------------------------
// decoração: lista fixa (praias, casa, torre) e grama espalhada
// ---------------------------------------------------------------------------
// [coluna, id] em cima do chão daquela coluna (linha do topo - 1)
const DECORACAO_FIXA = [
    [5, TILE.rede],
    [6, TILE.conchas],
    [9, TILE.ancora],
    [11, TILE.barril],
    [10, TILE.caveira],
    [13, TILE.placa],
    [23, TILE.flores],
    [28, TILE.pedrinhas],
    [35, TILE.flores],
    [43, TILE.placa],
    [47, TILE.flores],
    [50, TILE.cerca],
    [51, TILE.cerca],
    [57, TILE.flores],
    [61, TILE.cerca],
    [62, TILE.cerca],
    [67, TILE.barril],
    [73, TILE.cerca],
    [76, TILE.pedrinhas],
    [83, TILE.flores],
    [88, TILE.barril],
    [89, TILE.rede],
    [90, TILE.conchas],
    [92, TILE.caveira],
    [93, TILE.conchas],
];
const ocupada = new Set();
// colunas ocupadas por casa, torre, postes e caixas não recebem decoração
for (let c = CASA_COLUNA; c < CASA_COLUNA + 4; c++) ocupada.add(c);
for (let c = TORRE_COLUNA; c < TORRE_COLUNA + 3; c++) ocupada.add(c);
for (const c of POSTES) ocupada.add(c);
for (const [c] of CAIXAS) ocupada.add(c);
for (const [c0, c1] of ANDAIMES) for (const c of [c0, c1]) ocupada.add(c);
ocupada.add(JOGADOR_COLUNA);

for (const [c, id] of DECORACAO_FIXA) {
    if (!temChao(c)) throw new Error(`decoração na coluna ${c} sem chão`);
    em(decoracao, c, alto[c] - 1, id);
    ocupada.add(c);
}
// tufos e pedrinhas espalhados na grama; alguns tufos vão na frente do jogador
for (let c = PRIMEIRA; c <= ULTIMA; c++) {
    if (ocupada.has(c) || material[c] !== "grama") continue;
    const s = sorte(c, 0, 7);
    const r = alto[c] - 1;
    if (s < 0.38) em(decoracao, c, r, TILE.tufo);
    else if (s < 0.48) em(frente, c, r, TILE.tufo);
    else if (s < 0.56) em(decoracao, c, r, TILE.pedrinhas);
}

// ---------------------------------------------------------------------------
// objetos: colisão, mão única e pontos
// ---------------------------------------------------------------------------
let proximoId = 1;

// faixas horizontais de terreno por linha, depois fundidas na vertical
// quando a faixa de baixo tem as mesmas colunas
const faixas = [];
for (let r = 0; r < ALTURA; r++) {
    let c = 0;
    while (c < LARGURA) {
        if (ler(terreno, c, r) === -1) {
            c++;
            continue;
        }
        const c0 = c;
        while (c < LARGURA && ler(terreno, c, r) !== -1) c++;
        faixas.push({ c0, c1: c - 1, r0: r, r1: r });
    }
}
const fundidas = [];
let abertas = new Map();
for (let r = 0; r < ALTURA; r++) {
    const novas = new Map();
    for (const f of faixas.filter((faixa) => faixa.r0 === r)) {
        const chave = `${f.c0}-${f.c1}`;
        const anterior = abertas.get(chave);
        if (anterior) {
            anterior.r1 = r;
            novas.set(chave, anterior);
        } else {
            fundidas.push(f);
            novas.set(chave, f);
        }
    }
    abertas = novas;
}
const colisao = fundidas.map((f) => ({
    id: proximoId++,
    name: "",
    type: "",
    x: f.c0 * T,
    y: f.r0 * T,
    width: (f.c1 - f.c0 + 1) * T,
    height: (f.r1 - f.r0 + 1) * T,
    rotation: 0,
    visible: true,
}));

const maoUnica = ANDAIMES.map(([c0, c1, r]) => ({
    id: proximoId++,
    name: "",
    type: "Plataforma",
    class: "Plataforma",
    x: c0 * T,
    y: r * T,
    width: (c1 - c0 + 1) * T,
    height: T,
    rotation: 0,
    visible: true,
    properties: [{ name: "maoUnica", type: "bool", value: true }],
}));

// pontos: (x, y) em pixels; casa, torre e postes pela base (meio de baixo)
function ponto(nome, x, y, extra = {}) {
    return { id: proximoId++, name: nome, type: nome, class: nome, x, y, width: 0, height: 0, point: true, rotation: 0, visible: true, ...extra };
}
const chao = (c) => alto[c] * T;
const meio = (c) => c * T + T / 2;
const casaX = CASA_COLUNA * T + 32;
const torreX = TORRE_COLUNA * T + 24;
const pontos = [
    ponto("Jogador", meio(JOGADOR_COLUNA), chao(JOGADOR_COLUNA)),
    ponto("Casa", casaX, chao(CASA_COLUNA)),
    ponto("Porta", CASA_COLUNA * T + PORTA_CENTRO, chao(CASA_COLUNA)),
    ponto("Torre", torreX, chao(TORRE_COLUNA)),
    ...POSTES.map((c) => ponto("Poste", meio(c), chao(c))),
    ponto("PecaEsquerda", meio(PECA_ESQUERDA), chao(PECA_ESQUERDA)),
    ponto("PecaDireita", meio(PECA_DIREITA), chao(PECA_DIREITA)),
    ...LAPIDES.map((c) => ponto("lapide", meio(c), chao(c))),
    ponto("SpawnMarEsquerda", meio(SPAWN_ESQUERDA), MAR * T),
    ponto("SpawnMarDireita", meio(SPAWN_DIREITA), MAR * T),
    {
        id: proximoId++,
        name: "ChefeNavio",
        type: "ChefeNavio",
        class: "ChefeNavio",
        x: (ULTIMA + 1) * T,
        y: MAR * T - 160,
        width: (LARGURA - ULTIMA - 1) * T,
        height: 192,
        rotation: 0,
        visible: true,
    },
];

// degraus andáveis: a diferença de altura entre colunas vizinhas do chão (nos
// dois sentidos) tem de caber no pulo (47 px, ou seja, 2 tiles de 16 px)
const DEGRAU_MAXIMO = 2;
let maiorDegrau = 0;
for (let c = PRIMEIRA; c < ULTIMA; c++) {
    if (!temChao(c) || !temChao(c + 1)) throw new Error(`buraco no chão entre as colunas ${c} e ${c + 1}`);
    const d = Math.abs(alto[c] - alto[c + 1]);
    if (d > maiorDegrau) maiorDegrau = d;
    if (d > DEGRAU_MAXIMO) throw new Error(`degrau de ${d} tiles entre as colunas ${c} e ${c + 1} (máximo ${DEGRAU_MAXIMO})`);
}
console.log(`maior degrau andável: ${maiorDegrau} tiles (${maiorDegrau * T} px)`);

// conferências: casa e torre de pé num chão plano, postes no chão
for (const [c0, largura, nome] of [
    [CASA_COLUNA, 4, "casa"],
    [TORRE_COLUNA, 3, "torre"],
]) {
    for (let c = c0; c < c0 + largura; c++) {
        if (alto[c] !== alto[c0]) throw new Error(`${nome} em chão desnivelado (coluna ${c})`);
    }
}

// ---------------------------------------------------------------------------
// saída
// ---------------------------------------------------------------------------
const gids = (ids) => ids.map((id) => (id < 0 ? 0 : id + 1));
function camadaDeTiles(id, nome, ids) {
    return { id, name: nome, type: "tilelayer", x: 0, y: 0, width: LARGURA, height: ALTURA, opacity: 1, visible: true, data: gids(ids) };
}
function camadaDeObjetos(id, nome, objetos) {
    return { id, name: nome, type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true, objects: objetos };
}

function montarMapa(estilo) {
    return {
        compressionlevel: -1,
        height: ALTURA,
        width: LARGURA,
        tilewidth: T,
        tileheight: T,
        infinite: false,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.10.2",
        type: "map",
        version: "1.10",
        nextlayerid: 10,
        nextobjectid: proximoId,
        properties: [
            // onde o jogador pode andar (as pontas da ilha), em pixels
            { name: "limiteEsquerdo", type: "int", value: PRIMEIRA * T },
            { name: "limiteDireito", type: "int", value: (ULTIMA + 1) * T },
            // superfície do mar, em pixels
            { name: "marY", type: "int", value: MAR * T },
        ],
        tilesets: [
            {
                firstgid: 1,
                name: `ilha-tiles-${estilo}`,
                image: `../img/ilha-tiles-${estilo}.png`,
                imagewidth: 128,
                imageheight: 96,
                tilewidth: T,
                tileheight: T,
                tilecount: 48,
                columns: 8,
                margin: 0,
                spacing: 0,
                // superfície do mar: os 4 quadros em loop, cada tile começando num
                tiles: [0, 1, 2, 3].map((q) => ({
                    id: TILE.mar + q,
                    animation: [0, 1, 2, 3].map((k) => ({ tileid: TILE.mar + ((q + k) % 4), duration: 260 })),
                })),
            },
        ],
        layers: [
            camadaDeTiles(1, "fundo", fundo),
            camadaDeTiles(2, "mar", mar),
            camadaDeTiles(3, "decoracao", decoracao),
            camadaDeTiles(4, "terreno", terreno),
            camadaDeTiles(5, "plataformas", plataformas),
            camadaDeTiles(6, "frente", frente),
            camadaDeObjetos(7, "collision", colisao),
            camadaDeObjetos(8, "maoUnica", maoUnica),
            camadaDeObjetos(9, "pontos", pontos),
        ],
    };
}

// leitor mínimo de PNG RGBA de 8 bits (os que tools/arte/png.mjs grava)
function lerPng(caminho) {
    const b = readFileSync(caminho);
    let p = 8;
    let largura = 0;
    let altura = 0;
    const blocos = [];
    while (p < b.length) {
        const tamanho = b.readUInt32BE(p);
        const tipo = b.toString("ascii", p + 4, p + 8);
        const dados = b.subarray(p + 8, p + 8 + tamanho);
        if (tipo === "IHDR") {
            largura = dados.readUInt32BE(0);
            altura = dados.readUInt32BE(4);
            if (dados[8] !== 8 || dados[9] !== 6) throw new Error(`${caminho}: só PNG RGBA de 8 bits`);
        } else if (tipo === "IDAT") {
            blocos.push(dados);
        }
        p += 12 + tamanho;
    }
    const bruto = inflateSync(Buffer.concat(blocos));
    const imagem = new Imagem(largura, altura);
    const linha = largura * 4;
    let anterior = new Uint8Array(linha);
    for (let y = 0; y < altura; y++) {
        const filtro = bruto[y * (linha + 1)];
        const atual = Uint8Array.from(bruto.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1)));
        for (let i = 0; i < linha; i++) {
            const a = i >= 4 ? atual[i - 4] : 0;
            const c = anterior[i];
            const d = i >= 4 ? anterior[i - 4] : 0;
            let soma = 0;
            if (filtro === 1) soma = a;
            else if (filtro === 2) soma = c;
            else if (filtro === 3) soma = (a + c) >> 1;
            else if (filtro === 4) {
                const pp = a + c - d;
                const pa = Math.abs(pp - a);
                const pb = Math.abs(pp - c);
                const pc = Math.abs(pp - d);
                soma = pa <= pb && pa <= pc ? a : pb <= pc ? c : d;
            }
            atual[i] = (atual[i] + soma) & 255;
        }
        imagem.pixels.set(atual, y * linha);
        anterior = atual;
    }
    return imagem;
}

function recorte(imagem, x, y, largura, altura) {
    const r = new Imagem(largura, altura);
    for (let yy = 0; yy < altura; yy++) {
        for (let xx = 0; xx < largura; xx++) r.pintar(xx, yy, imagem.ler(x + xx, y + yy));
    }
    return r;
}

function montarPrevia(estilo) {
    const img = (nome) => lerPng(resolve(raiz, `public/data/img/${nome}-${estilo}.png`));
    const folha = img("ilha-tiles");
    const tiles = [];
    for (let id = 0; id < 48; id++) tiles.push(recorte(folha, (id % 8) * T, Math.floor(id / 8) * T, T, T));
    const previa = new Imagem(LARGURA * T, ALTURA * T);
    previa.retangulo(0, 0, previa.largura, previa.altura, [27, 24, 56, 255]);
    const camada = (ids) =>
        ids.forEach((id, i) => {
            if (id >= 0) previa.colar(tiles[id], (i % LARGURA) * T, Math.floor(i / LARGURA) * T);
        });
    camada(fundo);
    camada(mar);
    camada(decoracao);
    const casa = img("casa");
    previa.colar(casa, casaX - 32, chao(CASA_COLUNA) - 48);
    previa.colar(recorte(img("torre"), 0, 0, 48, 128), torreX - 24, chao(TORRE_COLUNA) - 128);
    const poste = recorte(img("poste"), 16, 0, 16, 48);
    for (const c of POSTES) previa.colar(poste, c * T, chao(c) - 48);
    camada(terreno);
    camada(plataformas);
    camada(frente);
    return previa;
}

for (const estilo of ORDEM_DOS_ESTILOS) {
    const saida = resolve(raiz, `public/data/map/ilha-${estilo}.tmj`);
    mkdirSync(dirname(saida), { recursive: true });
    writeFileSync(saida, JSON.stringify(montarMapa(estilo), null, 1));
    montarPrevia(estilo).salvar(resolve(raiz, `previas/previa-ilha-mapa-${estilo}.png`));
    console.log(`mapa gerado: ${saida}`);
}
console.log(`retângulos de colisão: ${colisao.length}; plataformas de mão única: ${maoUnica.length}; pontos: ${pontos.length}`);
