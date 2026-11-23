// Gera os personagens, inimigos, navio, itens e interface da versão 2 no
// estilo do jogo, mais as prévias ampliadas em previas/.
//   node tools/gerar-personagens.mjs
//
// Arquivos (em public/data/img/, <t> = id do estilo, "mare"):
//   jogador-<t>.png        192×48, quadros 24×24 (8 colunas), sem o braço da frente
//   jogador-braco-<t>.png  16×8, ombro em (2, 3), boca da lanterna em (15, 3)
//   zumbi-<t>.png          192×48, quadros 24×24, mesmo layout do jogador (sem o braço);
//                          o quadro 15 é a silhueta branca de dano
//   inimigos-<t>.png       256×160, quadros 32×32, olhando para a esquerda, base na linha 31
//   navio-<t>.png          576×160, 3 quadros 192×160 (inteiro, avariado, muito avariado)
//   itens-<t>.png          128×32, ícones 16×16
//   painel-<t>.png         48×48, 9-slice com bordas de 16
//   botao-<t>.png          96×48, 2 quadros 96×24 (normal e selecionado)
//
// OMBRO DO JOGADOR (onde o jogo prende o ponto (2, 3) do braço), dentro do
// quadro de 24×24: x 11 e y 15 nos quadros em pé. O corpo abaixa 1 px na
// respiração e na passada, sobe 1 px no pulo e muda no dano e na morte.
// A tabela completa, por quadro, é OMBRO_POR_QUADRO (exportada).
//
// Os desenhos usam LETRAS de tom; cada grupo (jogador, caranguejo, alma, pirata,
// navio, itens, interface) diz o papel de cada letra, para tudo continuar
// legível sobre o céu claro do pôr do sol e sobre o terreno escuro.
import { Imagem, hex, criarAleatorio } from "./arte/png.mjs";
import { PAPEL, ESTILOS, ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";
import { BAYER4 } from "./arte/util-sprites.mjs";
import {
    linhas,
    vazio,
    copiar,
    sobrepor,
    deslocar,
    silhueta,
    sumir,
    mascaraVazia,
    dentro,
    marcar,
    elipse,
    poligono,
    linha,
    formaPorFuncao,
    contornar,
    mascaraDe,
    letrasParaImagem,
    colarMisturando,
    recortar,
    esticar9,
    caixa,
} from "./arte/util-personagens.mjs";

const P = PAPEL;
const IMG = "public/data/img";
const PREVIAS = "previas";

// ===========================================================================
// JOGADOR (24×24)
// ===========================================================================
const QJ = 24;

const TONS_JOGADOR = {
    o: P.contorno,
    h: P.brilhoFrio, // luar nas bordas de cima e da esquerda
    C: P.capa,
    c: P.madeira, // sombra da capa
    p: P.pele,
    q: P.fogoEscuro, // sombra da pele
    e: P.contorno, // olho
    b: P.madeiraEscura, // bota
    B: P.madeira, // bota iluminada
    d: P.sombra, // bota da perna de trás
    y: P.fogo, // fivela e botões (brilham com a lanterna)
    F: P.fogoClaro, // brilho que sobe quando ele some
};

// capuz e rosto, olhando para a direita (linhas 4..12 do quadro)
const CABECA = linhas(
    `
...........oooo.........
.........oohhhhoo.......
........ohhCCCCCCo......
.......ohCCCCCCCCCo.....
.......ohCCCCCccccco....
.......oCCCCCcqpppo.....
.......oCCCCCcqppepo....
.......ocCCCCcqppppo....
........occCCcoqppo.....
`,
    QJ,
);

// olho fechado (dano e morte)
function cabecaFechada(base = CABECA) {
    const c = copiar(base);
    c[6][17] = "e";
    c[6][16] = "e";
    c[6][18] = "p";
    return c;
}

// capuz com a ponta levantada pelo vento (queda)
function cabecaVento(base = CABECA) {
    const c = copiar(base);
    c[0][10] = "o";
    c[0][9] = "o";
    c[1][8] = "o";
    c[1][9] = "h";
    c[1][10] = "h";
    return c;
}

// Casaco desenhado por regra: bordas esquerda/direita por linha, com o
// balanço da barra (atrás e na frente) e o voo da barra na queda.
//  desce: o corpo abaixa (0 ou 1; -1 sobe)
//  atras: quanto a barra de trás balança para trás (0..3)
//  frente: quanto a barra da frente vai para a frente (-1..2)
//  voa: barra levantada (queda)
function casaco(q, { desce = 0, atras = 0, frente = 0, voa = false, barra = 17 } = {}) {
    const m = mascaraVazia(QJ, QJ);
    const topo = 13 + desce;
    const fim = barra + desce;
    for (let y = topo; y <= fim; y++) {
        const k = y - topo; // 0 nos ombros
        const ultima = y === fim;
        let esq = ultima ? 6 : k < 2 ? 8 : 7;
        let dir = ultima ? 17 : 16;
        // balanço: a barra de trás vai para a esquerda, mais embaixo
        const embaixo = Math.max(0, y - (fim - 3));
        esq -= Math.round((atras * embaixo) / 3);
        dir += Math.round((frente * embaixo) / 3);
        for (let x = esq; x <= dir; x++) marcar(m, x, y);
    }
    if (voa) {
        // a barra sobe e abre: pontas viradas para cima nas duas laterais
        for (let y = fim - 2; y <= fim; y++) {
            marcar(m, 4 + (fim - y), y - 1);
            marcar(m, 5, y);
            marcar(m, 18, y);
            marcar(m, 19 - (fim - y), y - 1);
        }
        // recorte no meio da barra, onde as pernas saem
        for (let x = 9; x <= 14; x++) m[fim][x] = false;
    }
    // ponta da barra de trás, tremulando
    if (atras >= 2) marcar(m, 6 - atras, fim - 1);
    // tons: luar em cima e na esquerda, sombra na direita e na barra
    for (let y = 0; y < QJ; y++) {
        for (let x = 0; x < QJ; x++) {
            if (!m[y][x]) continue;
            let c = "C";
            if (!dentro(m, x + 1, y) || !dentro(m, x, y + 1)) c = "c";
            // luar só no ombro de trás e nas costas (o queixo cobre o resto)
            if (!dentro(m, x - 1, y) && y < fim - 1) c = "h";
            if (!dentro(m, x, y - 1) && x < 11) c = "h";
            q[y][x] = c;
        }
    }
    // dobra da capa nas costas, que acompanha o balanço
    const xd = 10 - Math.round(atras / 2);
    for (let y = fim - 2; y <= fim; y++) if (m[y]?.[xd]) q[y][xd] = "c";
    // botões da frente
    if (!voa) {
        q[topo + 2][15] = "y";
        q[topo + 4][15] = "y";
    }
    contornar(q, m, "o");
    return q;
}

// Perna (bota de chuva): do quadril (hx, hy) ao pé (fx, fy); o bico aponta para a direita.
function perna(q, hx, hy, fx, fy, tom, claro) {
    const m = mascaraVazia(QJ, QJ);
    linha(m, hx, hy, fx, fy, 1);
    linha(m, hx + 1, hy, fx + 1, fy, 1);
    marcar(m, fx + 2, fy); // bico
    for (let y = 0; y < QJ; y++) {
        for (let x = 0; x < QJ; x++) {
            if (!m[y][x]) continue;
            q[y][x] = claro && !dentro(m, x - 1, y) ? claro : tom;
        }
    }
    contornar(q, m, "o");
}

// pernas de joelhos (morte): canelas deitadas para trás
function pernasDeJoelhos(q) {
    sobrepor(
        q,
        linhas(
            `
....ooooooo.ooo.........
...odddddbbobBo.........
...ooooooooooooo........
`,
            QJ,
        ),
        0,
        21,
    );
}

function quadroJogador(o = {}) {
    const {
        desce = 0,
        pernas = [
            [10, 10, 22],
            [12, 12, 22],
        ],
        atras = 0,
        frente = 0,
        voa = false,
        barra = 17,
        cabeca = CABECA,
        cabecaDx = 0,
        cabecaDy = 0,
        dx = 0,
        joelhos = false,
    } = o;
    let q = vazio(QJ, QJ);
    if (joelhos) {
        pernasDeJoelhos(q);
    } else {
        const [tras, frenteP] = pernas;
        const hy = 18 + desce;
        // perna de trás primeiro (mais escura), depois a da frente
        perna(q, tras[0], hy, tras[1], tras[2], "d", null);
        perna(q, frenteP[0], hy, frenteP[1], frenteP[2], "b", "B");
    }
    casaco(q, { desce, atras, frente, voa, barra });
    sobrepor(q, cabeca, cabecaDx, 4 + desce + cabecaDy);
    if (dx) q = deslocar(q, dx, 0);
    return q;
}

// Caminhada em 6 quadros: pé da frente [+3, +1, -1, -3, -1, +1] em volta do
// quadril; o de trás em fase oposta; o pé que avança sobe 1 px.
const PASSO = [3, 1, -1, -3, -1, 1];
const SOBE = [false, false, false, false, true, true];
const DESCE_ANDANDO = [0, 1, 0, 0, 1, 0];
const ATRAS_ANDANDO = [1, 2, 1, 1, 2, 1];
const FRENTE_ANDANDO = [1, 0, 0, 1, 0, 0];

// cab: a cabeça (capuz do faroleiro ou a do zumbi); o resto do corpo é o mesmo
function quadrosDoJogador(cab = CABECA) {
    const qj = (o) => quadroJogador({ cabeca: cab, ...o });
    const fechada = cabecaFechada(cab);
    const vento = cabecaVento(cab);
    const q = [];
    q[0] = qj({});
    q[1] = qj({ desce: 1 });
    for (let i = 0; i < 6; i++) {
        const j = (i + 3) % 6;
        const fy = (k) => (SOBE[k] ? 21 : 22);
        q[2 + i] = qj({
            desce: DESCE_ANDANDO[i],
            pernas: [
                [10, 10 + PASSO[j], fy(j)],
                [12, 11 + PASSO[i], fy(i)],
            ],
            atras: ATRAS_ANDANDO[i],
            frente: FRENTE_ANDANDO[i],
        });
    }
    // pulo: joelho da frente erguido, perna de trás esticada, capa caindo atrás
    q[8] = qj({
        desce: -1,
        pernas: [
            [10, 8, 21],
            [12, 14, 19],
        ],
        atras: 2,
        frente: -1,
    });
    // queda: capa voando para cima, pernas abertas para baixo
    q[9] = qj({
        pernas: [
            [10, 8, 22],
            [12, 14, 22],
        ],
        voa: true,
        barra: 16,
        cabeca: vento,
    });
    // dano: tranco para trás, olho fechado, capa jogada para a frente
    q[10] = qj({
        pernas: [
            [10, 9, 22],
            [12, 14, 21],
        ],
        frente: 2,
        cabeca: fechada,
        cabecaDx: -1,
        dx: -1,
    });
    // morte: dobra os joelhos, cai de joelhos e some
    q[11] = qj({
        desce: 2,
        pernas: [
            [10, 8, 22],
            [12, 14, 22],
        ],
        cabeca: fechada,
        cabecaDx: 1,
        cabecaDy: 1,
    });
    const ajoelhado = qj({ desce: 3, joelhos: true, cabeca: fechada, cabecaDx: 1, cabecaDy: 2 });
    q[12] = ajoelhado;
    const caido = qj({ desce: 4, joelhos: true, cabeca: fechada, cabecaDx: 2, cabecaDy: 3 });
    q[13] = sumirDeCima(caido, (y) => (y - 6) / 10);
    q[14] = sumirDeCima(caido, (y) => (y - 17) / 10);
    // brilhos subindo enquanto ele some
    for (const [x, y] of [
        [9, 9],
        [14, 6],
        [12, 3],
        [16, 11],
    ]) {
        q[14][y][x] = "F";
    }
    for (const [x, y] of [
        [8, 12],
        [15, 9],
    ]) {
        q[13][y][x] = "F";
    }
    q[15] = vazio(QJ, QJ);
    return q;
}

// some de cima para baixo: fração mantida por linha
function sumirDeCima(letras, fracaoDaLinha) {
    return letras.map((l, y) => {
        const f = Math.max(0, Math.min(1, fracaoDaLinha(y)));
        return l.map((c, x) => (c !== "." && BAYER4[y & 3][x & 3] < f ? c : "."));
    });
}

export const OMBRO_POR_QUADRO = (() => {
    const desce = [0, 1, ...DESCE_ANDANDO, -1, 0, 0, 2, 3, 4, 4, 0];
    return desce.map((d, i) => ({ x: i === 10 ? 10 : 11, y: 15 + d }));
})();

// braço com a lanterna de mão, apontando para a direita (16×8): manga da capa
// até x 8, mão pequena em x 9..10, lanterna de metal em x 11..14 e a boca acesa
// em x 15 (y 3 e 4). O braço tem 4 px de grossura, como a perna.
const BRACO = linhas(
    `
................
.............oo.
.ooooooooooooGgo
ohhCCCCccppgggGF
ocCCCCcccqqGGGGy
.ooooooooooooooo
................
................
`,
    16,
);

// ===========================================================================
// ZUMBI (24×24, mesmo layout do jogador, olhando para a direita)
// ===========================================================================
// Reaproveita os quadros do faroleiro: pele verde, cabeça sem capuz (cabelo
// ralo), capa em trapos com a barra rasgada, olhos escuros sem brilho.
const TONS_ZUMBI = {
    ...TONS_JOGADOR,
    p: P.gramaClara, // pele esverdeada
    q: P.folha, // sombra da pele
    C: P.areiaEscura, // capa apodrecida
    c: P.madeira,
    y: P.metal, // botões foscos: nada brilha com a lanterna
    F: P.fantasma,
    W: P.olho, // quadro de dano (branco), como o dos outros monstros
};

// cabeça careca com tufos de cabelo ralo ("d"), no mesmo lugar da do faroleiro
// (o olho fica em (17, 6), onde cabecaFechada() espera)
const CABECA_ZUMBI = linhas(
    `
........................
..........oooooo........
.........ohddpdpo.......
........ohpdppdppo......
........ohppppppppo.....
........oppppqqqpppo....
........oppppqqppepo....
........oppppppqpppo....
........oqpppppqpo......
`,
    QJ,
);

// barra da capa em trapos: recorta a ponta de baixo da capa em dentes, longe
// das pernas (x 10 a 14)
function rasgarCapa(q) {
    const cortes = [2, 0, 1, 3, 0, 1, 2, 0, 3, 1, 0, 2, 1, 3];
    for (let x = 5; x <= 20; x++) {
        if (x >= 10 && x <= 14) continue;
        let y = 20;
        while (y > 12 && !"Cco".includes(q[y][x])) y--;
        if (y <= 12) continue;
        const corte = cortes[x % cortes.length];
        for (let k = 0; k < corte && "Cco".includes(q[y][x]); k++) {
            q[y][x] = ".";
            y--;
        }
        if (corte > 0 && "Cc".includes(q[y][x])) q[y][x] = "o";
    }
    return q;
}

// Quadro 15 (vazio no faroleiro): a silhueta branca do zumbi parado, o quadro
// de dano piscando na luz, como o caranguejo, a alma e o vampiro. O quadro 10
// (o tranco do faroleiro) é escuro e não aparece como piscada.
function quadrosDoZumbi() {
    const q = quadrosDoJogador(CABECA_ZUMBI).map((quadro, i) => (i === 15 ? quadro : rasgarCapa(quadro)));
    q[15] = silhueta(q[0], "W", "o");
    return q;
}

// ===========================================================================
// INIMIGOS (32×32, olhando para a esquerda, base na linha 31)
// ===========================================================================
const QI = 32;

const TONS_INIMIGOS = {
    o: P.contorno,
    S: P.sombra, // corpo escuro (caranguejo e alma)
    s: P.pedraEscura, // corpo perto da luz de cima
    r: P.pedra, // borda de cima (luar)
    R: P.brilhoFrio, // brilhos pequenos na carapaça
    D: P.contorno, // miolo mais escuro
    k: P.pedraClara, // pontas das pinças
    w: P.olho, // olhos claros
    W: P.olho, // quadro de dano (branco)
    // pirata fantasma: verde translúcido
    n: [P.folhaEscura, 235], // contorno do fantasma
    v: [P.folha, 215], // sombra
    f: [P.fantasma, 215], // corpo
    F: [P.fantasmaClaro, 230], // luz
    E: P.fantasmaClaro, // olho aceso
    l: [P.folhaEscura, 150], // pernas sumindo
    i: [P.folha, 120],
    u: [P.fantasma, 135],
    U: [P.fantasmaClaro, 160],
    x: P.contorno, // chapéu e cinto
    X: P.sombra, // aba do chapéu iluminada
    z: P.metal, // lâmina
    Z: P.brilhoFrio, // fio da lâmina
    m: P.fogoEscuro, // guarda do sabre (latão)
    a: [P.fantasmaClaro, 110], // rastro do golpe
    // vampiro: capa roxa com forro vermelho, olhos que brilham
    V: P.kraken, // capa
    Y: P.krakenClaro, // capa iluminada
    q: P.capa, // forro da capa
    J: P.capa, // olhos acesos
};

// pinta uma máscara com tons por regra de luz e contorna
function parte(q, m, tons, opcoes = {}) {
    const { borda, luz, base, escuro = base } = tons;
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[0].length; x++) {
            if (!m[y][x]) continue;
            let c = base;
            if (!dentro(m, x + 1, y) || !dentro(m, x, y + 1)) c = escuro;
            if (!dentro(m, x, y - 2) || !dentro(m, x - 1, y)) c = luz;
            if (!dentro(m, x, y - 1)) c = borda;
            q[y][x] = c;
        }
    }
    if (opcoes.contorno !== false) contornar(q, m, opcoes.letraContorno ?? "o", { diagonais: opcoes.diagonais ?? false });
    return q;
}

