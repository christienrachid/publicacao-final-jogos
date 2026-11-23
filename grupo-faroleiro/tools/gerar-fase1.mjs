// Gera public/data/map/fase1-<estilo>.tmj (mapa do Tiled) no estilo do jogo, a partir do
// desenho ASCII abaixo, e a prévia previas/previa-mapa-<estilo>.png.
// Legenda: # parede, . chão, ~ água, , grama, P jogador, R rondador, O óleo, S saída.
// P, R, O e S são chão com um objeto por cima.
// As regras de escolha dos tiles estão nas tabelas e funções abaixo.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Imagem, criarAleatorio } from "./arte/png.mjs";
import { ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";
import { T, COLUNAS, LINHAS, QUANTIDADE, gradesDosTiles, pintarGrade } from "./arte/tiles.mjs";

const LAYOUT = `
################################################
################################################
##################################............##
##........########################......,,,,..##
##..,,,...########################......,,,,S.##
##..,,,...########################............##
##........########################............##
##........########################.,,,........##
##..........################...###............##
##..........################.O.#######..########
############..............##...#######..########
############............,,##...#######..########
############..,,,.......,,..............########
############.....##.....................########
############.....##.......######################
############.......R......######################
############.........##...######################
############...#.....##...######################
############...#......~~~...................####
############.......,,.~~~...................####
############.......,,.....##................####
##############..############..##............####
##........####..############..##............####
##.,,.....####..############..........##....####
##.,,...........############..........##....####
##..P...........############.....,,,,.......####
##.....,,.#...##############.....,,,,.......####
##.....,,.#.O.##############................####
###########...##################################
################################################
`;

const TILE = 16;
const SEMENTE = 20261103; // semente fixa: o mapa sai sempre igual
const CLASSES = { P: "Player", R: "Rondador", O: "Oleo", S: "Saida" };
const ENTIDADES = Object.keys(CLASSES);

const linhas = LAYOUT.split("\n").filter((l) => l.length > 0);
const ALTURA = linhas.length;
const LARGURA = linhas[0].length;

// validação do desenho
for (const [i, l] of linhas.entries()) {
    if (l.length !== LARGURA) throw new Error(`linha ${i} tem ${l.length} colunas, esperado ${LARGURA}`);
    for (const c of l) {
        if (!"#.~,PROS".includes(c)) throw new Error(`caractere inválido '${c}' na linha ${i}`);
    }
}
if (LARGURA !== 48 || ALTURA !== 30) throw new Error(`mapa ${LARGURA}x${ALTURA}, esperado 48x30`);

const contagem = {};
for (const l of linhas) for (const c of l) contagem[c] = (contagem[c] ?? 0) + 1;
if (contagem.P !== 1 || contagem.R !== 1 || contagem.O !== 2 || contagem.S !== 1) {
    throw new Error(`entidades erradas: ${JSON.stringify(contagem)}`);
}

// ---------- escolha dos tiles ----------

// número de 0 a 1 fixo para cada tile e cada uso: a escolha não depende da ordem do laço
function sorteio(x, y, uso) {
    return criarAleatorio(SEMENTE ^ Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(uso, 83492791))();
}

const celula = (x, y) => (x < 0 || y < 0 || x >= LARGURA || y >= ALTURA ? "#" : linhas[y][x]);
const ehParede = (x, y) => celula(x, y) === "#";
const ehAgua = (x, y) => celula(x, y) === "~";
const ehGrama = (x, y) => celula(x, y) === ",";
const ehChao = (x, y) => ".PROS".includes(celula(x, y));

// escolhe um item de [{id, peso}] com o sorteio r
function escolher(opcoes, r) {
    const total = opcoes.reduce((soma, o) => soma + o.peso, 0);
    let alvo = r * total;
    for (const o of opcoes) {
        alvo -= o.peso;
        if (alvo < 0) return o.id;
    }
    return opcoes[opcoes.length - 1].id;
}

// ids dos tiles (gid = id + 1); ver tools/arte/tiles.mjs
const CHAO_COMUM = [
    { id: 0, peso: 70 },
    { id: 1, peso: 8 },
    { id: 2, peso: 7 },
    { id: 3, peso: 7 },
    { id: 4, peso: 4 },
    { id: 5, peso: 4 },
];
const SOMBRA = [
    { id: 6, peso: 70 },
    { id: 7, peso: 30 },
];
const TOPO = [
    { id: 8, peso: 75 },
    { id: 9, peso: 25 },
];
const FACE = [
    { id: 10, peso: 70 },
    { id: 11, peso: 12 },
    { id: 12, peso: 18 },
];
const GRAMA = [
    { id: 21, peso: 50 },
    { id: 22, peso: 25 },
    { id: 23, peso: 25 },
];
const AGUA = 16;
const MARGEM = 20;

const chao = []; // ids, -1 = vazio
const paredes = [];
const sombreados = new Set(); // "x,y" dos tiles de chão com sombra de parede
let gramaSemSombra = 0;

for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
        // camada paredes: face quando o tile de baixo não é parede (a última linha é topo)
        if (ehParede(x, y)) {
            const temBaixo = y + 1 < ALTURA;
            if (temBaixo && !ehParede(x, y + 1)) {
                let id = escolher(FACE, sorteio(x, y, 1));
                // duas seteiras lado a lado ficam repetidas demais
                if (id === 11 && paredes[paredes.length - 1] === 11) id = 10;
                paredes.push(id);
            } else {
                paredes.push(escolher(TOPO, sorteio(x, y, 2)));
            }
            chao.push(0); // coberto pela parede; fica chão comum por baixo
            continue;
        }
        paredes.push(-1);

        if (ehAgua(x, y)) {
            chao.push(ehChao(x, y - 1) || ehGrama(x, y - 1) ? MARGEM : AGUA);
        } else if (ehGrama(x, y)) {
            if (ehParede(x, y - 1)) gramaSemSombra++;
            chao.push(escolher(GRAMA, sorteio(x, y, 3)));
        } else if (ehParede(x, y - 1)) {
            chao.push(escolher(SOMBRA, sorteio(x, y, 4)));
            sombreados.add(`${x},${y}`);
        } else {
            chao.push(escolher(CHAO_COMUM, sorteio(x, y, 5)));
        }
    }
}

