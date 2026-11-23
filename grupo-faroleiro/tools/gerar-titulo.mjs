// Gera a tela de título (640×360) e o logo "FAROLEIRO" no estilo do jogo,
// mais as prévias previas/previa-titulo-<e>.png (título com o logo por cima).
//   node tools/gerar-titulo.mjs
//
// Tudo é desenhado por regra (sem sorteio fora das sementes fixas) e só com os
// papéis de cor da paleta do estilo: céu em faixas com pontilhado Bayer, lua,
// estrelas, mar com ondas, rochedo com o farol à direita e o faroleiro no
// penhasco da frente, com a lamparina acesa.
//
// LANTERNA DO FAROL (para o jogo desenhar a luz e o facho girando):
//   centro da lanterna = (520, 101) em pixels da imagem de 640×360.
//   A sala da lanterna vai de x 513 a 527 e de y 94 a 108; no PNG ela fica apagada.
//
// LOGO: logo-<e>.png tem 310×52 px (letras de 42 px de altura, contorno de
//   2 px e 6 px de brilho quente embaixo). Fundo transparente.
import { Imagem, criarAleatorio } from "./arte/png.mjs";
import { PAPEL, ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";
import { novaGrade, gradeParaImagem, pontilhar } from "./arte/util-sprites.mjs";

const LARG = 640;
const ALT = 360;
const HORIZONTE = 226;

export const LANTERNA = { x: 520, y: 101 };

// sombra da faixa colorida do farol, por estilo (a paleta não tem "capa escura")
const SOMBRA_DA_CAPA = {
    mare: PAPEL.madeira,
};

const P = PAPEL;

function desenharTitulo(estilo) {
    const g = novaGrade(LARG, ALT);
    const pinta = (x, y, papel) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x >= 0 && y >= 0 && x < LARG && y < ALT) g[y][x] = papel;
    };
    const le = (x, y) => (x >= 0 && y >= 0 && x < LARG && y < ALT ? g[y][x] : 0);

    // ---- céu: faixas do mais escuro (alto) ao mais claro (horizonte) ----
    const tonsDoCeu = [P.contorno, P.sombra, P.pedraEscura, P.pedra];
    for (let y = 0; y < HORIZONTE; y++) {
        const v = Math.pow(y / HORIZONTE, 1.35) * (tonsDoCeu.length - 1);
        const i = Math.min(Math.floor(v), tonsDoCeu.length - 2);
        const resto = v - i;
        // 55% de cada faixa é cor lisa; o resto é a transição pontilhada
        const t = Math.max(0, (resto - 0.55) / 0.45);
        for (let x = 0; x < LARG; x++) g[y][x] = pontilhar(x, y, t) ? tonsDoCeu[i + 1] : tonsDoCeu[i];
    }

    // ---- lua crescente com halo ----
    const lua = { x: 112, y: 64, r: 13 };
    for (let y = lua.y - 30; y <= lua.y + 30; y++) {
        for (let x = lua.x - 30; x <= lua.x + 30; x++) {
            const d = Math.hypot(x - lua.x, y - lua.y);
            if (d > lua.r && d < lua.r + 9) {
                // halo em pontilhado, mais ralo para fora
                const t = 1 - (d - lua.r) / 9;
                if (pontilhar(x, y, t * 0.55)) pinta(x, y, P.pedraEscura);
            }
        }
    }
    for (let y = lua.y - lua.r; y <= lua.y + lua.r; y++) {
        for (let x = lua.x - lua.r; x <= lua.x + lua.r; x++) {
            const d = Math.hypot(x - lua.x, y - lua.y);
            if (d > lua.r) continue;
            const corte = Math.hypot(x - (lua.x + 7), y - (lua.y - 4));
            if (corte < lua.r - 1) continue; // parte escura do crescente
            pinta(x, y, d > lua.r - 1.5 || x < lua.x - 6 ? P.espuma : P.brilhoFrio);
        }
    }

    // ---- estrelas (mais no alto) ----
    const sorte = criarAleatorio(1337);
    for (let i = 0; i < 150; i++) {
        const x = Math.floor(sorte() * LARG);
        const y = Math.floor(Math.pow(sorte(), 1.7) * (HORIZONTE - 40));
        if (Math.hypot(x - lua.x, y - lua.y) < lua.r + 12) continue;
        const r = sorte();
        if (r < 0.06) {
            // estrela grande de 4 pontas
            pinta(x, y, P.fogoClaro);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pinta(x + dx, y + dy, P.brilhoFrio);
        } else if (r < 0.2) {
            pinta(x, y, P.espuma);
        } else if (r < 0.75) {
            pinta(x, y, P.brilhoFrio);
        } else {
            pinta(x, y, P.pedraClara);
        }
    }

    // ---- faixas de névoa perto do horizonte ----
    const brumas = [
        { y: 196, x0: 0, x1: 300, d: 0.25 },
        { y: 205, x0: 150, x1: 470, d: 0.35 },
        { y: 214, x0: 0, x1: 640, d: 0.45 },
    ];
    for (const n of brumas) {
        for (let y = n.y - 3; y <= n.y + 3; y++) {
            for (let x = n.x0; x < n.x1; x++) {
                const borda = Math.min(1, (x - n.x0) / 60, (n.x1 - x) / 60);
                const t = n.d * borda * (1 - Math.abs(y - n.y) / 4);
                if (pontilhar(x, y, t)) pinta(x, y, P.pedraClara);
            }
        }
    }

    // ---- ilha distante à esquerda ----
    for (let x = 0; x < 230; x++) {
        const h = 7 + 5 * Math.sin(x / 31) + 3 * Math.sin(x / 9.7 + 1) - (x > 170 ? (x - 170) / 6 : 0);
        for (let y = Math.round(HORIZONTE - h); y < HORIZONTE; y++) pinta(x, y, P.sombra);
    }

    // ---- mar ----
    for (let y = HORIZONTE; y < ALT; y++) {
        const t = (y - HORIZONTE) / 40; // agua clara no horizonte, escura perto
        for (let x = 0; x < LARG; x++) g[y][x] = pontilhar(x, y, Math.min(1, t)) ? P.aguaEscura : P.agua;
    }
    g[HORIZONTE].fill(P.agua);
    // ondas: tracinhos, mais espaçados e compridos perto de quem olha
    const ondas = criarAleatorio(42);
    for (let y = HORIZONTE + 3, k = 0; y < ALT; k++) {
        const prof = (y - HORIZONTE) / (ALT - HORIZONTE);
        const quantos = 22 - Math.floor(prof * 10);
        for (let i = 0; i < quantos; i++) {
            const x = Math.floor(ondas() * LARG);
            const comp = 2 + Math.floor(ondas() * (3 + prof * 14));
            const cor = prof < 0.15 ? P.aguaEscura : ondas() < 0.12 ? P.espuma : P.agua;
            for (let j = 0; j < comp; j++) pinta(x + j, y, cor);
        }
        y += 2 + Math.floor(prof * 7);
    }
    // reflexo da lua: coluna de tracinhos claros
    const reflexo = criarAleatorio(7);
    for (let y = HORIZONTE + 1; y < ALT; y += 2) {
        const prof = (y - HORIZONTE) / (ALT - HORIZONTE);
        const meia = 3 + prof * 16 + reflexo() * 4;
        const centro = lua.x + (reflexo() - 0.5) * (4 + prof * 8);
        if (reflexo() < 0.25) continue;
        for (let x = Math.round(centro - meia); x <= Math.round(centro + meia); x++) {
            const borda = Math.abs(x - centro) / meia;
            if (borda < 0.45) pinta(x, y, P.espuma);
            else if (pontilhar(x, y, 1 - borda)) pinta(x, y, P.brilhoFrio);
        }
    }

    // ---- rochedo à direita ----
    const topoDaRocha = (x) => {
        // pico sob o farol em x = 520; desce até o mar dos dois lados
        const base = 196 + Math.pow(Math.abs(x - 520) / 120, 1.6) * 34;
        const recorte = 3 * Math.sin(x / 7) + 2 * Math.sin(x / 3.3);
        return Math.round(Math.min(base + recorte, HORIZONTE + 20));
    };
    for (let x = 395; x < LARG; x++) {
        const topo = topoDaRocha(x);
        const fundo = HORIZONTE + 26 + Math.round(3 * Math.sin(x / 11));
        for (let y = topo; y < fundo; y++) {
            // facetas: células inclinadas com tom sorteado por célula; a luz da
            // lua vem da esquerda, então o lado direito puxa para o escuro
            const cu = Math.floor((x * 0.8 + y * 0.5) / 14);
            const cv = Math.floor((y * 1.1 - x * 0.35) / 9);
            const r = criarAleatorio(cu * 7919 + cv * 104729 + 17)() - (x - 470) / 400;
            let papel = r > 0.62 ? P.pedra : r > 0.05 ? P.pedraEscura : P.sombra;
            if (y > HORIZONTE + 8) papel = (x + y) % 2 === 0 ? P.sombra : P.pedraEscura;
            pinta(x, y, papel);
        }
        pinta(x, topo, P.contorno);
        // borda de cima iluminada onde a rocha sobe para a direita (lado da lua)
        if (topoDaRocha(x + 1) <= topo && x < 525) pinta(x, topo + 1, P.brilhoFrio);
        else pinta(x, topo + 1, P.pedraClara);
        // espuma no pé da rocha
        if ((x * 7) % 5 < 3) pinta(x, fundo, P.espuma);
        if ((x * 3) % 7 < 2) pinta(x + 2, fundo + 1, P.agua);
    }

    // ---- farol ----
    const cx = LANTERNA.x;
    const baseY = topoDaRocha(cx) + 3;
    const topoTorre = 116; // onde começa a galeria
    const larguraBase = 30;
    const larguraTopo = 18;
    const sombraCapa = SOMBRA_DA_CAPA[estilo];
    for (let y = topoTorre; y <= baseY; y++) {
        const t = (y - topoTorre) / (baseY - topoTorre);
        const meia = Math.round((larguraTopo + (larguraBase - larguraTopo) * t) / 2);
        const faixa = Math.floor((y - topoTorre) / 14) % 2 === 0; // listras de 14 px
        for (let x = cx - meia; x <= cx + meia; x++) {
            const u = (x - (cx - meia)) / (2 * meia); // 0 esquerda .. 1 direita
            let papel;
            // faixa vermelha: capa e sombra à direita; faixa branca: do luar (esquerda) ao escuro
            if (faixa) papel = u < 0.8 ? P.capa : sombraCapa;
            else papel = u < 0.2 ? P.espuma : u < 0.55 ? P.brilhoFrio : u < 0.82 ? P.pedraClara : P.pedra;
            if (x === cx - meia || x === cx + meia) papel = P.contorno;
            pinta(x, y, papel);
        }
    }
    // janelinhas escuras na torre
    for (const wy of [136, 164, 192]) {
        for (let y = wy; y < wy + 5; y++) for (let x = cx - 1; x <= cx + 1; x++) pinta(x, y, P.contorno);
        pinta(cx - 1, wy, P.sombra);
    }
    // porta
    for (let y = baseY - 9; y <= baseY; y++) for (let x = cx - 3; x <= cx + 3; x++) pinta(x, y, P.contorno);
    for (let y = baseY - 8; y <= baseY; y++) for (let x = cx - 2; x <= cx + 2; x++) pinta(x, y, P.madeiraEscura);
    // galeria (plataforma com parapeito)
    for (let x = cx - 14; x <= cx + 14; x++) {
        pinta(x, topoTorre, P.contorno);
        pinta(x, topoTorre - 1, x < cx ? P.pedraClara : P.pedraEscura);
        pinta(x, topoTorre - 2, P.contorno);
        if ((x - cx) % 3 === 0) for (let y = topoTorre - 7; y < topoTorre - 2; y++) pinta(x, y, P.contorno);
        pinta(x, topoTorre - 7, P.contorno);
    }
    // sala da lanterna (apagada): vidro escuro com montantes
    const sala = { x0: cx - 7, x1: cx + 7, y0: LANTERNA.y - 7, y1: LANTERNA.y + 7 };
    for (let y = sala.y0; y <= sala.y1; y++) {
        for (let x = sala.x0; x <= sala.x1; x++) {
            let papel = P.aguaEscura;
            if (x === sala.x0 || x === sala.x1 || y === sala.y0 || y === sala.y1) papel = P.contorno;
            else if ((x - sala.x0) % 5 === 0) papel = P.contorno;
            else if (x === sala.x0 + 1 && y < sala.y0 + 5) papel = P.brilhoFrio; // reflexo da lua no vidro
            pinta(x, y, papel);
        }
    }
    // cúpula
    for (let y = sala.y0 - 8; y < sala.y0; y++) {
        const meia = Math.round(Math.sqrt(Math.max(0, 1 - Math.pow((sala.y0 - y) / 8, 2))) * 9);
        for (let x = cx - meia; x <= cx + meia; x++) {
            const borda = x === cx - meia || x === cx + meia || y === sala.y0 - 8;
            pinta(x, y, borda ? P.contorno : x < cx - 2 ? P.pedraClara : P.pedraEscura);
        }
    }
    for (let y = sala.y0 - 13; y < sala.y0 - 7; y++) pinta(cx, y, P.contorno);
    pinta(cx, sala.y0 - 14, P.brilhoFrio);

    // ---- casinha do faroleiro ao pé do farol, com a janela acesa ----
    const casa = { x0: cx - 46, x1: cx - 18, y1: topoDaRocha(cx - 32) + 2 };
    const casaTopo = casa.y1 - 14;
    for (let y = casaTopo; y <= casa.y1; y++) {
        for (let x = casa.x0; x <= casa.x1; x++) {
            const borda = x === casa.x0 || x === casa.x1;
            pinta(x, y, borda ? P.contorno : x < casa.x0 + 4 ? P.pedraClara : P.pedra);
        }
    }
    // telhado
    for (let k = 0; k <= 9; k++) {
        const y = casaTopo - k;
        for (let x = casa.x0 - 3 + k; x <= casa.x1 + 3 - k; x++) {
            const borda = x === casa.x0 - 3 + k || x === casa.x1 + 3 - k || k === 0;
            pinta(x, y, borda ? P.contorno : k < 3 ? P.madeiraEscura : P.madeira);
        }
    }
    // chaminé
    for (let y = casaTopo - 12; y < casaTopo - 4; y++) for (let x = casa.x1 - 7; x <= casa.x1 - 4; x++) pinta(x, y, x === casa.x1 - 7 || x === casa.x1 - 4 ? P.contorno : P.pedraEscura);
    // janela acesa (a única luz quente lá longe)
    for (let y = casaTopo + 3; y <= casaTopo + 8; y++) {
        for (let x = casa.x0 + 6; x <= casa.x0 + 12; x++) {
            const borda = y === casaTopo + 3 || y === casaTopo + 8 || x === casa.x0 + 6 || x === casa.x0 + 12;
            pinta(x, y, borda ? P.contorno : x === casa.x0 + 9 || y === casaTopo + 5 ? P.fogoEscuro : P.fogo);
        }
    }
    // porta da casinha
    for (let y = casa.y1 - 8; y <= casa.y1; y++) for (let x = casa.x1 - 8; x <= casa.x1 - 4; x++) pinta(x, y, x === casa.x1 - 8 || x === casa.x1 - 4 || y === casa.y1 - 8 ? P.contorno : P.madeiraEscura);

    // ---- penhasco da frente, à esquerda, com o faroleiro ----
    // um morrinho em x ≈ 165, onde o faroleiro fica recortado contra o mar
    const penhasco = (x) =>
        Math.round(320 + Math.pow(x / 300, 2.2) * 46 - 20 * Math.exp(-Math.pow((x - 165) / 38, 2)) + 2 * Math.sin(x / 6) + 1.5 * Math.sin(x / 2.7));
    for (let x = 0; x < 330; x++) {
        const topo = penhasco(x);
        for (let y = topo; y < ALT; y++) pinta(x, y, y < topo + 3 ? P.folhaEscura : (x + y) % 5 === 0 ? P.sombra : P.contorno);
        pinta(x, topo - 1, P.contorno);
        if (x % 9 === 0 || x % 13 === 0) {
            // tufos de capim
            pinta(x, topo - 2, P.folhaEscura);
            pinta(x + 1, topo - 3, P.folha);
            pinta(x, topo - 1, P.folha);
        }
    }

    // o faroleiro, de lado, olhando para o farol (mesmo desenho do sprite 16)
    const faroleiro = [
        "....oooooo......",
        "...ohhCCCCoo....",
        "..ohCCCCCCCCo...",
        "..oCCCCCCCCCCo..",
        "..ocCCCCCCcppo..",
        "..ocCCCCCCcopo..",
        "..ocCCCCCCccpo..",
        "...occCCCCcco...",
        "..ohCCCCCCCo....",
        "..ocCCCcCCCCpo..",
        "..ocCCCcCCCco...",
        "..occccccccco...",
        "....obo.oBo.....",
        "...obo...oBo....",
        "...ooo...oooo...",
    ];
    const tons = {
        o: P.contorno,
        h: P.brilhoFrio,
        C: P.capa,
        c: P.madeira,
        p: P.pele,
        b: P.madeiraEscura,
        B: P.madeira,
    };
    const fx = 157;
    const fy = penhasco(fx + 7) - 16;
    // halo da lamparina no chão e no ar (pontilhado quente)
    const lamp = { x: fx + 13, y: fy + 13 };
    for (let y = lamp.y - 14; y <= lamp.y + 10; y++) {
        for (let x = lamp.x - 18; x <= lamp.x + 18; x++) {
            const d = Math.hypot((x - lamp.x) * 0.7, y - lamp.y);
            if (d < 12 && pontilhar(x, y, (1 - d / 12) * 0.45)) {
                const atual = le(x, y);
                // só acende o chão em volta dos pés, nunca o mar
                if (atual === P.contorno || atual === P.sombra || atual === P.folhaEscura) {
                    pinta(x, y, atual === P.folhaEscura ? P.fogo : P.fogoEscuro);
                }
            }
        }
    }
    faroleiro.forEach((linha, y) =>
        Array.from(linha).forEach((c, x) => {
            if (c !== ".") pinta(fx + x, fy + y, tons[c]);
        }),
    );
    // lamparina na mão
    const lampada = [".o.", "ogo", "oFo", "ofo", "ooo"];
    const tonsLamp = { o: P.contorno, g: P.pedraClara, F: P.fogoClaro, f: P.fogo };
    lampada.forEach((linha, y) =>
        Array.from(linha).forEach((c, x) => {
            if (c !== ".") pinta(fx + 11 + x, fy + 10 + y, tonsLamp[c]);
        }),
    );

    return g;
}