// pinça: palma + dedo de cima (móvel) + dedo de baixo, apontando para `angulo`
function pinca(m, cx, cy, angulo, abertura, escala = 1) {
    const cu = Math.cos(angulo);
    const su = Math.sin(angulo);
    return formaPorFuncao(m, (x, y) => {
        const dx = (x - cx) / escala;
        const dy = (y - cy) / escala;
        const u = dx * cu + dy * su; // ao longo da pinça
        const v = -dx * su + dy * cu; // de lado (positivo = "embaixo")
        if (u ** 2 / 3.4 ** 2 + v ** 2 / 3.8 ** 2 <= 1) return true; // palma
        if (u >= 2 && u <= 7.8) {
            const t = (u - 2) / 5.8;
            const centro = -1.7 - abertura * t * 1.6 + t * t * 2.3;
            const grossura = 1.9 * (1 - t) + 0.5;
            if (Math.abs(v - centro) <= grossura) return true;
        }
        if (u >= 2 && u <= 6.2) {
            const t = (u - 2) / 4.2;
            const centro = 2.6 + abertura * t * 0.5 - t * t * 1.1;
            const grossura = 1.3 * (1 - t) + 0.5;
            if (Math.abs(v - centro) <= grossura) return true;
        }
        return false;
    });
}

// caranguejo sombrio: i = quadro da caminhada (0..3); ataque = 0 (não), 1 (ergue), 2 (bate)
function quadroCaranguejo(i, ataque = 0) {
    const q = vazio(QI, QI);
    const bob = ataque ? 0 : i % 2;
    const corpoY = 23 + bob;
    const tonsCorpo = { borda: "r", luz: "s", base: "S", escuro: "S" };
    const tonsPerto = { borda: "r", luz: "s", base: "s", escuro: "S" };
    const tonsLonge = { borda: "s", luz: "S", base: "S", escuro: "S" };

    // pernas: [ponto no corpo, direção, fase]
    const pernas = [
        [15, -0.9, 0],
        [20, 0.2, 1],
        [25, 1, 0],
    ];
    const desenhaPernas = (longe) => {
        pernas.forEach(([ax, dir, fase]) => {
            const m = mascaraVazia(QI, QI);
            const x0 = ax + (longe ? 2 : 0);
            const passo = ataque ? 0 : (i + fase + (longe ? 1 : 0)) % 2 === 0 ? 1 : -1;
            const levanta = !ataque && passo < 0 ? 1 : 0;
            const joelhoX = x0 + Math.round(dir * 3) + (longe ? 1 : 0);
            const joelhoY = corpoY + 3 - levanta;
            const peX = x0 + Math.round(dir * 5) + passo;
            const peY = 31 - levanta - (longe ? 1 : 0);
            linha(m, x0, corpoY + 2, joelhoX, joelhoY, 2);
            linha(m, joelhoX, joelhoY, peX, peY, 1);
            parte(q, m, longe ? tonsLonge : tonsPerto);
        });
    };
    desenhaPernas(true);

    // pinça de trás (menor, mais escura)
    {
        const m = mascaraVazia(QI, QI);
        linha(m, 14, corpoY + 1, 11, corpoY, 2);
        pinca(m, 9, corpoY, Math.PI + 0.3, ataque === 1 ? 0.6 : 0.2, 0.75);
        parte(q, m, tonsLonge);
    }

    // carapaça com espinhos em cima
    {
        const m = mascaraVazia(QI, QI);
        elipse(m, 20, corpoY + 0.5, 9, 6.6);
        for (let y = corpoY + 3; y < QI; y++) for (let x = 0; x < QI; x++) m[y][x] = false;
        for (const [x, dy] of [
            [15, -5],
            [19, -6],
            [24, -6],
            [28, -4],
        ]) {
            marcar(m, x, corpoY + dy);
        }
        // boca embaixo, na frente
        marcar(m, 10, corpoY + 1);
        marcar(m, 10, corpoY + 2);
        parte(q, m, tonsCorpo);
        // brilhos e manchas da carapaça
        q[corpoY - 3][17] = "R";
        q[corpoY - 4][21] = "R";
        q[corpoY - 2][26] = "s";
        q[corpoY - 1][23] = "s";
        q[corpoY + 1][16] = "D";
        q[corpoY + 1][20] = "D";
        q[corpoY + 1][24] = "D";
    }

    // olhos em hastes
    {
        const m = mascaraVazia(QI, QI);
        const balanco = ataque ? 0 : [0, 0, 1, 0][i];
        linha(m, 14, corpoY - 4, 13 - balanco, corpoY - 8, 1);
        linha(m, 17, corpoY - 5, 17, corpoY - 9, 1);
        elipse(m, 13 - balanco, corpoY - 9, 1.2, 1.2);
        elipse(m, 17, corpoY - 10, 1.2, 1.2);
        parte(q, m, { borda: "s", luz: "s", base: "S" });
        for (const [ex, ey] of [
            [13 - balanco, corpoY - 9],
            [17, corpoY - 10],
        ]) {
            q[ey][ex] = "w";
            q[ey][ex - 1] = "w";
            q[ey - 1][ex] = "w";
            q[ey - 1][ex - 1] = ataque ? "w" : "R";
        }
    }

    desenhaPernas(false);

    // pinça grande da frente
    {
        const m = mascaraVazia(QI, QI);
        if (ataque === 1) {
            // ergue a pinça aberta, ameaçando
            linha(m, 13, corpoY - 1, 10, corpoY - 7, 2);
            pinca(m, 9, corpoY - 10, -Math.PI / 2 - 0.45, 0.9, 1);
        } else if (ataque === 2) {
            // bate: pinça para a frente e para baixo, fechada
            linha(m, 13, corpoY, 10, corpoY, 2);
            pinca(m, 8, corpoY + 1, Math.PI + 0.4, 0, 1);
        } else {
            linha(m, 13, corpoY, 11, corpoY - 2, 2);
            pinca(m, 8, corpoY - 3, Math.PI + 0.12 * (i % 2 ? 1 : -1), i === 2 ? 0.5 : 0.25, 1);
        }
        parte(q, m, { borda: "k", luz: "r", base: "r", escuro: "s" });
    }
    // rastro do golpe
    if (ataque === 2) {
        for (const [x, y] of [
            [4, 12],
            [2, 15],
            [1, 18],
            [1, 21],
        ]) {
            q[y][x] = "R";
        }
    }
    return q;
}