// ---------- decoração ----------
// ~6% do chão livre: nunca em água, em sombra, numa entidade ou nos 8 vizinhos dela,
// e nunca colada em outra decoração.
const PORCENTAGEM_DE_DECORACAO = 0.06;
const DECORACAO_NO_CHAO = [
    { id: 24, peso: 3 }, // pedrinhas
    { id: 25, peso: 1 }, // corda
    { id: 26, peso: 1 }, // rede
    { id: 27, peso: 2 }, // conchas
    { id: 28, peso: 2 }, // poça
    { id: 29, peso: 1 }, // tábuas
    { id: 30, peso: 1 }, // espinha de peixe
    { id: 31, peso: 1 }, // flores
];
// perto da água aparecem mais coisas do mar
const DECORACAO_PERTO_DA_AGUA = [
    { id: 24, peso: 2 },
    { id: 26, peso: 2 },
    { id: 27, peso: 3 },
    { id: 28, peso: 1 },
    { id: 30, peso: 2 },
];
const DECORACAO_NA_GRAMA = [
    { id: 31, peso: 6 },
    { id: 24, peso: 2 },
    { id: 27, peso: 1 },
];

const pertoDeEntidade = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (ENTIDADES.includes(celula(x + dx, y + dy))) return true;
    }
    return false;
};
const pertoDeAgua = (x, y) => {
    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) if (ehAgua(x + dx, y + dy)) return true;
    }
    return false;
};

const livres = [];
for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
        if (!(celula(x, y) === "." || ehGrama(x, y))) continue;
        if (sombreados.has(`${x},${y}`) || pertoDeEntidade(x, y)) continue;
        livres.push({ x, y, ordem: sorteio(x, y, 6) });
    }
}
livres.sort((a, b) => a.ordem - b.ordem);

const decoracao = new Array(LARGURA * ALTURA).fill(-1);
const meta = Math.round(livres.length * PORCENTAGEM_DE_DECORACAO);
let colocadas = 0;
for (const { x, y } of livres) {
    if (colocadas >= meta) break;
    let colada = false;
    for (let dy = -1; dy <= 1 && !colada; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const vx = x + dx;
            const vy = y + dy;
            if (vx >= 0 && vy >= 0 && vx < LARGURA && vy < ALTURA && decoracao[vy * LARGURA + vx] >= 0) colada = true;
        }
    }
    if (colada) continue;
    const opcoes = ehGrama(x, y) ? DECORACAO_NA_GRAMA : pertoDeAgua(x, y) ? DECORACAO_PERTO_DA_AGUA : DECORACAO_NO_CHAO;
    decoracao[y * LARGURA + x] = escolher(opcoes, sorteio(x, y, 7));
    colocadas++;
}

