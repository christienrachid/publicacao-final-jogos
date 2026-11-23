// Gera as folhas de sprites (128×96, quadros 16×16) e de partículas (64×8, 8×8)
// do estilo do jogo, mais as prévias ampliadas em previas/.
//   node tools/gerar-sprites.mjs
// O índice de cada quadro é a ordem dos desenhos em folhaDeSprites e folhaDeFx.
//
// Os desenhos usam letras que indicam um TOM do desenho (contorno, capa,
// sombra da capa...). Cada tom vira um PAPEL de cor da paleta (tabela TONS).
import { Imagem, hex } from "./arte/png.mjs";
import { PAPEL, ESTILOS, ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";
import { novaGrade, carimbar, gradeParaImagem, ampliar } from "./arte/util-sprites.mjs";

const Q = 16; // lado do quadro
const COLUNAS = 8;

// ---------------------------------------------------------------------------
// Tons do desenho -> papel de cor
// ---------------------------------------------------------------------------
const TONS = {
    o: PAPEL.contorno,
    h: PAPEL.brilhoFrio, // reflexo da lua nas bordas de cima e da esquerda
    C: PAPEL.capa,
    c: PAPEL.madeira, // sombra da capa
    l: PAPEL.fogoEscuro, // capa iluminada pela lamparina
    p: PAPEL.pele,
    b: PAPEL.madeiraEscura, // bota
    B: PAPEL.madeira, // bota, lado iluminado
    M: PAPEL.madeira,
    m: PAPEL.madeiraEscura,
    g: PAPEL.pedraClara, // metal claro
    G: PAPEL.pedraEscura, // metal escuro
    "1": PAPEL.pedraEscura,
    "2": PAPEL.pedra,
    "3": PAPEL.pedraClara,
    S: PAPEL.sombra, // corpo do Rondador
    s: PAPEL.pedraEscura, // borda de cima do Rondador
    D: PAPEL.contorno, // miolo escuro do Rondador
    w: PAPEL.olho,
    e: PAPEL.fogoEscuro,
    f: PAPEL.fogo,
    F: PAPEL.fogoClaro,
    v: PAPEL.espuma, // vidro, gota
    a: PAPEL.agua,
};

function tom(letra) {
    if (!(letra in TONS)) throw new Error(`sprites: tom '${letra}' sem papel`);
    return TONS[letra];
}

// desenho em texto (linhas de mesmo tamanho) -> matriz de letras ('.' = vazio)
function linhas(texto, largura = null) {
    const ls = texto
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    if (largura !== null) {
        ls.forEach((l, i) => {
            if (l.length !== largura) throw new Error(`desenho: linha ${i} com ${l.length} colunas, esperado ${largura}: '${l}'`);
        });
    }
    return ls.map((l) => Array.from(l));
}

// grade de letras -> grade de papéis no estilo
function papeisNoEstilo(letras, estilo) {
    return letras.map((linha) => linha.map((c) => (c === "." ? 0 : tom(c))));
}

function vazio(larg = Q, alt = Q) {
    return Array.from({ length: alt }, () => new Array(larg).fill("."));
}

// carimba letras sobre letras (o '.' não apaga)
function sobrepor(base, desenho, dx = 0, dy = 0) {
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

function espelhar(letras) {
    return letras.map((l) => [...l].reverse());
}

function deslocar(letras, dx, dy) {
    return sobrepor(vazio(letras[0].length, letras.length), letras, dx, dy);
}

// ---------------------------------------------------------------------------
// Jogador: tronco (linhas 0..12) + pernas (13..15) + lamparina, montados por quadro
// ---------------------------------------------------------------------------
const TRONCO_FRENTE = linhas(
    `
................
.....oooooo.....
....ohhCCCCo....
...ohCCCCCCco...
...oCooooooco...
...oCcppppcco...
...oCpoppopco...
...oCppppppco...
....occcccco....
...ohCCCCCCco...
...oCcCCCCccpo..
...opcCCCCcco...
..occcccccccco..
`,
    Q,
);

const TRONCO_COSTAS = linhas(
    `
................
.....oooooo.....
....ohhCCCCo....
...ohCCCCCCco...
...oCCCCCCCco...
...oCCCCCCCco...
...oCCCCCCcco...
...occCCCCcco...
....occcccco....
...ohCCCCCCco...
.opcCCCCCCcco...
...occCCCCcpo...
..occcccccccco..
`,
    Q,
);

const TRONCO_LADO = linhas(
    `
................
....oooooo......
...ohhCCCCoo....
..ohCCCCCCCCo...
..oCCCCCCCCCCo..
..ocCCCCCCcppo..
..ocCCCCCCcopo..
..ocCCCCCCccpo..
...occCCCCcco...
..ohCCCCCCCo....
..ocCCCcCCCCpo..
..ocCCCcCCCco...
..occcccccccco..
`,
    Q,
);

// pernas: 3 linhas (13..15)
const PERNAS = {
    frenteParado: linhas(`
....obo..obo....
....oBo..oBo....
...oooo..oooo...
`, Q),
    frentePassoE: linhas(`
....obo..obo....
....oBo..ooo....
...oooo.........
`, Q),
    frentePassoD: linhas(`
....obo..obo....
....ooo..oBo....
.........oooo...
`, Q),
    ladoParado: linhas(`
.....obBo.......
.....obBo.......
.....ooooo......
`, Q),
    // passada: perna de trás à esquerda, da frente à direita
    ladoAberto1: linhas(`
....obo.oBo.....
...obo...oBo....
...ooo...oooo...
`, Q),
    ladoAberto2: linhas(`
....oBo.obo.....
...oBo...obo....
...ooo...oooo...
`, Q),
    ladoJunto1: linhas(`
.....oBbo.......
.....oBbo.......
....ooooo.......
`, Q),
    ladoJunto2: linhas(`
.....obBo.......
.....obBo.......
.....ooooo......
`, Q),
};

// lamparina pendurada na mão: alça, tampa de metal, chama clara, chama, base
const LAMPARINA = linhas(`
.o.
ogo
oFo
ofo
ooo
`, 3);

// monta um quadro do jogador
//  sobe: 0 ou 1 (o corpo sobe 1 px; a perna estica para não abrir buraco)
//  lampX/lampY: canto da lamparina (que sobe junto com o corpo)
function quadroJogador(tronco, pernas, sobe, lampX, lampY = 11) {
    const q = vazio();
    sobrepor(q, pernas, 0, 13);
    if (sobe) sobrepor(q, [pernas[0]], 0, 12);
    sobrepor(q, tronco, 0, -sobe);
    sobrepor(q, LAMPARINA, lampX, lampY - sobe);
    return q;
}

function quadrosDoJogador() {
    const q = {};
    const P = PERNAS;
    // frente: mão em (12, 10), lamparina embaixo dela, balançando ao andar
    q[0] = quadroJogador(TRONCO_FRENTE, P.frenteParado, 0, 11);
    q[1] = quadroJogador(TRONCO_FRENTE, P.frenteParado, 1, 11);
    q[2] = quadroJogador(TRONCO_FRENTE, P.frentePassoE, 0, 11);
    q[3] = quadroJogador(TRONCO_FRENTE, P.frenteParado, 1, 12);
    q[4] = quadroJogador(TRONCO_FRENTE, P.frentePassoD, 0, 11);
    q[5] = quadroJogador(TRONCO_FRENTE, P.frenteParado, 1, 10);
    // costas: a lamparina fica do outro lado da tela, mão em (2, 10)
    q[8] = quadroJogador(TRONCO_COSTAS, P.frenteParado, 0, 1);
    q[9] = quadroJogador(TRONCO_COSTAS, P.frenteParado, 1, 1);
    q[10] = quadroJogador(TRONCO_COSTAS, P.frentePassoE, 0, 1);
    q[11] = quadroJogador(TRONCO_COSTAS, P.frenteParado, 1, 0);
    q[12] = quadroJogador(TRONCO_COSTAS, P.frentePassoD, 0, 1);
    q[13] = quadroJogador(TRONCO_COSTAS, P.frenteParado, 1, 2);
    // lado (direita): lamparina à frente do corpo, mão em (12, 10)
    q[16] = quadroJogador(TRONCO_LADO, P.ladoParado, 0, 11);
    q[17] = quadroJogador(TRONCO_LADO, P.ladoParado, 1, 11);
    q[18] = quadroJogador(TRONCO_LADO, P.ladoAberto1, 0, 11);
    q[19] = quadroJogador(TRONCO_LADO, P.ladoJunto1, 1, 12);
    q[20] = quadroJogador(TRONCO_LADO, P.ladoAberto2, 0, 11);
    q[21] = quadroJogador(TRONCO_LADO, P.ladoJunto2, 1, 10);
    return q;
}

// ---------------------------------------------------------------------------
// Rondador: corpo de sombra com contorno automático e borda de baixo ondulando
// ---------------------------------------------------------------------------
// máscara do corpo: para cada linha, [primeira coluna, última coluna]
const CORPO_RONDADOR = {
    2: [6, 9],
    3: [5, 10],
    4: [4, 11],
    5: [3, 12],
    6: [3, 12],
    7: [3, 12],
    8: [2, 13],
    9: [2, 13],
    10: [2, 13],
    11: [2, 13],
};

// comprimento da franja (linhas abaixo da 11) por coluna e quadro
function franja(x, quadro) {
    const v = Math.sin(x * 1.25 + quadro * (Math.PI / 2));
    return 1 + Math.round(1 + v); // 1..3
}

function mascaraRondador(quadro, petrificado) {
    const m = Array.from({ length: Q }, () => new Array(Q).fill(false));
    for (const [y, [a, b]] of Object.entries(CORPO_RONDADOR)) {
        for (let x = a; x <= b; x++) m[+y][x] = true;
    }
    for (let x = 2; x <= 13; x++) {
        // petrificado: a franja vira uma base reta de pedra
        const n = petrificado ? 2 : franja(x, quadro);
        for (let k = 1; k <= n; k++) m[11 + k][x] = true;
    }
    return m;
}

// contorno = vizinhos (4 direções) da máscara que estão fora dela
function contornar(m, q) {
    for (let y = 0; y < Q; y++) {
        for (let x = 0; x < Q; x++) {
            if (m[y][x]) continue;
            const viz = [
                [x - 1, y],
                [x + 1, y],
                [x, y - 1],
                [x, y + 1],
            ].some(([vx, vy]) => vx >= 0 && vy >= 0 && vx < Q && vy < Q && m[vy][vx]);
            if (viz) q[y][x] = "o";
        }
    }
}

function quadroRondador(quadro) {
    const m = mascaraRondador(quadro, false);
    const q = vazio();
    for (let y = 0; y < Q; y++) {
        for (let x = 0; x < Q; x++) {
            if (!m[y][x]) continue;
            let c = "S";
            // borda de cima clara (luar)
            if (!m[y - 1]?.[x] || (y <= 4 && !m[y][x - 1])) c = "s";
            // miolo mais escuro embaixo, em xadrez
            if (y >= 9 && (x + y) % 2 === 0 && m[y + 1]?.[x]) c = "D";
            if (y >= 12) c = (x + y) % 2 === 0 ? "D" : "S";
            q[y][x] = c;
        }
    }
    contornar(m, q);
    // olhos: inclinados, o canto de fora mais alto
    sobrepor(q, linhas(`
w....w
ww..ww
`), 5, 6);
    // flutua: sobe 1 px nos quadros 1 e 2
    const sobe = quadro === 1 || quadro === 2 ? 1 : 0;
    return deslocar(q, 0, -sobe);
}

function quadroRondadorPedra(tremor) {
    const m = mascaraRondador(0, true);
    const q = vazio();
    for (let y = 0; y < Q; y++) {
        for (let x = 0; x < Q; x++) {
            if (!m[y][x]) continue;
            // luz de cima e da esquerda: claro em cima/esquerda, escuro embaixo/direita
            const d = x - 2 + (y - 2) * 0.9;
            let c = d < 5 ? "3" : d < 14 ? "2" : "1";
            if (!m[y - 1]?.[x] && x < 10) c = "h";
            if (y === 13) c = "1";
            q[y][x] = c;
        }
    }
    contornar(m, q);
    // olhos fechados e rachaduras
    sobrepor(q, linhas(`
........o.......
.......o........
.......o........
.....oo..oo.....
................
...........o....
..........o.....
....o.....o.....
...o.o...o......
..o...o.........
`, Q), 0, 3);
    return deslocar(q, tremor, 0);
}

// ---------------------------------------------------------------------------
// Lata de óleo, saída (escotilha) e lanterna fixa
// ---------------------------------------------------------------------------
// lata de óleo: cilindro com alça e tampa, rótulo claro com uma gota
const LATA = linhas(
    `
................
................
.....oooo.......
.....o..o.ooo...
...ooooooooggo..
...ohgggggggGo..
...offeeeeeemo..
...offeeeeeemo..
...ofFFFmFFFmo..
...ofFFmmmFFmo..
...ofFFmmmFFmo..
...offeeeeeemo..
...offeeeeeemo..
...ooooooooooo..
....SSSSSSSSS...
................
`,
    Q,
);

function quadroLata(i) {
    const q = LATA.map((l) => [...l]);
    // um risco de brilho atravessa o cilindro da esquerda para a direita
    // (o quadro 3 descansa, para o brilho parecer um piscar e não um giro)
    const x = [5, 8, 11, null][i];
    if (x !== null) {
        q[5][x] = "h";
        for (let y = 6; y <= 12; y++) {
            const c = q[y][x];
            q[y][x] = c === "F" ? "h" : "F";
        }
    }
    return q;
}

// saída: alçapão de duas portas no chão, com luz quente vazando pelas frestas
const ESCOTILHA = linhas(
    `
................
................
.oooooooooooooo.
.o33333333333 1o.
.o3**********1o.
.o3MMMM**MMMM1o.
.o3GGGM**MGGG1o.
.o3mmmm**mmmm1o.
.o3MMMg**gMMM1o.
.o3MMMM**MMMM1o.
.o3GGGm**mGGG1o.
.o3MMMM**MMMM1o.
.o3**********1o.
.o31111111111 1o.
.oooooooooooooo.
................
`.replace(/ /g, ""),
    Q,
);

function quadroEscotilha(i) {
    // pulso: escuro, médio, claro, médio
    const brilho = ["e", "f", "F", "f"][i];
    const q = ESCOTILHA.map((l) => l.map((c) => (c === "*" ? brilho : c)));
    // a luz vaza pela fresta do meio, por cima e por baixo do alçapão
    if (i !== 0) {
        for (const x of [7, 8]) {
            q[2][x] = i === 2 ? "f" : "e";
            q[14][x] = i === 2 ? "f" : "e";
        }
    }
    if (i === 2) {
        for (const x of [7, 8]) {
            q[1][x] = "e";
            q[15][x] = "e";
        }
        q[4][1] = "e";
        q[12][1] = "e";
        q[4][14] = "e";
        q[12][14] = "e";
    }
    return q;
}

// lanterna fixa: telhado de metal, vidro aceso e poste de madeira
const POSTE = linhas(
    `
......oooo......
.....oGGGGo.....
....oGGGGGGo....
....oooooooo....
.....oheeeo.....
.....oeeeeo.....
.....oeeeeo.....
.....oeeeeo.....
.....oooooo.....
......oMmo......
......oMmo......
......oMmo......
......oMmo......
......oMmo......
.....oMMmmo.....
.....oooooo.....
`,
    Q,
);

// chama (2×3) dentro do vidro, em 3 quadros
const CHAMAS = [
    linhas(`
.f
fF
FF
`),
    linhas(`
f.
Ff
FF
`),
    linhas(`
..
fF
Ff
`),
];

function quadroPoste(i) {
    const q = POSTE.map((l) => [...l]);
    sobrepor(q, CHAMAS[i], 7, 5);
    return q;
}

// ---------------------------------------------------------------------------
// Partículas 8×8
// ---------------------------------------------------------------------------
const PARTICULAS = [
    // 0 poeira do passo
    linhas(`
........
........
...hh...
..h33h..
.h33332.
..2222..
........
........
`, 8),
    // 1 poeira menor
    linhas(`
........
........
........
...3....
..3.3...
...2....
........
........
`, 8),
    // 2 brasa
    linhas(`
........
........
........
...Ff...
...fe...
........
........
........
`, 8),
    // 3 vaga-lume
    linhas(`
........
........
...e....
..eFe...
...e....
........
........
........
`, 8),
    // 4 faísca
    linhas(`
........
........
...F....
..FFF...
...F....
........
........
........
`, 8),
    // 5 estrelinha
    linhas(`
........
...h....
...F....
.hFFFh..
...F....
...h....
........
........
`, 8),
    // 6 floco de névoa
    linhas(`
........
........
..h.h...
.h.h.h..
..h.h.h.
...h.h..
........
........
`, 8),
    // 7 gota de chuva
    linhas(`
........
.....h..
.....h..
....v...
....v...
...v....
........
........
`, 8),
];

// ---------------------------------------------------------------------------
// Montagem das folhas
// ---------------------------------------------------------------------------
function todosOsQuadros() {
    const q = quadrosDoJogador();
    for (let i = 0; i < 4; i++) q[24 + i] = quadroRondador(i);
    q[28] = quadroRondadorPedra(0);
    q[29] = quadroRondadorPedra(1);
    for (let i = 0; i < 4; i++) q[32 + i] = quadroLata(i);
    for (let i = 0; i < 4; i++) q[36 + i] = quadroEscotilha(i);
    for (let i = 0; i < 3; i++) q[40 + i] = quadroPoste(i);
    return q;
}

function folhaDeSprites(estilo) {
    const grade = novaGrade(128, 96);
    for (const [indice, letras] of Object.entries(todosOsQuadros())) {
        const i = +indice;
        carimbar(grade, papeisNoEstilo(letras, estilo), (i % COLUNAS) * Q, Math.floor(i / COLUNAS) * Q);
    }
    return gradeParaImagem(grade, estilo);
}

function folhaDeFx(estilo) {
    const grade = novaGrade(64, 8);
    PARTICULAS.forEach((letras, i) => carimbar(grade, papeisNoEstilo(letras, estilo), i * 8, 0));
    return gradeParaImagem(grade, estilo);
}

// prévia: a folha ampliada sobre o chão do estilo (esquerda) e sobre a escuridão (direita)
function previa(folha, estilo, escala, ladoQuadro) {
    const cores = ESTILOS[estilo].cores;
    const larg = folha.largura * escala;
    const alt = folha.altura * escala;
    const gap = 8;
    const img = new Imagem(larg * 2 + gap * 3, alt + gap * 2);
    img.retangulo(0, 0, img.largura, img.altura, hex("#202020"));
    const fundos = [cores[PAPEL.pedra], ESTILOS[estilo].jogo.escuridao];
    fundos.forEach((fundo, k) => {
        const ox = gap + k * (larg + gap);
        img.retangulo(ox, gap, larg, alt, hex(fundo));
        // grade dos quadros
        const linha = hex(k === 0 ? cores[PAPEL.pedraEscura] : "#1a1a1a");
        for (let x = 0; x <= folha.largura; x += ladoQuadro) img.retangulo(ox + x * escala, gap, 1, alt, linha);
        for (let y = 0; y <= folha.altura; y += ladoQuadro) img.retangulo(ox, gap + y * escala, larg, 1, linha);
        img.colar(ampliar(folha, escala), ox, gap);
    });
    return img;
}

for (const estilo of ORDEM_DOS_ESTILOS) {
    const sprites = folhaDeSprites(estilo);
    sprites.salvar(`public/data/img/sprites-${estilo}.png`);
    previa(sprites, estilo, 4, Q).salvar(`previas/previa-sprites-${estilo}.png`);
    const fx = folhaDeFx(estilo);
    fx.salvar(`public/data/img/fx-${estilo}.png`);
    previa(fx, estilo, 8, 8).salvar(`previas/previa-fx-${estilo}.png`);
}
console.log("sprites e partículas gerados para:", ORDEM_DOS_ESTILOS.join(", "));