// fumaça: o corpo vira nuvens que sobem
function quadroFumaca(base, sementes, tons) {
    const q = vazio(QI, QI);
    const m = mascaraVazia(QI, QI);
    for (const [cx, cy, r] of sementes) elipse(m, cx, cy, r, r * 0.85);
    for (let y = 0; y < QI; y++) {
        for (let x = 0; x < QI; x++) {
            if (!m[y][x]) continue;
            // pontilhado: a nuvem é rala e mais cheia em cima
            if (BAYER4[y & 3][x & 3] > 0.62) continue;
            q[y][x] = !dentro(m, x, y - 1) ? tons.borda : !dentro(m, x, y - 2) ? tons.luz : tons.base;
        }
    }
    sobrepor(q, sumir(base, 0.3), 0, 0);
    return q;
}

// alma voadora: espectro com cabeça redonda, franja embaixo e cauda ondulando.
//  fase: 0..3; angulo: inclinação (mergulho); estica: alonga o corpo
function quadroAlma(fase, { cx = 13, cy = 15, angulo = 0, estica = 1, boca = false } = {}) {
    const q = vazio(QI, QI);
    const ph = (fase * Math.PI) / 2;
    const ca = Math.cos(angulo);
    const sa = Math.sin(angulo);
    const local = (x, y) => {
        const dx = x - cx;
        const dy = y - cy;
        return [(dx * ca + dy * sa) / estica, -dx * sa + dy * ca];
    };
    const global = (u, v) => [Math.round(cx + u * estica * ca - v * sa), Math.round(cy + u * estica * sa + v * ca)];
    const corpo = (u, v, comPonta) => {
        if ((u * u) / 6.2 ** 2 + (v * v) / 5.8 ** 2 <= 1) return true;
        // franja embaixo da cabeça, balançando
        if (u > -5.5 && u < 4 && v > 0) {
            const franja = 5.6 + 1.4 + 1.3 * Math.sin(u * 1.5 + ph * 2);
            if (v <= franja && (u * u) / 6.2 ** 2 + (v * 0.55) ** 2 / 5.8 ** 2 <= 1) return true;
        }
        const fim = comPonta ? 15 : 11;
        if (u >= 0 && u <= fim) {
            const t = u / 15;
            const meia = 5.2 * Math.pow(1 - t, 1.5);
            const centro = 2.4 * Math.sin(u * 0.45 - ph) * t - 2.4 * t * t;
            if (Math.abs(v - centro) <= meia) return true;
        }
        return false;
    };
    const m = formaPorFuncao(mascaraVazia(QI, QI), (x, y) => corpo(...local(x, y), false));
    const ponta = formaPorFuncao(mascaraVazia(QI, QI), (x, y) => corpo(...local(x, y), true));
    // a ponta da cauda é rala (pontilhada) e sem contorno
    for (let y = 0; y < QI; y++) {
        for (let x = 0; x < QI; x++) {
            if (ponta[y][x] && !m[y][x] && BAYER4[y & 3][x & 3] < 0.5) q[y][x] = (x + y) % 2 ? "S" : "D";
        }
    }
    for (let y = 0; y < QI; y++) {
        for (let x = 0; x < QI; x++) {
            if (!m[y][x]) continue;
            const [, v] = local(x + 0.5, y + 0.5);
            let c = "S";
            if (v > 3.5 && (x + y) % 2 === 0) c = "D";
            if (!dentro(m, x, y - 2)) c = "s";
            if (!dentro(m, x, y - 1)) c = "r";
            q[y][x] = c;
        }
    }
    contornar(q, m, "o");
    // olhos inclinados, o canto de fora mais alto (como os do Rondador)
    const olhos = [
        [-5, -2],
        [-5, -1],
        [-4, -1],
        [-1, -2],
        [-2, -1],
        [-1, -1],
    ];
    for (const [u, v] of olhos) {
        const [x, y] = global(u, v);
        if (y >= 0 && y < QI && x >= 0 && x < QI) q[y][x] = "w";
    }
    if (boca) {
        for (const [u, v] of [
            [-4.6, 1.6],
            [-3.6, 2.2],
            [-2.6, 1.8],
            [-3.6, 1.2],
        ]) {
            const [x, y] = global(u, v);
            q[y][x] = "D";
        }
        const [x, y] = global(-3.6, 1.6);
        q[y][x] = "w";
    }
    return q;
}

// Pirata fantasma (cerca de 14×26). passo: -2..2 do pé da frente; braco: "anda", "ergue", "golpe"
function quadroPirata({ passo = 0, levanta = false, braco = "anda", bob = 0, aba = 0 } = {}) {
    const q = vazio(QI, QI);
    const tons = { borda: "F", luz: "F", base: "f", escuro: "v" };
    const tonsLonge = { borda: "f", luz: "v", base: "v", escuro: "v" };
    const y0 = bob;

    // braço de trás
    {
        const m = mascaraVazia(QI, QI);
        linha(m, 18, 16 + y0, 20, 21 + y0, 2);
        parte(q, m, tonsLonge, { letraContorno: "n" });
    }
    // pernas: de trás (escura) e da frente
    const pernaP = (hx, px, sobe, longe) => {
        const m = mascaraVazia(QI, QI);
        linha(m, hx, 24 + y0, px, 30 - sobe, 2);
        marcar(m, px - 1, 30 - sobe);
        parte(q, m, longe ? tonsLonge : tons, { letraContorno: "n" });
    };
    pernaP(17, 17 - passo, !levanta ? 0 : passo < 0 ? 1 : 0, true);
    pernaP(14, 14 + passo, levanta && passo >= 0 ? 1 : 0, false);

    // casaco comprido com a barra rasgada, abrindo atrás conforme o passo
    {
        const m = mascaraVazia(QI, QI);
        poligono(m, [
            [12, 15 + y0],
            [20, 15 + y0],
            [21, 21 + y0],
            [23 + aba, 27 + y0],
            [11, 27 + y0],
            [12, 21 + y0],
        ]);
        // barra rasgada (dentes)
        for (let x = 11; x <= 23 + aba; x++) {
            if ((x + aba) % 3 === 0) marcar(m, x, 28 + y0);
            if ((x + aba) % 3 === 1) marcar(m, x, 27 + y0, false);
        }
        // abertura da frente (as pernas aparecem)
        for (let y = 23 + y0; y <= 28 + y0; y++) for (let x = 13; x <= 15; x++) m[y][x] = false;
        parte(q, m, { borda: "F", luz: "f", base: "f", escuro: "v" }, { letraContorno: "n" });
        // cinto com fivela e botões
        for (let x = 12; x <= 20; x++) if (m[21 + y0][x]) q[21 + y0][x] = "x";
        q[21 + y0][14] = "m";
        q[17 + y0][13] = "F";
        q[19 + y0][13] = "F";
        // dobra
        for (let y = 23 + y0; y <= 27 + y0; y++) if (m[y][19]) q[y][19] = "v";
    }
    // cabeça: caveira pálida com barba rala
    {
        const m = mascaraVazia(QI, QI);
        elipse(m, 15, 12 + y0, 3.6, 3.4);
        for (const [x, y] of [
            [12, 15],
            [13, 16],
            [14, 15],
            [15, 16],
            [16, 15],
            [12, 16],
        ]) {
            marcar(m, x, y + y0);
        }
        parte(q, m, { borda: "F", luz: "F", base: "F", escuro: "f" }, { letraContorno: "n" });
        // barba rala
        for (const [x, y] of [
            [12, 15],
            [13, 16],
            [14, 15],
            [15, 16],
            [16, 15],
            [12, 16],
        ]) {
            q[y + y0][x] = (x + y) % 2 ? "f" : "v";
        }
        // órbitas escuras com o olho aceso
        q[11 + y0][12] = "x";
        q[12 + y0][12] = "E";
        q[11 + y0][14] = "x";
        q[12 + y0][14] = "x";
        q[12 + y0][15] = "E";
        // nariz e dentes
        q[13 + y0][11] = "n";
        q[14 + y0][13] = "n";
        q[14 + y0][15] = "n";
    }
    // chapéu de três pontas
    {
        const m = mascaraVazia(QI, QI);
        poligono(m, [
            [8, 7 + y0],
            [11, 8 + y0],
            [12, 5 + y0],
            [15, 4 + y0],
            [19, 5 + y0],
            [20, 8 + y0],
            [23, 6 + y0],
            [23, 9 + y0],
            [20, 10 + y0],
            [10, 10 + y0],
        ]);
        parte(q, m, { borda: "X", luz: "x", base: "x", escuro: "x" }, { letraContorno: "o" });
        // fita fantasma no chapéu
        for (let x = 12; x <= 19; x++) if (m[8 + y0][x]) q[8 + y0][x] = "v";
    }
    // braço da frente com o sabre
    {
        const m = mascaraVazia(QI, QI);
        const lam = mascaraVazia(QI, QI);
        let mao;
        if (braco === "ergue") {
            linha(m, 14, 16 + y0, 11, 11 + y0, 2);
            mao = [11, 10 + y0];
            // lâmina para cima e para trás, curva
            linha(lam, 12, 8 + y0, 15, 3 + y0, 1);
            linha(lam, 15, 3 + y0, 19, 1 + y0, 1);
        } else if (braco === "golpe") {
            linha(m, 13, 17 + y0, 8, 18 + y0, 2);
            mao = [7, 18 + y0];
            linha(lam, 5, 18 + y0, 1, 19 + y0, 1);
            linha(lam, 1, 19 + y0, 0, 21 + y0, 1);
        } else {
            linha(m, 13, 16 + y0, 11, 20 + y0, 2);
            mao = [10, 21 + y0];
            // sabre apontando para a frente e para baixo
            linha(lam, 9, 22 + y0, 6, 26 + y0, 1);
            linha(lam, 6, 26 + y0, 4, 27 + y0, 1);
        }
        parte(q, m, tons, { letraContorno: "n" });
        // lâmina: fio claro em cima, metal embaixo, contorno escuro
        for (let y = 0; y < QI; y++) {
            for (let x = 0; x < QI; x++) if (lam[y][x]) q[y][x] = dentro(lam, x, y - 1) || dentro(lam, x + 1, y - 1) ? "z" : "Z";
        }
        contornar(q, lam, "o", { sobre: false });
        // guarda e punho
        q[mao[1]][mao[0]] = "m";
        if (braco === "anda") q[mao[1] + 1][mao[0] - 1] = "m";
        if (braco === "golpe") {
            q[mao[1] - 1][mao[0] - 1] = "m";
            q[mao[1] + 1][mao[0] - 1] = "m";
            // rastro do golpe: arco claro de cima para a frente
            for (const [x, y] of [
                [10, 3],
                [7, 4],
                [5, 6],
                [3, 9],
                [2, 12],
                [1, 15],
                [8, 4],
                [4, 7],
                [2, 10],
            ]) {
                if (q[y][x] === ".") q[y][x] = "a";
            }
        }
    }
    // pernas somem embaixo (fantasma)
    for (let y = 26; y < QI; y++) {
        for (let x = 0; x < QI; x++) {
            const c = q[y][x];
            const troca = { f: "u", F: "U", v: "i", n: "l" }[c];
            if (!troca) continue;
            q[y][x] = y >= 30 && BAYER4[y & 3][x & 3] > 0.5 ? "." : troca;
        }
    }
    return q;
}