// ---------------------------------------------------------------------------
// Logo "FAROLEIRO"
// ---------------------------------------------------------------------------
const LETRAS = {
    F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
};
const UNIDADE = 6;
const CONTORNO = 2;
const BRILHO = 6;

function desenharLogo(palavra = "FAROLEIRO") {
    const larguraEmUnidades = [...palavra].reduce((s, ch) => s + LETRAS[ch][0].length, 0) + palavra.length - 1;
    const largLetras = larguraEmUnidades * UNIDADE;
    const altLetras = 7 * UNIDADE;
    const larg = largLetras + CONTORNO * 2;
    const alt = altLetras + CONTORNO * 2 + BRILHO;
    const mascara = Array.from({ length: alt }, () => new Array(larg).fill(false));
    let ux = 0;
    for (const ch of palavra) {
        const desenho = LETRAS[ch];
        desenho.forEach((linha, uy) =>
            Array.from(linha).forEach((c, uxx) => {
                if (c !== "#") return;
                for (let y = 0; y < UNIDADE; y++) {
                    for (let x = 0; x < UNIDADE; x++) {
                        mascara[CONTORNO + uy * UNIDADE + y][CONTORNO + (ux + uxx) * UNIDADE + x] = true;
                    }
                }
            }),
        );
        ux += desenho[0].length + 1;
    }
    // chanfra as quinas de fora (1 px), para o bloco não ficar quadrado demais
    const m = mascara.map((l) => [...l]);
    for (let y = 1; y < alt - 1; y++) {
        for (let x = 1; x < larg - 1; x++) {
            if (!mascara[y][x]) continue;
            for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                if (!mascara[y][x + sx] && !mascara[y + sy][x] && !mascara[y + sy][x + sx]) m[y][x] = false;
            }
        }
    }
    const g = novaGrade(larg, alt);
    // brilho quente embaixo das letras (pontilhado que some para baixo)
    const baseLetras = CONTORNO + altLetras;
    for (let y = baseLetras - 4; y < alt; y++) {
        for (let x = 0; x < larg; x++) {
            const t = 1 - (y - (baseLetras - 4)) / (alt - (baseLetras - 4));
            const bordaX = Math.min(1, x / 30, (larg - 1 - x) / 30);
            if (pontilhar(x, y, t * 0.7 * bordaX)) g[y][x] = P.fogoEscuro;
        }
    }
    // contorno de 2 px
    for (let y = 0; y < alt; y++) {
        for (let x = 0; x < larg; x++) {
            if (m[y][x]) continue;
            let perto = false;
            for (let dy = -CONTORNO; dy <= CONTORNO && !perto; dy++) {
                for (let dx = -CONTORNO; dx <= CONTORNO && !perto; dx++) {
                    if (Math.abs(dx) + Math.abs(dy) > 3) continue;
                    const yy = y + dy;
                    const xx = x + dx;
                    if (yy >= 0 && xx >= 0 && yy < alt && xx < larg && m[yy][xx]) perto = true;
                }
            }
            if (perto) g[y][x] = P.contorno;
        }
    }
    // miolo das letras: creme em cima, fogo no meio, brasa na base
    for (let y = 0; y < alt; y++) {
        for (let x = 0; x < larg; x++) {
            if (!m[y][x]) continue;
            const v = (y - CONTORNO) / altLetras; // 0 topo .. 1 base
            let papel;
            if (v < 0.45) papel = P.fogoClaro;
            else if (v < 0.62) papel = pontilhar(x, y, (v - 0.45) / 0.17) ? P.fogo : P.fogoClaro;
            else if (v < 0.86) papel = P.fogo;
            else papel = pontilhar(x, y, (v - 0.86) / 0.14) ? P.fogoEscuro : P.fogo;
            // sombra interna: borda de baixo e da direita de cada traço
            if (!m[y + 1]?.[x] || !m[y][x + 1]) papel = P.fogoEscuro;
            // reflexo: borda de cima de cada traço
            if (!m[y - 1]?.[x] && m[y + 1]?.[x]) papel = v < 0.5 ? P.fogoClaro : P.fogo;
            g[y][x] = papel;
        }
    }
    return g;
}

// ---------------------------------------------------------------------------
for (const estilo of ORDEM_DOS_ESTILOS) {
    const titulo = gradeParaImagem(desenharTitulo(estilo), estilo);
    titulo.salvar(`public/data/img/titulo-${estilo}.png`);
    const logo = gradeParaImagem(desenharLogo(), estilo);
    logo.salvar(`public/data/img/logo-${estilo}.png`);
    // prévia: título com o logo centrado no alto
    const previa = new Imagem(LARG, ALT);
    previa.colar(titulo, 0, 0);
    previa.colar(logo, Math.floor((LARG - logo.largura) / 2), 34);
    previa.salvar(`previas/previa-titulo-${estilo}.png`);
    if (estilo === ORDEM_DOS_ESTILOS[0]) console.log(`logo: ${logo.largura}×${logo.altura}`);
}
console.log(`título gerado; centro da lanterna do farol em (${LANTERNA.x}, ${LANTERNA.y})`);