// ---------- colisão ----------
// uma faixa por linha de paredes consecutivas...
let proximoId = 1;
const faixas = []; // {x0, x1, y0, y1} em tiles, x1 e y1 inclusivos
for (let y = 0; y < ALTURA; y++) {
    let x = 0;
    while (x < LARGURA) {
        if (linhas[y][x] !== "#") {
            x++;
            continue;
        }
        const x0 = x;
        while (x < LARGURA && linhas[y][x] === "#") x++;
        faixas.push({ x0, x1: x - 1, y0: y, y1: y });
    }
}
// ...e funde na vertical faixas de mesmo x0/x1 em linhas seguidas
const fundidas = [];
let abertas = new Map(); // "x0-x1" -> faixa que ainda pode crescer
for (let y = 0; y < ALTURA; y++) {
    const novas = new Map();
    for (const f of faixas.filter((faixa) => faixa.y0 === y)) {
        const chave = `${f.x0}-${f.x1}`;
        const anterior = abertas.get(chave);
        if (anterior) {
            anterior.y1 = y;
            novas.set(chave, anterior);
        } else {
            fundidas.push(f);
            novas.set(chave, f);
        }
    }
    abertas = novas;
}

const retangulos = fundidas.map((f) => ({
    id: proximoId++,
    name: "",
    type: "",
    x: f.x0 * TILE,
    y: f.y0 * TILE,
    width: (f.x1 - f.x0 + 1) * TILE,
    height: (f.y1 - f.y0 + 1) * TILE,
    rotation: 0,
    visible: true,
}));

// ---------- entidades ----------
const entidades = [];
for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
        const classe = CLASSES[linhas[y][x]];
        if (!classe) continue;
        entidades.push({
            id: proximoId++,
            name: classe,
            type: classe,
            class: classe,
            x: x * TILE,
            y: y * TILE,
            width: TILE,
            height: TILE,
            rotation: 0,
            visible: true,
        });
    }
}

// ---------- saída: o .tmj e a prévia do estilo ----------

const gids = (ids) => ids.map((id) => (id < 0 ? 0 : id + 1));

function camadaDeTiles(id, nome, ids) {
    return { id, name: nome, type: "tilelayer", x: 0, y: 0, width: LARGURA, height: ALTURA, opacity: 1, visible: true, data: gids(ids) };
}

function montarMapa(estilo) {
    return {
        compressionlevel: -1,
        height: ALTURA,
        width: LARGURA,
        tilewidth: TILE,
        tileheight: TILE,
        infinite: false,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.10.2",
        type: "map",
        version: "1.10",
        nextlayerid: 6,
        nextobjectid: proximoId,
        properties: [
            { name: "oleoInicial", type: "int", value: 30 },
            { name: "proximaFase", type: "string", value: "" },
        ],
        tilesets: [
            {
                firstgid: 1,
                name: `tileset-${estilo}`,
                image: `../img/tileset-${estilo}.png`,
                imagewidth: COLUNAS * T,
                imageheight: LINHAS * T,
                tilewidth: TILE,
                tileheight: TILE,
                tilecount: QUANTIDADE,
                columns: COLUNAS,
                margin: 0,
                spacing: 0,
                tiles: [
                    {
                        id: AGUA,
                        animation: [0, 1, 2, 3].map((q) => ({ tileid: AGUA + q, duration: 220 })),
                    },
                ],
            },
        ],
        layers: [
            camadaDeTiles(1, "chao", chao),
            camadaDeTiles(2, "decoracao", decoracao),
            camadaDeTiles(3, "paredes", paredes),
            { id: 4, name: "collision", type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true, objects: retangulos },
            { id: 5, name: "entidades", type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true, objects: entidades },
        ],
    };
}

// o mapa inteiro montado (chão, decoração e paredes, sem entidades), a 2x
function montarPrevia(estilo) {
    const grades = gradesDosTiles();
    const mapa = new Imagem(LARGURA * TILE, ALTURA * TILE);
    for (const camada of [chao, decoracao, paredes]) {
        camada.forEach((id, i) => {
            if (id < 0) return;
            pintarGrade(mapa, grades[id], (i % LARGURA) * TILE, Math.floor(i / LARGURA) * TILE, estilo);
        });
    }
    const previa = new Imagem(mapa.largura * 2, mapa.altura * 2);
    previa.colar(mapa, 0, 0, 2);
    return previa;
}

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const estilo of ORDEM_DOS_ESTILOS) {
    const saida = resolve(raiz, `public/data/map/fase1-${estilo}.tmj`);
    mkdirSync(dirname(saida), { recursive: true });
    writeFileSync(saida, JSON.stringify(montarMapa(estilo), null, 1));
    montarPrevia(estilo).salvar(resolve(raiz, `previas/previa-mapa-${estilo}.png`));
    console.log(`mapa gerado: ${saida}`);
}
console.log(`retângulos de colisão: ${retangulos.length} (faixas por linha: ${faixas.length})`);
console.log(`entidades: ${entidades.length}`);
console.log(`decorações: ${colocadas} de ${livres.length} tiles livres`);
if (gramaSemSombra > 0) console.log(`aviso: ${gramaSemSombra} tile(s) de grama com parede em cima ficam sem sombra`);