// Lápide (cerca de 16×22, base na linha 31): pedra com uma cruz gravada sobre
// um montinho de terra. rachada: pedaço do canto de cima caído e rachaduras
function quadroLapide(rachada) {
    const q = vazio(QI, QI);
    // montinho de terra
    {
        const m = mascaraVazia(QI, QI);
        elipse(m, 16, 30, 11, 2.6);
        parte(q, m, { borda: "s", luz: "S", base: "S", escuro: "S" });
    }
    // pedra com o topo arredondado
    const m = mascaraVazia(QI, QI);
    for (let y = 10; y <= 29; y++) {
        let a = 9;
        let b = 22;
        if (y === 10) [a, b] = [12, 19];
        if (y === 11) [a, b] = [10, 21];
        for (let x = a; x <= b; x++) marcar(m, x, y);
    }
    if (rachada) {
        // o canto de cima da direita caiu
        for (const [x, y] of [
            [19, 10],
            [20, 10],
            [20, 11],
            [21, 11],
            [21, 12],
            [22, 12],
            [22, 13],
        ]) {
            marcar(m, x, y, false);
        }
    }
    parte(q, m, { borda: "R", luz: "k", base: "r", escuro: "s" });
    // cruz gravada
    for (const [x, y] of [
        [15, 14],
        [16, 14],
        [15, 15],
        [16, 15],
        [15, 16],
        [16, 16],
        [13, 17],
        [14, 17],
        [15, 17],
        [16, 17],
        [17, 17],
        [18, 17],
        [15, 18],
        [16, 18],
        [15, 19],
        [16, 19],
        [15, 20],
        [16, 20],
    ]) {
        q[y][x] = "s";
    }
    // musgo e manchas no pé da pedra
    for (const [x, y] of [
        [11, 26],
        [12, 27],
        [20, 25],
        [19, 27],
        [13, 28],
    ]) {
        q[y][x] = "s";
    }
    if (rachada) {
        // rachaduras que descem do canto quebrado
        for (const [x, y] of [
            [19, 13],
            [18, 14],
            [18, 15],
            [17, 16],
            [17, 17],
            [16, 18],
            [16, 19],
            [15, 20],
            [15, 21],
            [14, 22],
            [14, 23],
            [13, 24],
            [11, 20],
            [12, 21],
            [12, 22],
            [20, 22],
            [20, 23],
            [21, 24],
        ]) {
            q[y][x] = "o";
        }
        // pedaço caído no chão
        for (const [x, y] of [
            [24, 30],
            [25, 30],
            [24, 31],
            [25, 31],
            [26, 31],
        ]) {
            q[y][x] = (x + y) % 2 ? "r" : "k";
        }
    }
    return q;
}

// Vampiro (cerca de 14×26, base na linha 31, olhando para a esquerda): capa
// roxa com colarinho alto, rosto pálido, cabelo para trás, olhos acesos.
//  passo: -2..2 do pé da frente; levanta: o pé que avança sobe 1 px
//  bob: o corpo abaixa 1 px; aba: a barra da capa balança (-1..2)
function quadroVampiro({ passo = 0, levanta = false, bob = 0, aba = 0 } = {}) {
    const q = vazio(QI, QI);
    const y0 = bob;
    const capa = { borda: "Y", luz: "Y", base: "V", escuro: "V" };
    const roupa = { borda: "X", luz: "x", base: "x", escuro: "x" };

    // capa de trás: colarinho que sobe atrás da cabeça e barra que bate nas pernas
    {
        const m = mascaraVazia(QI, QI);
        poligono(m, [
            [15, 14 + y0],
            [20, 9 + y0],
            [23, 8 + y0],
            [23, 14 + y0],
            [25 + aba, 22 + y0],
            [27 + aba, 29],
            [22, 28],
            [19 + aba, 30],
            [16, 28],
        ]);
        // barra em dentes
        for (let x = 16; x <= 27; x++) if ((x + aba) % 3 === 0) marcar(m, x, 29, false);
        parte(q, m, capa);
        // forro vermelho no vão da capa
        for (let y = 15 + y0; y <= 26; y++) {
            for (let x = 19; x <= 22; x++) {
                if (m[y][x] && dentro(m, x, y - 1) && dentro(m, x + 1, y) && dentro(m, x - 1, y)) q[y][x] = "q";
            }
        }
    }
    // pernas
    const perna = (hx, px, sobe) => {
        const m = mascaraVazia(QI, QI);
        linha(m, hx, 24 + y0, px, 30 - sobe, 2);
        marcar(m, px - 1, 30 - sobe);
        parte(q, m, roupa);
    };
    perna(17, 17 - passo, !levanta ? 0 : passo < 0 ? 1 : 0);
    perna(14, 14 + passo, levanta && passo >= 0 ? 1 : 0);
    // tronco
    {
        const m = mascaraVazia(QI, QI);
        poligono(m, [
            [12, 14 + y0],
            [19, 14 + y0],
            [20, 21 + y0],
            [19, 26 + y0],
            [12, 26 + y0],
            [11, 21 + y0],
        ]);
        parte(q, m, roupa);
        // camisa pálida em V e medalhão
        for (const [x, y] of [
            [12, 15],
            [13, 15],
            [12, 16],
            [13, 16],
            [12, 17],
        ]) {
            q[y + y0][x] = "w";
        }
        q[19 + y0][13] = "m";
        // cinto
        for (let x = 12; x <= 19; x++) q[23 + y0][x] = "o";
    }
    // cabeça pálida, cabelo para trás
    {
        const m = mascaraVazia(QI, QI);
        elipse(m, 15, 10 + y0, 3.4, 3.8);
        // queixo fino
        marcar(m, 13, 14 + y0);
        marcar(m, 14, 14 + y0);
        parte(q, m, { borda: "w", luz: "w", base: "w", escuro: "k" });
        // cabelo (de cima e atrás) e pico na testa
        for (const [x, y] of [
            [13, 6],
            [14, 6],
            [15, 6],
            [16, 6],
            [17, 6],
            [12, 7],
            [13, 7],
            [15, 7],
            [16, 7],
            [17, 7],
            [18, 7],
            [18, 8],
            [18, 9],
            [14, 8],
        ]) {
            if (q[y + y0][x] !== ".") q[y + y0][x] = "x";
        }
        // olhos acesos, nariz, boca com presa
        q[10 + y0][12] = "J";
        q[10 + y0][15] = "J";
        q[11 + y0][11] = "k";
        q[13 + y0][13] = "o";
        q[13 + y0][14] = "o";
        q[14 + y0][13] = "w";
    }
    // braço da frente caído, com a mão pálida
    {
        const m = mascaraVazia(QI, QI);
        linha(m, 13, 16 + y0, 11, 22 + y0, 2);
        parte(q, m, roupa);
        q[23 + y0][10] = "w";
        q[23 + y0][11] = "w";
    }
    return q;
}

// dash: corpo esticado para a frente (esquerda), capa aberta como asas
function quadroVampiroDash() {
    const q = vazio(QI, QI);
    const capa = { borda: "Y", luz: "Y", base: "V", escuro: "V" };
    const roupa = { borda: "X", luz: "x", base: "x", escuro: "x" };
    // capa aberta atrás: duas asas com a barra em dentes
    {
        const m = mascaraVazia(QI, QI);
        poligono(m, [
            [17, 17],
            [22, 7],
            [27, 5],
            [29, 9],
            [31, 16],
            [31, 24],
            [27, 21],
            [25, 27],
            [21, 22],
            [18, 25],
        ]);
        for (const [x, y] of [
            [31, 17],
            [30, 20],
            [29, 22],
            [26, 24],
            [22, 25],
        ]) {
            marcar(m, x, y, false);
        }
        parte(q, m, capa);
        // forro vermelho no meio das asas
        for (let y = 0; y < QI; y++) {
            for (let x = 21; x < QI; x++) {
                if (m[y][x] && dentro(m, x, y - 1) && dentro(m, x, y + 1) && dentro(m, x + 1, y) && dentro(m, x - 1, y)) q[y][x] = "q";
            }
        }
    }
    // pernas esticadas para trás
    {
        const m = mascaraVazia(QI, QI);
        linha(m, 17, 22, 26, 26, 2);
        linha(m, 15, 24, 23, 29, 2);
        parte(q, m, roupa);
    }
    // tronco inclinado para a frente
    {
        const m = mascaraVazia(QI, QI);
        poligono(m, [
            [9, 16],
            [17, 15],
            [21, 19],
            [20, 25],
            [12, 24],
            [8, 21],
        ]);
        parte(q, m, roupa);
        q[18][10] = "w";
        q[19][10] = "w";
        q[20][11] = "m";
        for (let y = 20; y <= 23; y++) q[y][17] = "o";
    }
    // cabeça à frente, olhos acesos, cabelo para trás
    {
        const m = mascaraVazia(QI, QI);
        elipse(m, 8, 14, 3.6, 3.6);
        marcar(m, 6, 17);
        marcar(m, 7, 17);
        parte(q, m, { borda: "w", luz: "w", base: "w", escuro: "k" });
        for (const [x, y] of [
            [6, 10],
            [7, 10],
            [8, 10],
            [9, 10],
            [10, 11],
            [11, 12],
            [11, 13],
            [10, 12],
        ]) {
            if (q[y][x] !== ".") q[y][x] = "x";
        }
        q[13][5] = "J";
        q[13][8] = "J";
        q[14][4] = "k";
        q[16][6] = "o";
        q[16][7] = "o";
        q[17][6] = "w";
    }
    // braço esticado para a frente, mão em garra
    {
        const m = mascaraVazia(QI, QI);
        linha(m, 11, 19, 4, 20, 2);
        parte(q, m, roupa);
        for (const [x, y] of [
            [2, 20],
            [3, 20],
            [2, 21],
            [1, 19],
            [1, 22],
        ]) {
            q[y][x] = "w";
        }
    }
    // riscos de velocidade
    for (const [x, y] of [
        [29, 12],
        [30, 14],
        [28, 28],
        [31, 27],
    ]) {
        if (q[y][x] === ".") q[y][x] = "R";
    }
    return q;
}

// 8 quadros: 0 parado, 1 a 4 andando, 5 dash, 6 dano, 7 morte
function quadrosDoVampiro() {
    const q = [];
    const PASSOS = [2, 0, -2, 0];
    q[0] = quadroVampiro({});
    for (let i = 0; i < 4; i++) q[1 + i] = quadroVampiro({ passo: PASSOS[i], levanta: i % 2 === 1, bob: i % 2, aba: [0, 1, 0, -1][i] });
    q[5] = quadroVampiroDash();
    q[6] = silhueta(quadroVampiro({}), "W", "o");
    // morte: vira pó de baixo para cima e dois morcegos fogem
    const base = quadroVampiro({ passo: 1, aba: 1 });
    const sumido = base.map((l, y) => l.map((c, x) => (c !== "." && BAYER4[y & 3][x & 3] < Math.max(0, 0.8 - (y - 4) / 24) ? c : ".")));
    q[7] = deslocar(sumido, 0, -1);
    for (const [x, y] of [
        [8, 4],
        [10, 3],
        [9, 5],
        [23, 2],
        [25, 2],
        [24, 3],
    ]) {
        q[7][y][x] = "V";
    }
    return q;
}

function quadrosDosInimigos() {
    const q = [];
    for (let i = 0; i < 4; i++) q[i] = quadroCaranguejo(i);
    q[4] = quadroCaranguejo(0, 1);
    q[5] = quadroCaranguejo(0, 2);
    q[6] = silhueta(quadroCaranguejo(0), "W", "o");
    q[7] = quadroFumaca(
        quadroCaranguejo(0),
        [
            [15, 24, 4],
            [22, 23, 5],
            [18, 17, 4],
            [12, 15, 2.5],
            [24, 14, 3],
        ],
        { borda: "r", luz: "s", base: "S" },
    );
    // os olhos ficam boiando na fumaça
    q[7][16][14] = "w";
    q[7][16][17] = "w";

    for (let i = 0; i < 4; i++) q[8 + i] = deslocar(quadroAlma(i), 0, [0, -1, -1, 0][i]);
    q[12] = quadroAlma(0, { cx: 14, cy: 13, angulo: -0.6, estica: 1.15, boca: true });
    q[13] = quadroAlma(2, { cx: 13, cy: 15, angulo: -0.75, estica: 1.25, boca: true });
    // riscos de velocidade no mergulho
    for (const [x, y] of [
        [27, 6],
        [28, 7],
        [24, 3],
        [29, 10],
    ]) {
        q[12][y][x] = "R";
        q[13][y + 1][x] = "R";
    }
    q[14] = silhueta(quadroAlma(1), "W", "o");
    q[15] = quadroFumaca(
        quadroAlma(1),
        [
            [12, 13, 4.5],
            [19, 11, 3.5],
            [15, 6, 3],
            [24, 9, 2.5],
        ],
        { borda: "r", luz: "s", base: "S" },
    );
    q[15][12][9] = "w";
    q[15][12][12] = "w";

    const PASSOS = [2, 0, -2, 0];
    for (let i = 0; i < 4; i++) {
        q[16 + i] = quadroPirata({ passo: PASSOS[i], levanta: i % 2 === 1, bob: i % 2, aba: [0, 1, 0, -1][i] });
    }
    q[20] = quadroPirata({ braco: "ergue", aba: 1 });
    q[21] = quadroPirata({ braco: "golpe", passo: 2, aba: 2 });
    q[22] = silhueta(quadroPirata({}), "W", "o");
    // morte: o fantasma se desfaz de baixo para cima e o chapéu cai
    {
        const base = quadroPirata({ passo: 1 });
        const sumido = base.map((l, y) =>
            l.map((c, x) => (c !== "." && BAYER4[y & 3][x & 3] < Math.max(0, 0.75 - (y - 4) / 26) ? c : ".")),
        );
        q[23] = deslocar(sumido, 0, -2);
        for (const [x, y] of [
            [12, 25],
            [17, 23],
            [20, 27],
            [10, 21],
        ]) {
            q[23][y][x] = "a";
        }
    }
    // v3: lápide em 24 e 25, vampiro em 32 a 39
    q[24] = quadroLapide(false);
    q[25] = quadroLapide(true);
    quadrosDoVampiro().forEach((v, i) => {
        q[32 + i] = v;
    });
    return q;
}

function gerarInimigos(estilo) {
    const tons = { ...TONS_INIMIGOS };
    const img = folha(quadrosDosInimigos(), QI, 8, 256, 160, tons, estilo);
    img.salvar(`${IMG}/inimigos-${estilo}.png`);
    previaDupla(img, 4, QI, QI, estilo, 24).salvar(`${PREVIAS}/previa-inimigos-${estilo}.png`);
}

// ===========================================================================
// NAVIO: o Holandês Voador (3 quadros de 192×160)
// ===========================================================================
const NL = 192;
const NA = 160;
export const LANTERNAS_DO_NAVIO = [
    [48, 30],
    [100, 14],
    [150, 34],
];
export const LINHA_DAGUA = 140;

const TONS_NAVIO = {
    o: P.contorno,
    H: P.sombra, // casco
    h: P.pedraEscura, // casco iluminado, tábuas
    j: P.pedra, // amurada e quinas de cima
    g: P.fantasma, // brilho fantasma
    G: P.fantasmaClaro,
    n: [P.fantasma, 120], // névoa na linha d'água
    N: [P.fantasmaClaro, 90],
    c: P.pedra, // vela
    C: P.pedraClara, // vela iluminada
    d: P.pedraEscura, // dobra da vela
    m: P.madeiraEscura, // mastro e vergas
    M: P.madeira,
    r: P.sombra, // cordas
    z: P.metal,
    w: P.olho, // caveira da bandeira
    a: [P.sombra, 150], // casco embaixo d'água
};

function desenharNavio(avaria) {
    const q = vazio(NL, NA);
    const sorte = criarAleatorio(4242);
    const pinta = (x, y, c) => {
        if (x >= 0 && y >= 0 && x < NL && y < NA) q[y][x] = c;
    };
    const ler = (x, y) => (x >= 0 && y >= 0 && x < NL && y < NA ? q[y][x] : ".");

    // ---- cordas (atrás de tudo) ----
    const cordas = [
        [48, 36, 3, 77],
        [100, 20, 50, 36],
        [150, 40, 102, 20],
        [150, 40, 186, 76],
        [48, 40, 30, 94],
        [48, 40, 66, 96],
        [100, 22, 78, 96],
        [100, 22, 124, 96],
        [150, 42, 138, 82],
        [150, 42, 166, 80],
    ];
    cordas.forEach(([x0, y0, x1, y1], k) => {
        // na avaria forte algumas cordas arrebentaram
        if (avaria === 2 && (k === 1 || k === 6)) return;
        const m = linha(mascaraVazia(NL, NA), x0, y0, x1, y1, 1);
        for (let y = 0; y < NA; y++) for (let x = 0; x < NL; x++) if (m[y][x]) q[y][x] = "r";
    });

    // ---- velas: retângulos estufados com a barra de baixo rasgada ----
    // [mastro x, y de cima, y de baixo, meia largura em cima, meia largura embaixo, rasgada embaixo]
    const velas = [
        [48, 44, 63, 15, 17, false],
        [48, 66, 88, 18, 19, true],
        [100, 26, 47, 18, 21, false],
        [100, 50, 80, 23, 24, true],
        [150, 48, 63, 13, 15, false],
        [150, 66, 79, 16, 16, true],
    ];
    // furos: [vela, cx, cy, raio, avaria mínima]
    const furos = [];
    velas.forEach((v, k) => {
        const [mx, y0, y1, l0, l1] = v;
        for (let n = 0; n < 9; n++) {
            const cx = mx - l1 + 3 + sorte() * (l0 + l1 - 6);
            const cy = y0 + 3 + sorte() * (y1 - y0 - 5);
            const r = 1.2 + sorte() * 2.6;
            furos.push([k, cx, cy, r, n < 2 ? 0 : n < 5 ? 1 : 2]);
        }
    });
    velas.forEach(([mx, y0, y1, l0, l1, rasgada], k) => {
        const m = mascaraVazia(NL, NA);
        for (let y = y0; y <= y1; y++) {
            const t = (y - y0) / (y1 - y0);
            // a vela estufa para a esquerda (vento de popa)
            const estufa = Math.round(Math.sin(t * Math.PI) * 3);
            const meia = Math.round(l0 + (l1 - l0) * t);
            for (let x = mx - meia - estufa; x <= mx + meia - Math.round(estufa / 2); x++) marcar(m, x, y);
        }
        // barra rasgada: tiras de comprimento sorteado
        if (rasgada) {
            for (let x = mx - l1 - 3; x <= mx + l1 + 1; x++) {
                const corte = Math.floor(sorte() * (6 + avaria * 4));
                for (let y = y1 - corte; y <= y1; y++) marcar(m, x, y, false);
            }
        }
        // furos (crescem com a avaria)
        for (const [vk, cx, cy, r, min] of furos) {
            if (vk !== k || avaria < min) continue;
            elipse(m, cx, cy, r + avaria * 0.6, (r + avaria * 0.6) * 0.8, false);
        }
        // na avaria forte, a vela grande de baixo do mastro da frente quase some
        if (avaria === 2 && k === 1) {
            for (let y = y0 + 4; y <= y1; y++) for (let x = 0; x < NL; x++) if ((x >> 2) % 2 === 0) m[y][x] = false;
        }
        for (let y = 0; y < NA; y++) {
            for (let x = 0; x < NL; x++) {
                if (!m[y][x]) continue;
                let c = "c";
                // dobras verticais
                if ((x - mx + 40) % 7 === 0) c = "d";
                if (!dentro(m, x - 1, y) || !dentro(m, x, y - 1)) c = "C";
                // borda rasgada ou furada: brilho fantasma
                const borda = !dentro(m, x + 1, y) || !dentro(m, x, y + 1) || !dentro(m, x - 1, y) || !dentro(m, x, y - 1);
                const rasgo = borda && y > y0 + 1 && (y >= y1 - 8 || [[x - 1, y], [x + 1, y], [x, y + 1], [x, y - 1]].some(([a, b]) => b > y0 && b < y1 && !dentro(m, a, b) && a > mx - l1 - 2 && a < mx + l1));
                if (rasgo) c = "g";
                q[y][x] = c;
            }
        }
        contornar(q, m, "o", { sobre: false });
    });
    // vela de proa (bujarrona), triangular
    {
        const m = mascaraVazia(NL, NA);
        poligono(m, avaria === 2 ? [[10, 79], [44, 44], [34, 72]] : [[8, 79], [45, 40], [42, 90]]);
        if (avaria >= 1) elipse(m, 30, 66, 4, 3, false);
        for (let y = 0; y < NA; y++) {
            for (let x = 0; x < NL; x++) {
                if (!m[y][x]) continue;
                const borda = !dentro(m, x + 1, y) || !dentro(m, x, y + 1);
                q[y][x] = !dentro(m, x - 1, y) || !dentro(m, x, y - 1) ? "C" : borda ? "g" : "c";
            }
        }
        contornar(q, m, "o", { sobre: false });
    }

    // ---- mastros e vergas ----
    const mastros = [
        [48, 34, 97],
        [100, 18, 97],
        [150, 38, 82],
    ];
    for (const [x, topo, base] of mastros) {
        for (let y = topo; y <= base; y++) {
            pinta(x - 2, y, "o");
            pinta(x - 1, y, "M");
            pinta(x, y, "m");
            pinta(x + 1, y, "m");
            pinta(x + 2, y, "o");
        }
    }
    // cesto da gávea no mastro grande
    for (let x = 95; x <= 105; x++) {
        pinta(x, 38, "o");
        pinta(x, 39, x < 99 ? "M" : "m");
        pinta(x, 40, "m");
        pinta(x, 41, "o");
    }
    // vergas: [x, y, meia largura, quebrada a partir da avaria]
    const vergas = [
        [48, 43, 17, 9],
        [48, 65, 20, 9],
        [100, 25, 20, 1],
        [100, 49, 25, 9],
        [150, 47, 15, 9],
        [150, 65, 18, 2],
    ];
    for (const [x, y, l, quebra] of vergas) {
        const m = mascaraVazia(NL, NA);
        if (avaria >= quebra) {
            // verga partida: um lado caído na diagonal
            linha(m, x - l, y, x, y, 2);
            linha(m, x, y, x + l - 4, y + 10, 2);
        } else {
            linha(m, x - l, y, x + l, y, 2);
        }
        for (let yy = 0; yy < NA; yy++) for (let xx = 0; xx < NL; xx++) if (m[yy][xx]) q[yy][xx] = dentro(m, xx, yy - 1) ? "m" : "M";
        contornar(q, m, "o");
    }

    // ---- gurupés ----
    {
        const m = mascaraVazia(NL, NA);
        if (avaria === 2) linha(m, 22, 88, 10, 80, 2);
        else linha(m, 22, 88, 1, 74, 2);
        for (let y = 0; y < NA; y++) for (let x = 0; x < NL; x++) if (m[y][x]) q[y][x] = dentro(m, x, y - 1) ? "m" : "M";
        contornar(q, m, "o");
    }

    // ---- casco ----
    const casco = mascaraVazia(NL, NA);
    poligono(casco, [
        [6, 84],
        [14, 89],
        [26, 95],
        [44, 98],
        [142, 98],
        [146, 88],
        [152, 83],
        [184, 79],
        [191, 78],
        [190, 92],
        [187, 116],
        [179, 131],
        [161, 141],
        [122, 146],
        [56, 146],
        [36, 139],
        [22, 122],
        [12, 102],
    ]);
    // rombos no casco (avaria)
    const rombos = [
        [78, 116, 6, 5, 1],
        [126, 108, 5, 4, 2],
        [163, 104, 4, 5, 2],
    ];
    const buracos = mascaraVazia(NL, NA);
    for (const [cx, cy, rx, ry, min] of rombos) {
        if (avaria < min) continue;
        formaPorFuncao(buracos, (x, y) => {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            // borda irregular (lascas de madeira)
            return d <= 1 + 0.35 * Math.sin(x * 2.1 + y * 1.3);
        });
    }
    for (let y = 0; y < NA; y++) {
        for (let x = 0; x < NL; x++) {
            if (!casco[y][x]) continue;
            let c = "H";
            // tábuas: uma linha escura a cada 6 px, com a de cima clara
            const fase = (y - 98) % 6;
            if (fase === 0) c = "o";
            else if (fase === 1) c = "h";
            // emendas das tábuas
            if (fase > 1 && (x * 7 + Math.floor((y - 98) / 6) * 23) % 37 === 0) c = "o";
            // luz de cima: a faixa alta do casco é mais clara
            if (!dentro(casco, x, y - 1) || !dentro(casco, x, y - 2)) c = "j";
            // brilho fantasma subindo da água, em pontilhado
            const t = (y - 118) / 24;
            if (c === "H" && t > 0 && BAYER4[y & 3][x & 3] < t * 0.7) c = "g";
            if (y > LINHA_DAGUA) c = BAYER4[y & 3][x & 3] < 0.5 ? "a" : ".";
            q[y][x] = c;
        }
    }
    contornar(q, casco, "o", { diagonais: true });
    // apaga o contorno abaixo da linha d'água (o casco some na água)
    for (let y = LINHA_DAGUA + 1; y < NA; y++) for (let x = 0; x < NL; x++) if (q[y][x] === "o") q[y][x] = "a";
    // rombos: buraco escuro com brilho fantasma lá dentro e lascas claras na borda
    for (let y = 0; y < NA; y++) {
        for (let x = 0; x < NL; x++) {
            if (!buracos[y][x] || !casco[y][x]) continue;
            const borda = !dentro(buracos, x - 1, y) || !dentro(buracos, x + 1, y) || !dentro(buracos, x, y - 1) || !dentro(buracos, x, y + 1);
            q[y][x] = borda ? "o" : BAYER4[y & 3][x & 3] < 0.35 ? "G" : BAYER4[y & 3][x & 3] < 0.7 ? "g" : "o";
        }
    }
    // amurada com balaústres no convés e no castelo de popa
    const amurada = (x0, x1, yBase, quebrada) => {
        for (let x = x0; x <= x1; x++) {
            if (quebrada && x > quebrada[0] && x < quebrada[1]) continue;
            pinta(x, yBase - 5, "o");
            pinta(x, yBase - 4, "j");
            if ((x - x0) % 4 === 0) {
                pinta(x, yBase - 3, "m");
                pinta(x, yBase - 2, "m");
                pinta(x, yBase - 1, "m");
            }
        }
    };
    amurada(30, 140, 97, avaria >= 1 ? [62, 78] : null);
    amurada(152, 189, 79, avaria >= 2 ? [166, 176] : null);
    // portinholas com brilho fantasma, e canhões
    for (let k = 0; k < 6; k++) {
        const px = 44 + k * 17;
        const py = 106;
        for (let y = py; y < py + 5; y++) {
            for (let x = px; x < px + 6; x++) {
                const borda = y === py || y === py + 4 || x === px || x === px + 5;
                const atual = ler(x, y);
                if (atual === "." || atual === "a") continue;
                pinta(x, y, borda ? "o" : y === py + 1 ? "G" : "g");
            }
        }
        if (k % 2 === 0) {
            // boca do canhão para fora
            pinta(px + 2, py + 2, "o");
            pinta(px + 3, py + 2, "o");
            pinta(px + 2, py + 3, "z");
            pinta(px + 3, py + 3, "z");
        }
    }
    // janelas da popa
    for (let k = 0; k < 3; k++) {
        const jx = 160 + k * 9;
        for (let y = 85; y <= 91; y++) {
            for (let x = jx; x <= jx + 5; x++) {
                const borda = y === 85 || y === 91 || x === jx || x === jx + 5;
                pinta(x, y, borda ? "o" : y < 88 ? "G" : "g");
            }
        }
        pinta(jx + 2, 88, "o");
        pinta(jx + 3, 88, "o");
    }
    // nome/friso dourado-fantasma ao longo do casco
    for (let x = 30; x <= 182; x++) if (ler(x, 101) === "H" || ler(x, 101) === "h") pinta(x, 101, "g");

    // ---- bandeira de caveira no mastro da popa ----
    {
        for (let y = 56; y <= 79; y++) {
            pinta(181, y, "m");
            pinta(180, y, "o");
            pinta(182, y, "o");
        }
        pinta(181, 55, "o");
        const m = mascaraVazia(NL, NA);
        for (let x = 183; x <= 191; x++) {
            const onda = Math.round(Math.sin(x * 0.7) * 1);
            const comprimento = avaria === 2 ? 4 : 8;
            for (let y = 57 + onda; y <= 57 + onda + comprimento - ((x * 5) % 3); y++) marcar(m, x, y);
        }
        for (let y = 0; y < NA; y++) for (let x = 0; x < NL; x++) if (m[y][x]) q[y][x] = "H";
        contornar(q, m, "o", { sobre: false });
        if (avaria < 2) {
            pinta(186, 59, "w");
            pinta(187, 59, "w");
            pinta(186, 60, "w");
            pinta(187, 60, "w");
            pinta(185, 62, "w");
            pinta(188, 62, "w");
        }
    }

    // ---- lanternas verdes no alto dos mastros (o ponto fraco) ----
    const LANTERNA = linhas(
        `
..o..
.ooo.
ozzzo
ogGgo
oGGGo
ogGgo
ozzzo
.ooo.
`,
        5,
    );
    for (const [lx, ly] of LANTERNAS_DO_NAVIO) sobrepor(q, LANTERNA, lx - 2, ly - 4);

    // ---- fogo fantasma saindo dos rombos ----
    if (avaria >= 1) {
        for (const [cx, cy, , ry, min] of rombos) {
            if (avaria < min) continue;
            for (let k = -2; k <= 2; k++) {
                const altura = 5 + ((k * 7 + cx) % 4) + avaria * 2;
                for (let d = 1; d <= altura; d++) {
                    const x = cx + k + Math.round(Math.sin(d * 0.9 + k) * 0.8);
                    const y = cy - ry - d;
                    if (BAYER4[y & 3][x & 3] < 1 - d / (altura + 1)) pinta(x, y, d < altura / 2 ? "G" : "g");
                }
            }
        }
    }

    // ---- névoa fantasma na linha d'água ----
    for (let x = 0; x < NL; x++) {
        const altura = 2 + Math.round(1.5 + 1.5 * Math.sin(x * 0.21) + Math.sin(x * 0.53));
        for (let y = LINHA_DAGUA - altura; y <= LINHA_DAGUA + 3; y++) {
            const longe = Math.abs(y - LINHA_DAGUA) / (altura + 1);
            if (BAYER4[y & 3][x & 3] > 0.75 - longe * 0.5) continue;
            if (q[y][x] === "." || q[y][x] === "a" || y >= LINHA_DAGUA - 1) q[y][x] = y === LINHA_DAGUA ? "N" : "n";
        }
    }
    return q;
}

function gerarNavio(estilo) {
    const tons = { ...TONS_NAVIO };
    const quadros = [0, 1, 2].map((a) => desenharNavio(a));
    const img = folha(quadros, NL, 3, 576, 160, tons, estilo, NA);
    img.salvar(`${IMG}/navio-${estilo}.png`);
    previaDupla(img, 2, NL, NA, estilo).salvar(`${PREVIAS}/previa-navio-${estilo}.png`);
}

// ===========================================================================
// ITENS (ícones 16×16) e INTERFACE (painel 9-slice e botão)
// ===========================================================================
const QT = 16;

const TONS_ITENS = {
    o: P.contorno,
    h: P.brilhoFrio,
    "1": P.pedraEscura,
    "2": P.pedra,
    "3": P.pedraClara,
    s: P.sombra,
    M: P.madeira,
    m: P.madeiraEscura,
    L: P.areia, // madeira clara, corda
    l: P.areiaEscura,
    z: P.metal,
    R: P.capa, // coração
    r: P.madeira, // sombra do coração
    K: P.pele, // brilho do coração
    q: P.pedra, // borda de dentro do coração vazio
    e: P.fogoEscuro,
    f: P.fogo,
    F: P.fogoClaro,
    v: P.espuma, // vidro
    a: P.agua,
    w: P.olho, // branco (relógio, caveira, brilho)
    x: P.capa, // X de aviso
    X: P.fogo,
};

// forma em máscara -> letras com luz de cima e da esquerda, contorno fechado
function icone(q, m, tons, contorno = true) {
    return parte(q, m, tons, { contorno });
}

const CORACAO = linhas(
    `
................
................
................
...ooo....ooo...
..oKwRo..oRRro..
.oKKRRRooRRRRro.
.oKRRRRRRRRRrro.
.oRRRRRRRRRRrro.
..oRRRRRRRRrro..
...oRRRRRRrro...
....oRRRRrro....
.....oRRrro.....
......oRro......
.......oo.......
................
................
`,
    QT,
);

const BATERIA = linhas(
    `
................
................
................
................
.ooooooooooooo..
.ohhhhhhhhhhzo..
.ohFFoFFoFFozoo.
.ohffoffoffozzzo
.ohffoffoffozzzo
.oheeoeeoeeozoo.
.ozzzzzzzzzzzo..
.ooooooooooooo..
................
................
................
................
`,
    QT,
);

const CAVEIRA = linhas(
    `
................
................
....oooooooo....
...owwwwwwwwo...
..owwwwwwwww3o..
..owwwwwwwww3o..
..owooowwooo3o..
..owooowwooo3o..
..owwwwoowww3o..
...owwwwwww3o...
....owowowowo...
....ooooooooo...
................
................
................
................
`,
    QT,
);

function quadrosDosItens() {
    const q = [];
    const novo = () => vazio(QT, QT);
    const mad = { borda: "L", luz: "L", base: "M", escuro: "m" };
    const metal = { borda: "h", luz: "z", base: "z", escuro: "2" };

    // 0 tábua inclinada, com veios e um prego
    {
        const g = novo();
        const m = poligono(mascaraVazia(QT, QT), [
            [1, 11],
            [12, 3],
            [15, 6.5],
            [3.5, 14.5],
        ]);
        icone(g, m, mad);
        linha(m, 4, 11, 12, 5, 1);
        for (const [x, y] of [
            [5, 11],
            [6, 10],
            [9, 8],
            [10, 7],
        ]) {
            g[y][x] = "m";
        }
        g[6][13] = "h";
        g[12][4] = "h";
        q[0] = g;
    }
    // 1 pedra lapidada (bloco com três faces)
    {
        const g = novo();
        const topo = poligono(mascaraVazia(QT, QT), [
            [2, 6],
            [8, 3],
            [14.5, 5.5],
            [8.5, 8.5],
        ]);
        const esq = poligono(mascaraVazia(QT, QT), [
            [2, 6],
            [8.5, 8.5],
            [8.5, 14.5],
            [2, 12],
        ]);
        const dir = poligono(mascaraVazia(QT, QT), [
            [8.5, 8.5],
            [14.5, 5.5],
            [14.5, 11.5],
            [8.5, 14.5],
        ]);
        const tudo = mascaraVazia(QT, QT);
        for (const m of [topo, esq, dir]) for (let y = 0; y < QT; y++) for (let x = 0; x < QT; x++) if (m[y][x]) tudo[y][x] = true;
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                if (topo[y][x]) g[y][x] = "3";
                else if (esq[y][x]) g[y][x] = "2";
                else if (dir[y][x]) g[y][x] = "1";
            }
        }
        contornar(g, tudo, "o");
        // aresta clara e marcas de cinzel
        for (let y = 9; y <= 13; y++) g[y][8] = "h";
        g[5][7] = "h";
        g[5][8] = "h";
        g[10][4] = "1";
        g[11][5] = "1";
        g[8][12] = "o";
        q[1] = g;
    }
    // 2 barra de ferro (lingote)
    {
        const g = novo();
        const frente = poligono(mascaraVazia(QT, QT), [
            [1.5, 12.5],
            [3.5, 8],
            [12.5, 8],
            [14.5, 12.5],
        ]);
        const topo = poligono(mascaraVazia(QT, QT), [
            [3.5, 8],
            [5.5, 5],
            [14.5, 5],
            [12.5, 8],
        ]);
        const lado = poligono(mascaraVazia(QT, QT), [
            [12.5, 8],
            [14.5, 5],
            [14.5, 12.5],
        ]);
        const tudo = mascaraVazia(QT, QT);
        for (const m of [frente, topo, lado]) for (let y = 0; y < QT; y++) for (let x = 0; x < QT; x++) if (m[y][x]) tudo[y][x] = true;
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                if (topo[y][x]) g[y][x] = "h";
                else if (lado[y][x]) g[y][x] = "1";
                else if (frente[y][x]) g[y][x] = y === 8 ? "3" : "z";
            }
        }
        contornar(g, tudo, "o");
        g[10][5] = "3";
        g[10][6] = "3";
        q[2] = g;
    }
    // 3 rolo de corda
    {
        const g = novo();
        const m = elipse(mascaraVazia(QT, QT), 7.5, 8, 6, 5.2);
        elipse(m, 7.5, 8, 1.8, 1.4, false);
        // ponta solta
        linha(m, 12, 11, 14, 14, 1);
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                if (!m[y][x]) continue;
                const d = Math.hypot((x + 0.5 - 8) / 1.15, y + 0.5 - 8.5);
                // voltas da corda: anéis claros e escuros, torcidos na diagonal
                let c = Math.floor(d) % 2 === 0 ? "L" : "l";
                if ((x + y) % 3 === 0 && c === "L") c = "l";
                if (y < 6 && c === "L" && x < 9) c = "h";
                g[y][x] = c;
            }
        }
        contornar(g, m, "o");
        q[3] = g;
    }
    // 4 engrenagem
    {
        const g = novo();
        const m = formaPorFuncao(mascaraVazia(QT, QT), (x, y) => {
            const dx = x - 8;
            const dy = y - 8;
            const r = Math.hypot(dx, dy);
            const ang = Math.atan2(dy, dx);
            const dente = Math.cos(ang * 8) > 0.35;
            return r <= 4.9 || (dente && r <= 7.1);
        });
        elipse(m, 7.5, 7.5, 1.7, 1.7, false);
        icone(g, m, metal);
        // anel em volta do furo
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
                if (m[y][x] && r > 2.2 && r < 3.3) g[y][x] = x + y < 15 ? "3" : "2";
            }
        }
        contornar(g, elipse(mascaraVazia(QT, QT), 7.5, 7.5, 1.7, 1.7), "o", { sobre: true });
        for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) if (Math.hypot(x - 7.5, y - 7.5) < 1.5) g[y][x] = ".";
        q[4] = g;
    }
    // 5 lente do farol (Fresnel): vidro com anéis e aro de latão
    {
        const g = novo();
        const m = elipse(mascaraVazia(QT, QT), 7.5, 7.5, 7, 7);
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                if (!m[y][x]) continue;
                const r = Math.hypot(x - 7.5, y - 7.5);
                let c = "v";
                if (r > 5.6) c = x + y < 15 ? "F" : "e";
                else if (r > 4.8) c = "f";
                else if (Math.abs(r - 3.2) < 0.55 || Math.abs(r - 1.4) < 0.5) c = "a";
                g[y][x] = c;
            }
        }
        contornar(g, m, "o");
        g[4][5] = "w";
        g[5][4] = "w";
        g[4][4] = "w";
        g[10][10] = "w";
        q[5] = g;
    }
    // 6 e 7 baú fechado e aberto
    const bau = (aberto) => {
        const g = novo();
        const corpo = mascaraVazia(QT, QT);
        for (let y = 8; y <= 13; y++) for (let x = 1; x <= 14; x++) corpo[y][x] = true;
        const tampa = mascaraVazia(QT, QT);
        if (aberto) {
            // tampa aberta para trás, vista por dentro
            for (let y = 2; y <= 6; y++) for (let x = 2 + (6 - y > 2 ? 1 : 0); x <= 13 - (6 - y > 2 ? 1 : 0); x++) tampa[y][x] = true;
        } else {
            for (let y = 4; y <= 7; y++) for (let x = 1; x <= 14; x++) tampa[y][x] = !(y === 4 && (x === 1 || x === 14));
        }
        if (aberto) {
            for (let y = 0; y < QT; y++) for (let x = 0; x < QT; x++) if (tampa[y][x]) g[y][x] = y === 2 ? "m" : "s";
            contornar(g, tampa, "o");
            // tesouro brilhando dentro
            const ouro = elipse(mascaraVazia(QT, QT), 7.5, 8, 5.5, 2.2);
            for (let y = 0; y < QT; y++) for (let x = 0; x < QT; x++) if (ouro[y][x]) g[y][x] = (x + y) % 3 === 0 ? "F" : "f";
            contornar(g, ouro, "o", { sobre: false });
            g[6][5] = "w";
            g[5][10] = "F";
            g[3][8] = "F";
        } else {
            icone(g, tampa, mad);
            for (let x = 2; x <= 13; x++) g[7][x] = "m";
        }
        const corpoTons = { borda: "M", luz: "M", base: "M", escuro: "m" };
        for (let y = 0; y < QT; y++) for (let x = 0; x < QT; x++) if (corpo[y][x]) g[y][x] = "M";
        parte(g, corpo, corpoTons);
        // tábuas e cintas de metal
        for (let x = 2; x <= 13; x++) g[11][x] = "m";
        for (const x of [3, 12]) {
            for (let y = aberto ? 8 : 4; y <= 13; y++) g[y][x] = y === (aberto ? 8 : 4) ? "h" : "z";
        }
        // fechadura
        g[8][7] = "f";
        g[8][8] = "f";
        g[9][7] = "F";
        g[9][8] = "e";
        g[10][7] = "o";
        if (!aberto) {
            g[7][7] = "f";
            g[7][8] = "f";
        }
        return g;
    };
    q[6] = bau(false);
    q[7] = bau(true);
    // 8 e 9 corações
    q[8] = copiar(CORACAO);
    {
        const g = copiar(CORACAO);
        const m = mascaraDe(CORACAO, "o");
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                if (!m[y][x]) continue;
                const naBorda = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !dentro(m, x + dx, y + dy));
                g[y][x] = naBorda ? "q" : "s";
            }
        }
        q[9] = g;
    }
    // 10 bateria
    q[10] = copiar(BATERIA);
    // 11 relógio de bolso
    {
        const g = novo();
        const m = elipse(mascaraVazia(QT, QT), 7.5, 8.5, 6, 6);
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                if (!m[y][x]) continue;
                const r = Math.hypot(x - 7.5, y - 8.5);
                g[y][x] = r > 4.6 ? (x + y < 16 ? "F" : "e") : r > 3.9 ? "f" : "w";
            }
        }
        contornar(g, m, "o");
        // coroa e argola
        g[1][7] = "o";
        g[1][8] = "o";
        g[0][7] = "o";
        g[2][7] = "f";
        g[2][8] = "e";
        g[1][6] = "o";
        g[1][9] = "o";
        // ponteiros (10h10) e marcas
        g[8][7] = "o";
        g[7][7] = "o";
        g[6][7] = "o";
        g[8][8] = "o";
        g[7][9] = "o";
        g[8][5] = "q";
        g[5][8] = "q";
        g[11][8] = "q";
        g[8][11] = "q";
        q[11] = g;
    }
    // 12 bala de canhão
    {
        const g = novo();
        const m = elipse(mascaraVazia(QT, QT), 7.5, 8.5, 5.6, 5.6);
        for (let y = 0; y < QT; y++) {
            for (let x = 0; x < QT; x++) {
                if (!m[y][x]) continue;
                const d = Math.hypot(x - 5.5, y - 6.5);
                g[y][x] = d < 1.3 ? "h" : d < 3.4 ? "2" : d < 6 ? "1" : "s";
            }
        }
        contornar(g, m, "o");
        q[12] = g;
    }
    // 13 X de aviso
    {
        const g = novo();
        const m = mascaraVazia(QT, QT);
        linha(m, 3, 3, 12, 12, 3);
        linha(m, 12, 3, 3, 12, 3);
        icone(g, m, { borda: "X", luz: "x", base: "x", escuro: "x" });
        q[13] = g;
    }
    // 14 lua crescente
    {
        const g = novo();
        const m = formaPorFuncao(mascaraVazia(QT, QT), (x, y) => Math.hypot(x - 8, y - 8) <= 6.3 && Math.hypot(x - 10.8, y - 6) > 5.2);
        for (let y = 0; y < QT; y++) for (let x = 0; x < QT; x++) if (m[y][x]) g[y][x] = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) > 5.2 ? "w" : "h";
        contornar(g, m, "o");
        q[14] = g;
    }
    // 15 caveira
    q[15] = copiar(CAVEIRA);
    return q;
}

// painel 9-slice 48×48 (bordas de 16): moldura de madeira com cantoneiras de ferro
function desenharPainel() {
    const L = 48;
    const g = vazio(L, L);
    for (let y = 0; y < L; y++) {
        for (let x = 0; x < L; x++) {
            const d = Math.min(x, y, L - 1 - x, L - 1 - y); // distância até a borda
            let c;
            if (d === 0) c = "o";
            else if (d <= 5) {
                // madeira: veios ao longo da moldura, luz em cima e à esquerda
                const emCima = y === d || x === d;
                const doLado = d === x || d === L - 1 - x;
                const veio = (doLado ? x : y) % 3 === 0 && d === 3;
                c = emCima && d === 1 ? "L" : d === 5 ? "m" : veio ? "m" : "M";
                if ((y === L - 1 - d || x === L - 1 - d) && d === 1) c = "m";
            } else if (d === 6) c = "o";
            else if (d === 7) c = "z"; // filete de ferro escuro
            else if (d === 8) c = "o";
            else c = d === 9 ? "k" : "s"; // miolo, com sombra da moldura
            g[y][x] = c;
        }
    }
    // cantoneiras de ferro com rebites
    const canto = linhas(
        `
oooooooooo
ohhhhhhzzo
ohzzzzzzo.
ohzhzzoo..
ohzzzo....
ohzzo.....
ohzo......
ozo.......
oo........
o.........
`,
        10,
    );
    const cantos = [
        [canto, 0, 0],
        [espelharLetras(canto), L - 10, 0],
        [canto.slice().reverse(), 0, L - 10],
        [espelharLetras(canto.slice().reverse()), L - 10, L - 10],
    ];
    for (const [c, x, y] of cantos) sobrepor(g, c, x, y);
    return g;
}

function espelharLetras(letras) {
    return letras.map((l) => [...l].reverse());
}

// botão 96×24: placa de madeira; selecionado = aro aceso e chamas nas pontas
function desenharBotao(selecionado) {
    const LB = 96;
    const AB = 24;
    const g = vazio(LB, AB);
    const m = mascaraVazia(LB, AB);
    for (let y = 2; y <= 21; y++) {
        for (let x = 2; x <= 93; x++) {
            // quinas cortadas
            const quina = (x === 2 || x === 93) && (y === 2 || y === 21);
            if (!quina) m[y][x] = true;
        }
    }
    for (let y = 0; y < AB; y++) {
        for (let x = 0; x < LB; x++) {
            if (!m[y][x]) continue;
            let c = "M";
            if (y === 3 || (y === 2 && m[y][x])) c = "L";
            if (y >= 19) c = "m";
            if (x === 2 || (x === 3 && y > 2 && y < 19)) c = y < 19 ? "L" : "m";
            if (x === 93) c = "m";
            // veios horizontais curtos, longe do meio onde vai o texto
            if ((y === 7 && (x < 20 || x > 78) && x % 9 !== 0) || (y === 15 && (x < 14 || x > 84))) c = "m";
            // emenda entre duas tábuas
            if (y === 11 && (x < 8 || x > 88)) c = "m";
            g[y][x] = c;
        }
    }
    contornar(g, m, "o", { diagonais: true });
    if (selecionado) {
        // aro de luz quente em volta
        const aro = mascaraVazia(LB, AB);
        for (let y = 0; y < AB; y++) for (let x = 0; x < LB; x++) if (g[y][x] !== ".") aro[y][x] = true;
        contornar(g, aro, "f", { sobre: false });
        // luz da lanterna na madeira, de cima
        for (let x = 4; x <= 91; x++) g[3][x] = "F";
        for (let x = 3; x <= 92; x++) if (g[2][x] === "L") g[2][x] = "F";
        // chamas nas pontas no lugar dos pregos
        for (const cx of [7, 88]) {
            sobrepor(
                g,
                linhas(
                    `
.f.
fFf
fFf
.e.
`,
                    3,
                ),
                cx - 1,
                9,
            );
        }
    } else {
        // pregos
        for (const [x, y] of [
            [6, 6],
            [6, 17],
            [89, 6],
            [89, 17],
        ]) {
            g[y][x] = "z";
            g[y - 1][x] = "h";
        }
    }
    return g;
}

const TONS_UI = {
    o: P.contorno,
    k: P.contorno,
    s: P.sombra,
    M: P.madeira,
    m: P.madeiraEscura,
    L: P.areiaEscura, // madeira iluminada
    z: P.metal,
    h: P.brilhoFrio,
    f: P.fogo,
    F: P.fogoClaro,
    e: P.fogoEscuro,
};

function gerarItensEInterface(estilo) {
    const tonsItens = { ...TONS_ITENS };
    const itens = folha(quadrosDosItens(), QT, 8, 128, 32, tonsItens, estilo);
    itens.salvar(`${IMG}/itens-${estilo}.png`);
    previaDupla(itens, 4, QT, QT, estilo).salvar(`${PREVIAS}/previa-itens-${estilo}.png`);

    const tonsUi = { ...TONS_UI };
    const painel = letrasParaImagem(desenharPainel(), tonsUi, estilo);
    painel.salvar(`${IMG}/painel-${estilo}.png`);
    const botaoGrade = vazio(96, 48);
    sobrepor(botaoGrade, desenharBotao(false), 0, 0);
    sobrepor(botaoGrade, desenharBotao(true), 0, 24);
    const botao = letrasParaImagem(botaoGrade, tonsUi, estilo);
    botao.salvar(`${IMG}/botao-${estilo}.png`);

    // prévia: painel esticado para 200×120 por 9-slice, com os dois botões dentro, em 2×
    const esticado = esticar9(painel, 200, 120, 16);
    const cena = new Imagem(220, 140);
    fundoCeu(cena, 0, 0, 220, 140, estilo);
    // o jogo aplica transparência no painel; aqui ele vai opaco para revisar a moldura
    colarMisturando(cena, esticado, 10, 10);
    colarMisturando(cena, recortar(botao, 0, 0, 96, 24), 62, 38);
    colarMisturando(cena, recortar(botao, 0, 24, 96, 24), 62, 72);
    const escala = 2;
    const previa = new Imagem(cena.largura * escala + 16 + 96 * escala + 16, cena.altura * escala + 16);
    caixa(previa, 0, 0, previa.largura, previa.altura, "#202020");
    colarMisturando(previa, cena, 8, 8, escala);
    // o painel original (48×48) e os dois quadros do botão, ao lado
    const lado = 8 + cena.largura * escala + 16;
    fundoEscuro(previa, lado, 8, 96 * escala, 48 * escala + 4 + 48 * escala, estilo);
    colarMisturando(previa, painel, lado, 8, escala);
    colarMisturando(previa, botao, lado, 8 + 48 * escala + 4, escala);
    previa.salvar(`${PREVIAS}/previa-ui-${estilo}.png`);
}

// ===========================================================================
// Montagem e prévias
// ===========================================================================
function folha(quadros, lado, colunas, largura, altura, tons, estilo, ladoY = lado) {
    const grade = vazio(largura, altura);
    quadros.forEach((q, i) => {
        if (q) sobrepor(grade, q, (i % colunas) * lado, Math.floor(i / colunas) * ladoY);
    });
    return letrasParaImagem(grade, tons, estilo);
}

// fundo de céu do pôr do sol (faixas pontilhadas do mais escuro ao mais claro)
function fundoCeu(img, x0, y0, larg, alt, estilo) {
    const cores = ESTILOS[estilo].cores;
    const faixas = [P.ceuMeio, P.ceuBaixo, P.sol].map((p) => hex(cores[p]));
    for (let y = 0; y < alt; y++) {
        const v = (y / alt) * (faixas.length - 1);
        const i = Math.min(Math.floor(v), faixas.length - 2);
        const t = Math.max(0, (v - i - 0.5) / 0.5);
        for (let x = 0; x < larg; x++) img.pintar(x0 + x, y0 + y, t > BAYER4[y & 3][x & 3] ? faixas[i + 1] : faixas[i]);
    }
}

// fundo escuro: a noite do jogo com o terreno da ilha embaixo
function fundoEscuro(img, x0, y0, larg, alt, estilo, chao = null) {
    const cores = ESTILOS[estilo].cores;
    caixa(img, x0, y0, larg, alt, ESTILOS[estilo].jogo.escuridao);
    if (chao !== null) {
        caixa(img, x0, y0 + chao, larg, alt - chao, cores[P.pedraEscura]);
        caixa(img, x0, y0 + chao, larg, 2, cores[P.pedra]);
    }
}

// grade fina dos quadros, para a revisão
function gradeDeQuadros(img, x0, y0, larg, alt, passoX, passoY, cor) {
    for (let x = 0; x <= larg; x += passoX) caixa(img, x0 + x, y0, 1, alt, cor);
    for (let y = 0; y <= alt; y += passoY) caixa(img, x0, y0 + y, larg, 1, cor);
}

// prévia padrão: a folha ampliada sobre o céu (esquerda) e sobre o escuro (direita)
function previaDupla(folhaImg, escala, passoX, passoY, estilo, chaoPorQuadro = null) {
    const larg = folhaImg.largura * escala;
    const alt = folhaImg.altura * escala;
    const gap = 8;
    const img = new Imagem(larg * 2 + gap * 3, alt + gap * 2);
    caixa(img, 0, 0, img.largura, img.altura, "#202020");
    fundoCeu(img, gap, gap, larg, alt, estilo);
    fundoEscuro(img, gap * 2 + larg, gap, larg, alt, estilo);
    if (chaoPorQuadro !== null) {
        // faixa de terreno no pé de cada fileira de quadros, do lado escuro
        const cores = ESTILOS[estilo].cores;
        for (let y = 0; y < folhaImg.altura; y += passoY) {
            caixa(img, gap * 2 + larg, gap + (y + chaoPorQuadro) * escala, larg, (passoY - chaoPorQuadro) * escala, cores[P.pedraEscura]);
            caixa(img, gap * 2 + larg, gap + (y + chaoPorQuadro) * escala, larg, escala, cores[P.pedra]);
        }
    }
    gradeDeQuadros(img, gap, gap, larg, alt, passoX * escala, passoY * escala, "#3b2a2a");
    gradeDeQuadros(img, gap * 2 + larg, gap, larg, alt, passoX * escala, passoY * escala, "#222830");
    const grande = new Imagem(larg, alt);
    colarMisturando(grande, folhaImg, 0, 0, escala);
    colarMisturando(img, folhaImg, gap, gap, escala);
    colarMisturando(img, folhaImg, gap * 2 + larg, gap, escala);
    return img;
}

// ---------------------------------------------------------------------------
function gerarJogador(estilo) {
    const tons = { ...TONS_JOGADOR };
    const tonsBraco = { ...tons, g: P.metal, G: P.pedraEscura };
    const quadros = quadrosDoJogador();
    const img = folha(quadros, QJ, 8, 192, 48, tons, estilo);
    img.salvar(`${IMG}/jogador-${estilo}.png`);
    const braco = letrasParaImagem(BRACO, tonsBraco, estilo);
    braco.salvar(`${IMG}/jogador-braco-${estilo}.png`);

    // prévia: folha sobre o céu e sobre o escuro + o braço montado em alguns quadros
    const base = previaDupla(img, 4, QJ, QJ, estilo, 24);
    const escala = 4;
    const linhaMontada = new Imagem(base.largura, QJ * escala * 2 + 24);
    caixa(linhaMontada, 0, 0, linhaMontada.largura, linhaMontada.altura, "#202020");
    const montados = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const larg = montados.length * QJ * escala;
    fundoCeu(linhaMontada, 8, 8, larg, QJ * escala, estilo);
    fundoEscuro(linhaMontada, 8, 16 + QJ * escala, larg, QJ * escala, estilo, 23 * escala + escala);
    montados.forEach((i, k) => {
        const quadro = recortar(img, (i % 8) * QJ, Math.floor(i / 8) * QJ, QJ, QJ);
        const ombro = OMBRO_POR_QUADRO[i];
        for (const linhaY of [8, 16 + QJ * escala]) {
            const ox = 8 + k * QJ * escala;
            colarMisturando(linhaMontada, quadro, ox, linhaY, escala);
            colarMisturando(linhaMontada, braco, ox + (ombro.x - 2) * escala, linhaY + (ombro.y - 3) * escala, escala);
        }
    });
    const previa = new Imagem(base.largura, base.altura + linhaMontada.altura);
    previa.colar(base, 0, 0);
    previa.colar(linhaMontada, 0, base.altura);
    previa.salvar(`${PREVIAS}/previa-jogador-${estilo}.png`);
}

function gerarZumbi(estilo) {
    const tons = { ...TONS_ZUMBI };
    const img = folha(quadrosDoZumbi(), QJ, 8, 192, 48, tons, estilo);
    img.salvar(`${IMG}/zumbi-${estilo}.png`);
    previaDupla(img, 4, QJ, QJ, estilo, 24).salvar(`${PREVIAS}/previa-zumbi-${estilo}.png`);
}

for (const estilo of ORDEM_DOS_ESTILOS) {
    gerarJogador(estilo);
    gerarZumbi(estilo);
    gerarInimigos(estilo);
    gerarNavio(estilo);
    gerarItensEInterface(estilo);
}
console.log("personagens gerados para:", ORDEM_DOS_ESTILOS.join(", "));
