// Gera a arte da Fase 2 (o farol visto de cima e o Kraken) no estilo do jogo,
// mais as prévias em previas/.
//   node tools/gerar-farol-arte.mjs
//
// Arquivos (<e> = id do estilo, "mare"), em public/data/img/:
//   farol-ilha-<e>.png    640×480  ilha vista de cima; centro do farol em (320, 300);
//                                  o mar ocupa o alto (y 0 a ~160) para o Kraken
//   farol-topo-<e>.png    128×64   2 quadros de 64×64: apagado, aceso (centro em 32, 32)
//   inimigos-mar-<e>.png  256×128  quadros 32×32, 8 colunas, olhando para a direita
//   kraken-<e>.png        1024×160 4 quadros 256×160: parado A, parado B, olhos abertos,
//                                  dano; olhos em (96, 70) e (160, 70) dentro do quadro
//   tentaculo-<e>.png     128×128  4 quadros 32×128, ponta para baixo
//
// Como nos outros geradores, tudo é desenhado com PAPÉIS de cor. Cada desenho
// usa "tons" (grama, raso, corpo do morcego...) e o estilo diz qual papel
// é cada tom (tabelas TONS_*).
import { Imagem, criarAleatorio } from "./arte/png.mjs";
import { PAPEL, ORDEM_DOS_ESTILOS } from "./arte/paletas.mjs";
import { novaGrade, carimbar, gradeParaImagem, ampliar, pontilhar } from "./arte/util-sprites.mjs";
import {
    Tela,
    criarRuido,
    distancias,
    contornar,
    dentroDoPoligono,
    curva,
    trocarPapeis,
} from "./arte/util-farol.mjs";

const P = PAPEL;

const LARG = 640;
const ALT = 480;
export const FAROL = { x: 320, y: 300 };
export const OLHOS_DO_KRAKEN = [
    { x: 96, y: 70 },
    { x: 160, y: 70 },
];

// sorteio por pixel, sem estado (o mesmo pixel dá sempre o mesmo número)
function sorte(x, y, semente = 0) {
    let h = Math.imul((x | 0) ^ 0x5bd1e995, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15) ^ (y | 0), 0x165667b1);
    h = Math.imul(h ^ (h >>> 13) ^ Math.imul(semente + 1, 0x85ebca6b), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

// ===========================================================================
// Tons por estilo
// ===========================================================================
const TONS_ILHA = {
    mare: {
        fundo: P.aguaEscura,
        raso: P.agua,
        espuma: P.espuma,
        onda: P.agua,
        crista: P.espuma,
        areia: P.areia,
        areiaMolhada: P.areiaEscura,
        sombraAreia: P.areiaEscura,
        grama: P.folha,
        gramaClara: P.gramaClara,
        gramaEscura: P.folhaEscura,
        flor: P.brilhoFrio,
        terra: P.areiaEscura,
        terraClara: P.areia,
        terraEscura: P.madeiraEscura,
        pedraEscura: P.pedraEscura,
        pedra: P.pedra,
        pedraClara: P.pedraClara,
        brilho: P.brilhoFrio,
        junta: P.sombra,
        madeira: P.madeira,
        madeiraEscura: P.madeiraEscura,
        telhado: P.madeira,
        telhadoEscuro: P.madeiraEscura,
        cume: P.pedraClara,
        parede: P.pedraClara,
        paredeEscura: P.pedra,
        janela: P.fogo,
        janelaEscura: P.fogoEscuro,
        luzNoChao: P.fogoEscuro,
        metal: P.metal,
        contorno: P.contorno,
    },
};

// faixa colorida do farol e sua sombra (a paleta não tem "capa escura")
const TONS_FAROL = {
    mare: { faixa: P.capa, faixaSombra: P.madeira, cupula: P.capa, cupulaSombra: P.madeira },
};

// monstros: esc/med/cla são os 3 tons do corpo; det é o detalhe (barbatana, crista)
const TONS_MONSTROS = {
    mare: {
        morcego: { esc: P.sombra, med: P.kraken, cla: P.krakenClaro, pelo: P.madeira, olho: P.ceuBaixo },
        piranha: { esc: P.pedraClara, med: P.metal, cla: P.brilhoFrio, det: P.ceuBaixo, detEsc: P.madeira, dente: P.olho, olho: P.sol },
        serpente: { esc: P.agua, med: P.fantasma, cla: P.fantasmaClaro, det: P.ceuBaixo, olho: P.sol },
        sombra: P.sombra,
        agua: P.agua,
        espuma: P.espuma,
        brilho: P.brilhoFrio,
        flash: P.olho,
        cinza: P.pedraEscura,
        cinzaClara: P.pedra,
        brasa: P.fogo,
        brasaClara: P.fogoClaro,
    },
};

const TONS_KRAKEN = {
    mare: {
        esc: P.ceuAlto,
        med: P.kraken,
        cla: P.krakenClaro,
        borda: P.brilhoFrio,
        olho: P.sol,
        olhoClaro: P.solClaro,
        brilhoOlho: P.olho,
        espuma: P.espuma,
        agua: P.agua,
        flash: P.olho,
    },
};

// sombra projetada: que tom fica embaixo de um objeto em cada chão
function criarSombraDe(T) {
    const mapa = new Map([
        [T.fundo, T.fundo],
        [T.raso, T.fundo],
        [T.espuma, T.raso],
        [T.areiaMolhada, T.sombraAreia],
        [T.areia, T.sombraAreia],
        [T.terra, T.terraEscura],
        [T.terraClara, T.terraEscura],
        [T.gramaClara, T.gramaEscura],
        [T.flor, T.gramaEscura],
        [T.grama, T.gramaEscura],
    ]);
    return (papel) => (mapa.has(papel) ? mapa.get(papel) : papel);
}

// Objeto com contorno e sombra projetada (para baixo e à direita):
// forma(x, y) diz se o pixel é do objeto; tom(x, y) dá o papel dele.
function desenharObjeto(tela, caixa, forma, tom, opcoes) {
    const { contorno, sombraDe, sombra = [2, 2] } = opcoes;
    const [x0, y0, x1, y1] = caixa;
    const m = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && forma(x, y);
    const [sx, sy] = sombra;
    for (let y = y0 - 1; y <= y1 + sy + 1; y++) {
        for (let x = x0 - 1; x <= x1 + sx + 1; x++) {
            if (!tela.dentro(x, y)) continue;
            if (m(x, y)) {
                tela.grade[y][x] = tom(x, y);
            } else if (m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1)) {
                tela.grade[y][x] = contorno;
            } else if (sombraDe && (m(x - sx, y - sy) || m(x - sx + 1, y - sy) || m(x - sx, y - sy + 1))) {
                tela.grade[y][x] = sombraDe(tela.grade[y][x]);
            }
        }
    }
}

// tom de luz de uma superfície pela normal (luz vem de cima e da esquerda)
function luzDe(nx, ny, nz = 0) {
    return -0.55 * nx - 0.68 * ny + 0.48 * nz;
}

// ===========================================================================
// Ilha (640×480)
// ===========================================================================
const ILHA = { cx: FAROL.x, cy: FAROL.y, rx: 208, ry: 126 };
const ruidoBorda = criarRuido(11);

function naIlha(x, y) {
    const dx = (x + 0.5 - ILHA.cx) / ILHA.rx;
    const dy = (y + 0.5 - ILHA.cy) / ILHA.ry;
    const a = Math.atan2(dy, dx);
    const r =
        1 +
        0.06 * Math.sin(3 * a + 0.8) +
        0.045 * Math.sin(5 * a + 2.3) +
        0.03 * Math.sin(7 * a + 4.1) +
        0.09 * (ruidoBorda(x / 26, y / 26, 3) - 0.5);
    return Math.hypot(dx, dy) < r;
}

// ponto da praia na direção do ângulo (graus; 0 = direita, 90 = baixo)
function pontoDaPraia(graus) {
    const a = (graus * Math.PI) / 180;
    let r = 40;
    while (naIlha(Math.round(ILHA.cx + Math.cos(a) * r), Math.round(ILHA.cy + Math.sin(a) * r * (ILHA.ry / ILHA.rx)))) r += 1;
    return [Math.round(ILHA.cx + Math.cos(a) * r), Math.round(ILHA.cy + Math.sin(a) * r * (ILHA.ry / ILHA.rx))];
}

const AGUA = 0;
const AREIA = 1;
const GRAMA = 2;
const CAMINHO = 3;
const OBJETO = 4;

function desenharIlha(estilo) {
    const T = TONS_ILHA[estilo];
    const sombraDe = criarSombraDe(T);
    const tela = new Tela(LARG, ALT);
    const g = tela.grade;

    const terra = Array.from({ length: ALT }, (_, y) => Array.from({ length: LARG }, (_, x) => (naIlha(x, y) ? 1 : 0)));
    const dAteAgua = distancias(terra, LARG, ALT, 0);
    const dAteTerra = distancias(terra, LARG, ALT, 1);
    const ate = (arr, x, y) => arr[y * LARG + x];
    const rA = criarRuido(21);
    const rB = criarRuido(33);
    const rC = criarRuido(45);

    const tipo = new Uint8Array(LARG * ALT);
    const tipoEm = (x, y) => (x < 0 || y < 0 || x >= LARG || y >= ALT ? AGUA : tipo[y * LARG + x]);
    const marcar = (x, y, t) => {
        if (x >= 0 && y >= 0 && x < LARG && y < ALT) tipo[y * LARG + x] = t;
    };
    const larguraDaAreia = (x, y) => 5 + 7 * rC(x / 50, y / 50) + (y > 395 ? 5 : 0);

    // ---- base: mar em faixas de profundidade, areia e grama ----
    for (let y = 0; y < ALT; y++) {
        for (let x = 0; x < LARG; x++) {
            if (!terra[y][x]) {
                const d = ate(dAteTerra, x, y);
                let p;
                if (d < 9) p = T.raso;
                else if (d < 24) p = pontilhar(x, y, (d - 9) / 15) ? T.fundo : T.raso;
                else p = T.fundo;
                const n = rA(x / 9, y / 9);
                if (d <= 1.01 && n > 0.2) p = T.espuma;
                else if (d <= 2.1 && n > 0.6) p = T.espuma;
                else if (d > 5.4 && d <= 6.4 && rB(x / 15, y / 15) > 0.56) p = T.espuma; // onda chegando
                else if (d > 13 && d <= 14 && rB(x / 22 + 9, y / 22) > 0.66) p = T.raso; // marola mais longe
                g[y][x] = p;
                marcar(x, y, AGUA);
            } else {
                const d = ate(dAteAgua, x, y);
                if (d < larguraDaAreia(x, y)) {
                    let p = d <= 2.01 ? T.areiaMolhada : T.areia;
                    if (p === T.areia) {
                        const s = sorte(x, y, 3);
                        if (s < 0.025) p = T.areiaMolhada; // pedrinha
                        else if (s > 0.996) p = T.brilho; // concha
                    }
                    g[y][x] = p;
                    marcar(x, y, AREIA);
                } else {
                    g[y][x] = T.grama;
                    marcar(x, y, GRAMA);
                }
            }
        }
    }

    // ---- barranco: a grama é um degrau acima da areia ----
    for (let y = 0; y < ALT; y++) {
        for (let x = 0; x < LARG; x++) {
            const t = tipoEm(x, y);
            if (t === GRAMA) {
                if (tipoEm(x, y + 1) === AREIA || tipoEm(x, y + 2) === AREIA) g[y][x] = T.gramaEscura;
                else if (tipoEm(x + 1, y) === AREIA) g[y][x] = T.gramaEscura;
                else if (tipoEm(x, y - 1) === AREIA || tipoEm(x - 1, y) === AREIA) g[y][x] = T.gramaClara;
            } else if (t === AREIA) {
                if (tipoEm(x, y - 1) === GRAMA || tipoEm(x, y - 2) === GRAMA || tipoEm(x - 1, y) === GRAMA) g[y][x] = T.sombraAreia;
            }
        }
    }

    // ---- textura da grama: manchas de tufos claros e escuros ----
    const tufos = criarAleatorio(77);
    const gramaLivre = (x, y) => tipoEm(x, y) === GRAMA && g[y][x] === T.grama;
    for (let i = 0; i < 2600; i++) {
        const x = Math.floor(tufos() * LARG);
        const y = Math.floor(tufos() * ALT);
        if (!gramaLivre(x, y) || !gramaLivre(x - 1, y - 1) || !gramaLivre(x + 1, y - 1)) continue;
        const n = rB(x / 42, y / 34);
        const escolha = tufos();
        if (n > 0.57) {
            // tufo claro: lâminas ao luar, raiz escura
            if (escolha < 0.75) {
                g[y][x] = T.gramaEscura;
                g[y - 1][x - 1] = T.gramaClara;
                g[y - 1][x + 1] = T.gramaClara;
                if (escolha < 0.3 && gramaLivre(x, y - 2)) g[y - 2][x] = T.gramaClara;
            }
        } else if (n < 0.42 || escolha < 0.35) {
            g[y][x] = T.gramaEscura;
            g[y - 1][x - 1] = T.gramaEscura;
            g[y - 1][x + 1] = T.gramaEscura;
        }
    }
    // florzinhas brancas em poucos lugares
    const flores = criarAleatorio(91);
    for (let i = 0; i < 18; i++) {
        const cx = Math.floor(flores() * LARG);
        const cy = Math.floor(flores() * ALT);
        for (let k = 0; k < 4; k++) {
            const x = cx + Math.floor(flores() * 7) - 3;
            const y = cy + Math.floor(flores() * 5) - 2;
            if (!gramaLivre(x, y) || !gramaLivre(x, y + 1)) continue;
            g[y][x] = T.flor;
            g[y + 1][x] = T.gramaEscura;
        }
    }

    // ---- sombra comprida da torre (a lua vem do alto à esquerda) ----
    const sombraTorre = { x0: FAROL.x, y0: FAROL.y, x1: FAROL.x + 50, y1: FAROL.y + 38, r: 21 };
    tela.cada(FAROL.x - 30, FAROL.y - 30, FAROL.x + 80, FAROL.y + 70, (x, y) => {
        if (tipoEm(x, y) !== GRAMA) return null;
        const vx = sombraTorre.x1 - sombraTorre.x0;
        const vy = sombraTorre.y1 - sombraTorre.y0;
        const t = Math.max(0, Math.min(1, ((x - sombraTorre.x0) * vx + (y - sombraTorre.y0) * vy) / (vx * vx + vy * vy)));
        const d = Math.hypot(x - (sombraTorre.x0 + vx * t), y - (sombraTorre.y0 + vy * t));
        const raio = sombraTorre.r * (1 - 0.25 * t);
        if (d > raio) return null;
        return (x + y) % 2 === 0 ? T.gramaEscura : null;
    });

    // ---- caminhos de terra ----
    const pier = { x0: 345, x1: 359 };
    let praiaDoPier = 380;
    while (terra[praiaDoPier][352]) praiaDoPier++;
    const caminhos = [
        [[320, 332], [318, 352], [323, 376], [338, 396], [350, 412], [352, praiaDoPier - 6]],
        [[319, 364], [298, 362], [270, 357], [242, 354], [214, 350]],
    ];
    const noCaminho = new Uint8Array(LARG * ALT);
    for (const pontos of caminhos) {
        for (const [px, py] of curva(pontos)) {
            const raio = 3.2 + 1.1 * (rA(px / 11, py / 11) - 0.5);
            for (let y = Math.floor(py - raio - 1); y <= py + raio + 1; y++) {
                for (let x = Math.floor(px - raio - 1); x <= px + raio + 1; x++) {
                    if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > raio) continue;
                    if (tipoEm(x, y) !== GRAMA && tipoEm(x, y) !== CAMINHO) continue;
                    marcar(x, y, CAMINHO);
                    noCaminho[y * LARG + x] = 1;
                }
            }
        }
    }
    for (let y = 0; y < ALT; y++) {
        for (let x = 0; x < LARG; x++) {
            if (tipoEm(x, y) !== CAMINHO) continue;
            let p = T.terra;
            const s = sorte(x, y, 8);
            if (s < 0.07) p = T.terraClara;
            else if (s < 0.11) p = T.terraEscura;
            // a grama da borda de cima faz sombra no caminho
            if (tipoEm(x, y - 1) === GRAMA || tipoEm(x - 1, y) === GRAMA) p = T.terraEscura;
            else if (tipoEm(x, y + 1) === GRAMA && s < 0.5) p = T.terraClara;
            g[y][x] = p;
        }
    }

    // ---- base de pedra do farol (o topo vem em farol-topo-<e>.png) ----
    const RB = 38;
    tela.cada(FAROL.x - RB - 6, FAROL.y - RB - 6, FAROL.x + RB + 6, FAROL.y + RB + 6, (x, y) => {
        const dx = x + 0.5 - FAROL.x;
        const dy = y + 0.5 - FAROL.y;
        const r = Math.hypot(dx, dy);
        if (r > RB + 0.5) {
            // sombra da base no chão
            if (Math.hypot(dx - 3, dy - 3) <= RB + 0.5) return sombraDe(g[y][x]);
            return null;
        }
        marcar(x, y, OBJETO);
        if (r > RB - 0.6) return T.contorno;
        const luz = -(dx * 0.6 + dy * 0.8) / r;
        if (r > RB - 2.6) return luz > 0.35 ? T.brilho : luz > -0.1 ? T.pedraClara : luz > -0.6 ? T.pedra : T.pedraEscura;
        if (r > RB - 3.4) return T.junta;
        if (r < 29) return T.pedra;
        // dois anéis de blocos com juntas desencontradas
        const externo = r > 33;
        if (Math.abs(r - 33) < 0.6) return T.junta;
        const a = Math.atan2(dy, dx);
        const blocos = externo ? 26 : 22;
        const passo = (2 * Math.PI) / blocos;
        const u = (a + Math.PI + (externo ? passo / 2 : 0)) / passo;
        const arco = (u - Math.floor(u)) * passo * r; // px desde a junta
        if (arco < 1) return T.junta;
        if (arco < 2.4 && luz > -0.2) return T.pedraClara;
        if (sorte(Math.floor(u), externo ? 1 : 2, 5) < 0.25) return T.pedraEscura; // bloco mais gasto
        return T.pedra;
    });
    // degrau da porta, ao sul, onde começa o caminho
    desenharObjeto(
        tela,
        [FAROL.x - 5, FAROL.y + RB, FAROL.x + 4, FAROL.y + RB + 3],
        () => true,
        (x, y) => (y === FAROL.y + RB ? T.brilho : x < FAROL.x - 2 ? T.pedraClara : T.pedra),
        { contorno: T.contorno, sombraDe, sombra: [1, 1] },
    );

    // ---- casa do faroleiro (telhado de duas águas e a frente baixa) ----
    const casa = { x0: 192, x1: 232, y0: 311, cume: 322, y1: 334, parede: 7 };
    // sombra no chão
    tela.cada(casa.x0 + 3, casa.y0 + 3, casa.x1 + 3, casa.y1 + casa.parede + 2, (x, y) => sombraDe(g[y][x]));
    for (let y = casa.y0; y <= casa.y1; y++) {
        for (let x = casa.x0; x <= casa.x1; x++) {
            marcar(x, y, OBJETO);
            let p;
            const linha = y - casa.y0;
            if (x === casa.x0 || x === casa.x1 || y === casa.y0 || y === casa.y1) p = T.contorno;
            else if (y === casa.cume) p = T.cume;
            else if (y === casa.cume + 1) p = T.contorno;
            else if (y < casa.cume) {
                // água de cima, ao luar: fileiras de telhas
                const fileira = Math.floor((linha - 1) / 3);
                p = (linha - 1) % 3 === 2 ? T.telhadoEscuro : (x + fileira * 3) % 6 === 0 ? T.telhadoEscuro : T.telhado;
                if (x === casa.x0 + 1) p = T.telhadoEscuro;
            } else {
                const l2 = y - casa.cume - 2;
                const fileira = Math.floor(l2 / 3);
                p = l2 % 3 === 2 ? T.contorno : (x + fileira * 3) % 6 === 0 ? T.contorno : T.telhadoEscuro;
            }
            g[y][x] = p;
        }
    }
    // frente da casa (parede baixa com porta e janela acesa)
    for (let y = casa.y1 + 1; y <= casa.y1 + casa.parede; y++) {
        for (let x = casa.x0 + 2; x <= casa.x1 - 2; x++) {
            marcar(x, y, OBJETO);
            let p = x < casa.x0 + 9 ? T.parede : T.paredeEscura;
            if (y === casa.y1 + 1) p = T.contorno; // beiral
            if (x === casa.x0 + 2 || x === casa.x1 - 2 || y === casa.y1 + casa.parede) p = T.contorno;
            // porta
            if (x >= 210 && x <= 215 && y >= casa.y1 + 2) p = x === 210 || x === 215 || y === casa.y1 + 2 ? T.contorno : T.madeiraEscura;
            // janela
            if (x >= 197 && x <= 203 && y >= casa.y1 + 2 && y <= casa.y1 + 5) {
                p = x === 197 || x === 203 || y === casa.y1 + 2 || y === casa.y1 + 5 ? T.contorno : x === 200 ? T.janelaEscura : T.janela;
            }
            if (x >= 220 && x <= 225 && y >= casa.y1 + 2 && y <= casa.y1 + 5) {
                p = x === 220 || x === 225 || y === casa.y1 + 2 || y === casa.y1 + 5 ? T.contorno : x === 222 ? T.janelaEscura : T.janela;
            }
            g[y][x] = p;
        }
    }
    // luz da janela no chão (pontilhado quente)
    for (const jx of [200, 222.5]) {
        for (let y = casa.y1 + casa.parede + 1; y <= casa.y1 + casa.parede + 5; y++) {
            for (let x = Math.floor(jx - 5); x <= jx + 5; x++) {
                const d = Math.hypot((x - jx) * 0.8, (y - (casa.y1 + casa.parede)) * 1.3);
                if (d < 5 && pontilhar(x, y, (1 - d / 5) * 0.6) && tipoEm(x, y) !== OBJETO) g[y][x] = T.luzNoChao;
            }
        }
    }
    // chaminé
    desenharObjeto(
        tela,
        [224, 312, 228, 318],
        () => true,
        (x, y) => (y <= 313 ? T.contorno : x === 224 ? T.pedraClara : T.pedra),
        { contorno: T.contorno, sombraDe: (p) => (p === T.telhado ? T.telhadoEscuro : p), sombra: [2, 1] },
    );
    // barril e caixote ao lado da casa
    desenharObjeto(
        tela,
        [236, 331, 242, 337],
        (x, y) => Math.hypot(x - 239, y - 334) <= 3.3,
        (x, y) => {
            const d = Math.hypot(x - 239, y - 334);
            if (d > 2.3) return x + y < 239 + 334 ? T.madeira : T.madeiraEscura;
            return Math.abs(x - 239) < 0.5 ? T.madeiraEscura : T.metal;
        },
        { contorno: T.contorno, sombraDe },
    );
    desenharObjeto(
        tela,
        [244, 333, 250, 339],
        () => true,
        (x, y) => (x === 244 || y === 333 ? T.cume : x - 244 === y - 333 || x - 244 === 339 - y ? T.madeiraEscura : T.madeira),
        { contorno: T.contorno, sombraDe },
    );

    // ---- arbustos ----
    const longeDeTudo = (x, y, folga) => {
        for (let yy = y - folga; yy <= y + folga; yy += 2) {
            for (let xx = x - folga; xx <= x + folga; xx += 2) {
                const t = tipoEm(xx, yy);
                if (t !== GRAMA) return false;
            }
        }
        return true;
    };
    const arbustos = [
        [172, 296, 7],
        [254, 318, 6],
        [236, 236, 6],
        [412, 226, 7],
        [462, 284, 6],
        [432, 372, 7],
        [272, 404, 6],
        [162, 352, 6],
        [484, 330, 5],
        [180, 330, 5],
        [380, 410, 5],
        [300, 206, 5],
    ];
    const rFolha = criarRuido(57);
    for (const [bx, by, br] of arbustos) {
        if (!longeDeTudo(bx, by, br + 3)) continue;
        // três bolas de folhas
        const bolas = [
            [bx, by, br],
            [bx - br * 0.6, by + br * 0.35, br * 0.7],
            [bx + br * 0.65, by + br * 0.3, br * 0.65],
        ];
        const forma = (x, y) => bolas.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r);
        desenharObjeto(
            tela,
            [Math.floor(bx - br * 1.4), Math.floor(by - br), Math.ceil(bx + br * 1.4), Math.ceil(by + br * 1.1)],
            forma,
            (x, y) => {
                let melhor = -9;
                for (const [cx, cy, r] of bolas) {
                    const nx = (x + 0.5 - cx) / r;
                    const ny = (y + 0.5 - cy) / r;
                    if (nx * nx + ny * ny > 1) continue;
                    melhor = Math.max(melhor, luzDe(nx, ny, Math.sqrt(1 - nx * nx - ny * ny)));
                }
                const v = melhor + (rFolha(x / 2.2, y / 2.2) - 0.5) * 0.7;
                return v > 0.55 ? T.gramaClara : v > 0.05 ? T.grama : T.gramaEscura;
            },
            { contorno: T.contorno, sombraDe },
        );
        tela.cada(bx - br * 1.5, by - br - 1, bx + br * 1.5, by + br * 1.2 + 3, (x, y) => {
            marcar(x, y, OBJETO);
            return null;
        });
    }

    // ---- pedras (na grama, na areia e na água) ----
    const rPedra = criarRuido(63);
    const pedra = (cx, cy, r, achatada = 0.8) => {
        const forma = (x, y) => {
            const nx = (x + 0.5 - cx) / r;
            const ny = (y + 0.5 - cy) / (r * achatada);
            return Math.hypot(nx, ny) < 1 + 0.25 * (rPedra(x / 3, y / 3) - 0.5);
        };
        // espuma em volta, na água, mais embaixo (a onda bate)
        tela.cada(cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3, (x, y) => {
            if (tipoEm(x, y) !== AGUA) return null;
            const d = Math.hypot((x + 0.5 - cx) / (r + 2.2), (y + 0.5 - cy) / (r * achatada + 2.2));
            if (d <= 1 && (y >= cy - 1 || sorte(x, y, 9) < 0.35)) return T.espuma;
            return null;
        });
        desenharObjeto(
            tela,
            [Math.floor(cx - r - 1), Math.floor(cy - r - 1), Math.ceil(cx + r + 1), Math.ceil(cy + r + 1)],
            forma,
            (x, y) => {
                const nx = (x + 0.5 - cx) / r;
                const ny = (y + 0.5 - cy) / (r * achatada);
                const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
                // facetas: a pedra é lapidada, não redonda
                const v = luzDe(nx, ny, nz) + (rPedra(x / 2.5 + 7, y / 2.5) - 0.5) * 0.5;
                return v > 0.72 ? T.brilho : v > 0.32 ? T.pedraClara : v > -0.15 ? T.pedra : T.pedraEscura;
            },
            { contorno: T.contorno, sombraDe },
        );
        tela.cada(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2, (x, y) => {
            marcar(x, y, OBJETO);
            return null;
        });
    };
    // grupos de pedras na praia: [ângulo, [deslocamento para fora, raio, desvio lateral]...]
    const grupos = [
        [12, [[4, 6, -4], [-2, 4, 7], [9, 3, 10]]],
        [32, [[2, 4, 0], [7, 3, -6]]],
        [158, [[5, 6, 0], [0, 4, -8], [10, 3, 8]]],
        [178, [[3, 4, 3]]],
        [212, [[4, 5, 0], [-3, 3, 7], [8, 3, -7]]],
        [292, [[3, 5, 0], [8, 3, 6]]],
        [330, [[5, 6, 2], [-1, 4, -8], [11, 3, -2]]],
        [118, [[3, 5, 0], [8, 3, -6]]],
        [62, [[4, 4, 0]]],
    ];
    for (const [graus, pedras] of grupos) {
        const [px, py] = pontoDaPraia(graus);
        const a = (graus * Math.PI) / 180;
        const fora = [Math.cos(a), Math.sin(a)];
        const lado = [-fora[1], fora[0]];
        for (const [desloc, r, lateral] of pedras) {
            pedra(px + fora[0] * desloc + lado[0] * lateral, py + fora[1] * desloc + lado[1] * lateral, r);
        }
    }
    // pedrinhas na grama
    for (const [x, y, r] of [
        [386, 238, 3],
        [392, 242, 2],
        [204, 266, 3],
        [452, 252, 3],
        [296, 418, 2],
        [430, 334, 2],
    ]) {
        if (longeDeTudo(x, y, r + 2)) pedra(x, y, r);
    }

    // ---- píer e barquinho ----
    const py0 = praiaDoPier - 9;
    const py1 = Math.min(praiaDoPier + 30, ALT - 4);
    // sombra do píer na água
    tela.cada(pier.x1 + 1, py0 + 2, pier.x1 + 3, py1 + 3, (x, y) => (tipoEm(x, y) === AGUA ? T.fundo : null));
    tela.cada(pier.x0 + 2, py1 + 1, pier.x1 + 3, py1 + 3, (x, y) => (tipoEm(x, y) === AGUA ? T.fundo : null));
    for (let y = py0; y <= py1; y++) {
        for (let x = pier.x0; x <= pier.x1; x++) {
            marcar(x, y, OBJETO);
            let p;
            const l = y - py0;
            if (x === pier.x0 || x === pier.x1 || y === py1) p = T.contorno;
            else if (l % 4 === 3) p = T.madeiraEscura; // fresta entre tábuas
            else if (l % 4 === 0) p = x < pier.x0 + 4 ? T.cume : T.madeira; // borda da tábua ao luar
            else p = T.madeira;
            // emendas desencontradas
            if (l % 4 !== 3 && x === pier.x0 + 3 + ((Math.floor(l / 4) * 5) % 9)) p = T.madeiraEscura;
            g[y][x] = p;
        }
    }
    // estacas
    for (const ey of [py0 + 12, py0 + 24, py1 - 2]) {
        for (const ex of [pier.x0 - 1, pier.x1 + 1]) {
            for (let y = ey - 1; y <= ey + 1; y++) {
                for (let x = ex - 1; x <= ex + 1; x++) {
                    g[y][x] = x === ex && y === ey ? T.madeiraEscura : T.contorno;
                }
            }
            if (tipoEm(ex, ey + 2) === AGUA) {
                g[ey + 2][ex] = T.espuma;
                g[ey + 2][ex - 1] = T.espuma;
            }
        }
    }
    // barquinho amarrado à direita do píer
    const barco = { x: 371, y: praiaDoPier + 15, rx: 4.6, ry: 9.5 };
    desenharObjeto(
        tela,
        [barco.x - 6, barco.y - 11, barco.x + 6, barco.y + 11],
        (x, y) => {
            const nx = (x + 0.5 - barco.x) / barco.rx;
            const ny = (y + 0.5 - barco.y) / barco.ry;
            // proa pontuda para cima
            return nx * nx + ny * ny * (ny < 0 ? 1 + Math.abs(nx) * 0.6 : 1) <= 1;
        },
        (x, y) => {
            const nx = (x + 0.5 - barco.x) / barco.rx;
            const ny = (y + 0.5 - barco.y) / barco.ry;
            const d = Math.hypot(nx, ny);
            if (d > 0.7) return nx < 0.1 ? T.madeira : T.madeiraEscura;
            if (Math.abs(y - (barco.y + 2)) < 1) return T.madeira; // banco
            return T.contorno;
        },
        { contorno: T.contorno, sombraDe },
    );
    // corda até a estaca
    for (let x = pier.x1 + 2; x <= barco.x - 5; x++) g[praiaDoPier + 9][x] = T.flor;

    // ---- ondas no mar aberto (tracinhos em fileiras) ----
    const ondas = criarAleatorio(42);
    for (let y = 3; y < ALT - 1; ) {
        const quantas = 10;
        for (let i = 0; i < quantas; i++) {
            const x = Math.floor(ondas() * LARG);
            const comp = 3 + Math.floor(ondas() * 6);
            let livre = true;
            for (let j = -1; j <= comp; j++) {
                const xx = x + j;
                if (xx < 0 || xx >= LARG || tipoEm(xx, y) !== AGUA || ate(dAteTerra, xx, y) < 22 || g[y][xx] !== T.fundo) livre = false;
            }
            if (!livre) continue;
            for (let j = 0; j < comp; j++) g[y][x + j] = T.onda;
            // a crista: um ponto claro em cima do meio da onda
            if (ondas() < 0.35 && y > 0) g[y - 1][x + Math.floor(comp / 2)] = T.crista;
        }
        y += 4 + Math.floor(ondas() * 4);
    }

    return { grade: g, praiaDoPier };
}

// ===========================================================================
// Topo do farol (2 quadros de 64×64)
// ===========================================================================
function desenharTopo(aceso, estilo) {
    const F = TONS_FAROL[estilo];
    const t = new Tela(64, 64);
    t.cada(0, 0, 63, 63, (x, y) => {
        const dx = x + 0.5 - 32;
        const dy = y + 0.5 - 32;
        const d = Math.hypot(dx, dy);
        const ux = d > 0 ? dx / d : 0;
        const uy = d > 0 ? dy / d : 0;
        const luz = -(ux * 0.62 + uy * 0.78); // borda virada para a lua
        const a = Math.atan2(dy, dx);
        if (d > 30.5) return null;
        if (d > 29.5) return P.contorno;
        // a torre se afina para cima: vista de cima, vira anéis listrados
        if (d > 26.5) return luz > 0.3 ? P.olho : luz > -0.35 ? P.brilhoFrio : P.pedraClara;
        if (d > 25.8 && luz < 0) return P.contorno; // dobra entre as faixas
        if (d > 23.6) return luz > -0.25 ? F.faixa : F.faixaSombra;
        if (d > 22.8) return P.contorno; // beirada da galeria
        // parapeito da galeria, com colunas a cada 20°
        if (d > 21.4) {
            const coluna = Math.abs(((a + Math.PI) / ((2 * Math.PI) / 18)) % 1 - 0.5) > 0.38;
            if (coluna) return P.contorno;
            if (aceso) return luz < -0.2 ? P.fogo : P.metal;
            return luz > 0.2 ? P.brilhoFrio : P.metal;
        }
        // piso da galeria em chapas
        if (d > 19.4) {
            const chapa = Math.abs(((a + Math.PI) / ((2 * Math.PI) / 12)) % 1 - 0.5) > 0.44;
            if (chapa) return P.contorno;
            if (aceso) return pontilhar(x, y, 0.5) ? P.fogoEscuro : P.pedraEscura;
            return luz > 0.3 ? P.pedra : P.pedraEscura;
        }
        if (d > 18.4) return P.contorno;
        // sala da lanterna: vidro com montantes a cada 45°
        if (d > 11.6) {
            const montante = Math.abs(((a + Math.PI + Math.PI / 8) / (Math.PI / 4)) % 1 - 0.5) > 0.42;
            if (aceso) {
                if (montante) return P.fogoEscuro;
                return d < 15.2 ? P.fogoClaro : P.fogo;
            }
            if (montante) return P.contorno;
            // reflexo da lua no vidro, no alto à esquerda
            if (luz > 0.55 && d > 13.5 && d < 17) return P.brilhoFrio;
            if (luz > 0.35 && d > 14.5 && d < 16) return P.espuma;
            return P.aguaEscura;
        }
        if (d > 10.6) return P.contorno;
        // cúpula: meia esfera com brilho no alto à esquerda
        const nx = dx / 10.6;
        const ny = dy / 10.6;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const v = luzDe(nx, ny, nz);
        if (d < 1.6) return P.contorno; // respiro no topo
        if (d < 2.6) return P.metal;
        // brilho pequeno no alto à esquerda e sombra em meia-lua embaixo à direita
        if (Math.hypot(dx + 4.5, dy + 4.5) < 1.6) return P.olho;
        if (Math.hypot(dx + 3, dy + 6) < 1.1) return P.olho;
        // gomos da cúpula, só do lado da sombra
        const gomo = Math.abs(((a + Math.PI) / (Math.PI / 4)) % 1 - 0.5) > 0.45 && d > 3.5 && v < 0.2;
        if (gomo) return F.cupulaSombra;
        return v > -0.12 ? F.cupula : F.cupulaSombra;
    });
    return t.grade;
}

// ===========================================================================
// Monstros vistos de cima (quadros 32×32, olhando para a direita)
// ===========================================================================
const Q = 32;

// espelha a metade de cima (linhas 0..15) para baixo (linhas 31..16)
function espelharVertical(grade) {
    for (let y = 0; y < Q / 2; y++) grade[Q - 1 - y] = grade[y].slice();
    return grade;
}

// Morcego visto de cima, olhando para a direita: só a metade de cima é
// desenhada (linhas 0 a 15); a de baixo é o espelho dela.
// m membrana, e membrana na sombra, b osso da asa, p pelo, c pelo ao luar,
// k orelha e garra, r olho
const MORCEGO = {
    aberto: [
        "",
        ".................mb",
        "............b...mmb",
        "...........mbm.mmmb",
        "..........mmmbbmmmbm",
        ".........mmmmmmbbmbm",
        "......bbbbbbbbbbbbbbk",
        "......mmmmmmmmmmmmmbb",
        ".......mmmmmmmmmmmmb",
        "........mmmmmmmmmmmb",
        "........emmmmmmmmmb",
        ".........eemmmmmmmb.....k",
        ".........eeeemmmmb....kk",
        "..........ccccccccppccc",
        ".........pppppppppppcrcc",
        "........pppppppppppppppcc",
    ],
    meio: [
        "",
        "",
        "",
        "",
        "................mb",
        "...........b...mmb",
        "..........mbmmmmbm",
        "........bbbbbbbbbbk",
        "........mmmmmmmmmbb",
        ".........mmmmmmmmb",
        "..........emmmmmmb",
        "..........eemmmmb......k",
        "..........eeemmmb....kk",
        "..........ccccccccppccc",
        ".........pppppppppppcrcc",
        "........pppppppppppppppcc",
    ],
    fechado: [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "............mmmb",
        "...........emmmmb......k",
        "..........eemmmmb....kk",
        "..........ccccccccppccc",
        ".........pppppppppppcrcc",
        "........pppppppppppppppcc",
    ],
};

function morcego(pose, estilo) {
    const M = TONS_MONSTROS[estilo].morcego;
    const tons = { m: M.med, e: M.esc, b: M.cla, p: M.pelo, c: M.cla, k: M.esc, r: M.olho };
    const g = novaGrade(Q, Q);
    MORCEGO[pose].forEach((linha, y) => {
        Array.from(linha).forEach((ch, x) => {
            if (ch === ".") return;
            if (!(ch in tons)) throw new Error(`morcego: '${ch}' sem tom`);
            g[y][x] = tons[ch];
        });
    });
    return contornar(espelharVertical(g), P.contorno);
}

function piranha(k, estilo) {
    const M = TONS_MONSTROS[estilo].piranha;
    const t = new Tela(Q, Q);
    const meio = 15.5;
    const cauda = [0, 1.6, 0, -1.6][k];
    const curva = (x) => (x < 12 ? cauda * ((12 - x) / 12) * 0.6 : 0); // o rabo puxa o corpo
    // cauda em forquilha
    const rabo = [
        [8, meio - 2 + curva(8)],
        [2, meio - 6 + cauda],
        [4.5, meio + cauda],
        [2, meio + 6 + cauda],
        [8, meio + 2 + curva(8)],
    ];
    t.cada(0, 0, Q - 1, Q - 1, (x, y) => (dentroDoPoligono(x + 0.5, y + 0.5, rabo) ? (y + 0.5 < meio + cauda ? M.det : M.detEsc) : null));
    // nadadeiras peitorais
    for (const lado of [-1, 1]) {
        const nad = [
            [17, meio + lado * 3.5],
            [13.5, meio + lado * 8],
            [14.5, meio + lado * 3.5],
        ];
        const fase = k % 2 === 0 ? 0 : 0.8;
        const nadMov = nad.map(([x, y]) => [x - fase, y]);
        t.cada(0, 0, Q - 1, Q - 1, (x, y) => (dentroDoPoligono(x + 0.5, y + 0.5, nadMov) ? M.det : null));
    }
    // corpo: elipse grossa, cabeça larga à direita
    t.cada(0, 0, Q - 1, Q - 1, (x, y) => {
        const cx = x + 0.5;
        const cy = y + 0.5 - curva(cx);
        const nx = (cx - 15.5) / 9;
        const ny = (cy - meio) / (cx > 15.5 ? 6.4 : 4.8);
        // a frente é rombuda (quase quadrada), o resto é oval
        if ((cx > 15.5 ? Math.pow(Math.abs(nx), 3.2) : nx * nx) + ny * ny > 1) return null;
        const borda = Math.abs(ny) > 0.72; // barriga vermelha aparece dos lados
        if (borda && cx > 9 && cx < 22) return M.det;
        if (Math.abs(cy - meio) < 0.6 && cx > 8 && cx < 19) return M.esc; // espinha (nadadeira de cima)
        const v = luzDe(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)));
        return v > 0.42 ? M.cla : v > -0.05 ? M.med : M.esc;
    });
    // boca com dentes na frente
    for (let y = 12; y <= 19; y++) {
        const dente = (y % 2 === 0) === (k % 2 === 0);
        t.pinta(24, y, dente ? M.dente : P.contorno);
        if (dente) t.pinta(25, y, M.dente);
    }
    t.pinta(23, 15, P.contorno);
    t.pinta(23, 16, P.contorno);
    // olhos nos dois lados da cabeça
    t.pinta(20, 12, M.olho);
    t.pinta(20, 19, M.olho);
    t.pinta(21, 12, P.contorno);
    t.pinta(21, 19, P.contorno);
    return contornar(t.grade, P.contorno);
}

function serpente(k, estilo) {
    const M = TONS_MONSTROS[estilo].serpente;
    const t = new Tela(Q, Q);
    const fase = (k * Math.PI) / 2;
    const meio = 15.5;
    const amp = (x) => 1.2 + 4.2 * Math.pow(Math.max(0, (22 - x) / 19), 0.8);
    const yDoCorpo = (x) => meio + amp(x) * Math.sin(x * 0.42 + fase);
    const raio = (x) => 1.1 + 2.7 * Math.min(1, Math.max(0, (x - 3) / 17));
    // corpo: discos ao longo da onda, do rabo ao pescoço
    const centro = []; // para saber a espinha
    for (let x = 3; x <= 22; x += 0.25) centro.push([x, yDoCorpo(x), raio(x)]);
    t.cada(0, 0, Q - 1, Q - 1, (x, y) => {
        const px = x + 0.5;
        const py = y + 0.5;
        let melhor = null;
        for (const [cx, cy, r] of centro) {
            const d = Math.hypot(px - cx, py - cy);
            if (d <= r && (!melhor || d / r < melhor.n)) melhor = { n: d / r, dy: (py - cy) / r, cx };
        }
        if (!melhor) return null;
        // losangos escuros ao longo da espinha
        const passo = (((melhor.cx - 1) % 4) + 4) % 4;
        if (Math.abs(melhor.dy) < 0.62 - Math.abs(passo - 2) * 0.3) return M.esc;
        if (melhor.dy > 0.6) return M.esc; // lado na sombra
        return melhor.dy < -0.3 ? M.cla : M.med;
    });
    // cabeça: oval com focinho à direita
    const hy = meio + amp(25) * Math.sin(25 * 0.42 + fase) * 0.5;
    t.cada(18, 0, Q - 1, Q - 1, (x, y) => {
        const nx = (x + 0.5 - 25) / 5.6;
        const ny = (y + 0.5 - hy) / (4 * (1 - 0.3 * Math.max(0, nx))); // focinho afinando
        if (nx * nx + ny * ny > 1) return null;
        const v = luzDe(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)));
        return v > 0.45 ? M.cla : v > -0.1 ? M.med : M.esc;
    });
    // babados atrás da cabeça
    for (const lado of [-1, 1]) {
        t.pinta(21, Math.round(hy + lado * 4.2), M.det);
        t.pinta(20, Math.round(hy + lado * 5), M.det);
        t.pinta(22, Math.round(hy + lado * 4.6), M.det);
    }
    // olhos e narinas
    t.pinta(26, Math.round(hy - 2.4), M.olho);
    t.pinta(26, Math.round(hy + 1.6), M.olho);
    t.pinta(29, Math.round(hy - 1), P.contorno);
    t.pinta(29, Math.round(hy + 0.4), P.contorno);
    return contornar(t.grade, P.contorno);
}

function sombraNoChao(estilo) {
    const M = TONS_MONSTROS[estilo];
    const t = new Tela(Q, Q);
    t.cada(0, 0, Q - 1, Q - 1, (x, y) => {
        const d = Math.hypot((x + 0.5 - 16) / 9.5, (y + 0.5 - 16) / 4.6);
        if (d <= 0.72) return M.sombra;
        if (d <= 1) return (x + y) % 2 === 0 ? M.sombra : null;
        return null;
    });
    return t.grade;
}

function respingo(k, estilo) {
    const M = TONS_MONSTROS[estilo];
    const t = new Tela(Q, Q);
    const aneis = [
        { r: 4, gotas: 6, rg: 8, falha: 0 },
        { r: 7.5, gotas: 8, rg: 11.5, falha: 0.15 },
        { r: 11, gotas: 6, rg: 14, falha: 0.5 },
    ][k];
    // anel de espuma (achatado: é água vista de cima, meio de lado)
    t.cada(0, 0, Q - 1, Q - 1, (x, y) => {
        const dx = x + 0.5 - 16;
        const dy = (y + 0.5 - 16) * 1.25;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - aneis.r) < 0.85) {
            if (sorte(x, y, 13 + k) < aneis.falha) return null;
            return dy < 0 ? M.espuma : M.brilho;
        }
        if (k < 2 && Math.abs(d - aneis.r * 0.5) < 0.7) return M.agua;
        if (k === 0 && d < 1.5) return M.espuma;
        return null;
    });
    // gotas voando para fora
    for (let i = 0; i < aneis.gotas; i++) {
        const a = (i / aneis.gotas) * Math.PI * 2 + k * 0.4;
        const x = 16 + Math.cos(a) * aneis.rg;
        const y = 16 + (Math.sin(a) * aneis.rg) / 1.25;
        t.pinta(x, y, M.espuma);
        if (k < 2) t.pinta(x - Math.cos(a), y - Math.sin(a) / 1.25, M.brilho);
    }
    return t.grade;
}

// levando dano: o corpo vira um clarão, o contorno fica
function clarao(grade, estilo) {
    const flash = TONS_MONSTROS[estilo].flash;
    return grade.map((l) => l.map((p) => (p === 0 || p === P.contorno ? p : flash)));
}

// morrendo: a luz queima o monstro, que se desfaz em cinza e brasas
function desfazer(grade, etapa, estilo) {
    const M = TONS_MONSTROS[estilo];
    const limiar = [0.25, 0.55, 0.8][etapa]; // fração dos pedaços que já sumiu
    const t = new Tela(Q, Q);
    // o corpo quebra em pedaços de 3×3 que voam para fora do centro
    for (let by = 0; by < Q / 3 + 1; by++) {
        for (let bx = 0; bx < Q / 3 + 1; bx++) {
            if (sorte(bx, by, 7) < limiar) continue;
            const cx = bx * 3 + 1.5 - 16;
            const cy = by * 3 + 1.5 - 16;
            const d = Math.hypot(cx, cy) || 1;
            const dx = Math.round((cx / d) * (etapa + 1) * 1.7);
            const dy = Math.round((cy / d) * (etapa + 1) * 1.7);
            let temAlgo = false;
            for (let y = by * 3; y < by * 3 + 3 && y < Q; y++) {
                for (let x = bx * 3; x < bx * 3 + 3 && x < Q; x++) {
                    const p = grade[y][x];
                    if (!p) continue;
                    let cor = p === P.contorno ? M.cinza : M.cinzaClara;
                    if (etapa === 2) cor = M.cinza;
                    else if (etapa === 1 && sorte(x, y, 21) < 0.4) cor = M.cinza;
                    t.pinta(x + dx, y + dy, cor);
                    temAlgo = true;
                }
            }
            if (temAlgo && etapa < 2 && sorte(bx, by, 17) < 0.3) t.pinta(bx * 3 + 1 + dx, by * 3 + 1 + dy, etapa === 0 ? M.brasaClara : M.brasa);
        }
    }
    // brasas soltas subindo
    const r = criarAleatorio(500 + etapa);
    for (let i = 0; i < 6 - etapa * 2; i++) {
        const ang = r() * Math.PI * 2;
        const dist = 8 + etapa * 4 + r() * 4;
        t.pinta(16 + Math.cos(ang) * dist, 16 + Math.sin(ang) * dist, r() < 0.5 ? M.brasaClara : M.brasa);
    }
    return t.grade;
}

function folhaDeInimigos(estilo) {
    const folha = novaGrade(Q * 8, Q * 4);
    const quadros = [];
    const poses = ["aberto", "meio", "fechado", "meio"];
    for (let k = 0; k < 4; k++) quadros[k] = morcego(poses[k], estilo);
    quadros[4] = clarao(quadros[0], estilo);
    for (let e = 0; e < 3; e++) quadros[5 + e] = desfazer(quadros[0], e, estilo);
    for (let k = 0; k < 4; k++) quadros[8 + k] = piranha(k, estilo);
    quadros[12] = clarao(quadros[8], estilo);
    for (let e = 0; e < 3; e++) quadros[13 + e] = desfazer(quadros[8], e, estilo);
    for (let k = 0; k < 4; k++) quadros[16 + k] = serpente(k, estilo);
    quadros[20] = clarao(quadros[16], estilo);
    for (let e = 0; e < 3; e++) quadros[21 + e] = desfazer(quadros[16], e, estilo);
    quadros[24] = sombraNoChao(estilo);
    for (let k = 0; k < 3; k++) quadros[25 + k] = respingo(k, estilo);
    quadros.forEach((q, i) => carimbar(folha, q, (i % 8) * Q, Math.floor(i / 8) * Q));
    return { folha, quadros };
}

// ===========================================================================
// Kraken (4 quadros de 256×160) e tentáculo (4 quadros de 32×128)
// ===========================================================================
const KL = 256;
const KA = 160;
const LINHA_DAGUA = 128;

// tom da pele do Kraken pela normal (3 tons, com pontilhado só nas transições
// grandes) e manchas claras
const manchasDoKraken = criarRuido(83);
function peleDoKraken(K, x, y, nx, ny, comManchas = true) {
    const n2 = Math.min(1, nx * nx + ny * ny);
    const v = luzDe(nx, ny, Math.sqrt(1 - n2));
    let p;
    if (v > 0.62) p = K.cla;
    else if (v > 0.5) p = pontilhar(x, y, (v - 0.5) / 0.12) ? K.cla : K.med;
    else if (v > 0.06) p = K.med;
    else if (v > -0.1) p = pontilhar(x, y, (v + 0.1) / 0.16) ? K.med : K.esc;
    else p = K.esc;
    if (comManchas) {
        const m = manchasDoKraken(x / 7, y / 6);
        if (m > 0.67) p = p === K.cla ? K.med : p === K.med ? K.cla : K.med;
        else if (m > 0.63 && p === K.med) p = K.esc; // borda escura da mancha
    }
    return p;
}

// Pinta uma camada do Kraken: normalEm(px, py) devolve [nx, ny] dentro da
// forma ou null fora. O contorno da camada é pintado por cima do que já havia
// (assim um braço na frente do outro fica separado por uma linha escura).
function camadaDoKraken(t, K, caixa, normalEm, { manchas = true, limiteY = t.altura, tom = null } = {}) {
    const [x0, y0, x1, y1] = caixa.map(Math.round);
    const larg = x1 - x0 + 3;
    const alt = y1 - y0 + 3;
    const normais = new Array(larg * alt).fill(null);
    const idx = (x, y) => (y - y0 + 1) * larg + (x - x0 + 1);
    const dentro = (x, y) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1 && normais[idx(x, y)] !== null;
    for (let y = Math.max(0, y0); y <= Math.min(limiteY - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(t.largura - 1, x1); x++) {
            normais[idx(x, y)] = normalEm(x + 0.5, y + 0.5);
        }
    }
    for (let y = Math.max(0, y0 - 1); y <= Math.min(limiteY - 1, y1 + 1); y++) {
        for (let x = Math.max(0, x0 - 1); x <= Math.min(t.largura - 1, x1 + 1); x++) {
            if (dentro(x, y)) {
                const [nx, ny] = normais[idx(x, y)];
                t.grade[y][x] = tom ? tom(x, y, nx, ny) : peleDoKraken(K, x, y, nx, ny, manchas);
            } else if (dentro(x - 1, y) || dentro(x + 1, y) || dentro(x, y - 1) || dentro(x, y + 1)) {
                t.grade[y][x] = P.contorno;
            }
        }
    }
}

// normal de um tubo (braço) dado por amostras [x, y, raio]
function normalDoTubo(amostras) {
    return (px, py) => {
        let melhor = null;
        for (const [cx, cy, r] of amostras) {
            const dx = px - cx;
            const dy = py - cy;
            if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
            const d = Math.hypot(dx, dy);
            if (d <= r && (!melhor || d / r < melhor.n)) melhor = { n: d / r, nx: dx / r, ny: dy / r };
        }
        return melhor ? [melhor.nx, melhor.ny] : null;
    };
}

function amostrasDoTubo(pontos, r0, r1) {
    const c = curva(pontos);
    return c.map(([x, y], j) => [x, y, r0 + (r1 - r0) * Math.pow(j / (c.length - 1), 0.9)]);
}

function caixaDasAmostras(amostras) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y, r] of amostras) {
        x0 = Math.min(x0, x - r);
        y0 = Math.min(y0, y - r);
        x1 = Math.max(x1, x + r);
        y1 = Math.max(y1, y + r);
    }
    return [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
}

// ventosas ao longo de um braço, no lado virado para (alvoX, alvoY)
function ventosas(t, K, amostras, alvoX, alvoY, { a = 6, passo = 8, limiteY = t.altura, rMin = 3.6 } = {}) {
    for (let j = a; j < amostras.length - 3; j += passo) {
        const [cx, cy, r] = amostras[j];
        if (r < rMin) continue;
        const [ax, ay] = amostras[Math.max(0, j - 2)];
        const [bx, by] = amostras[Math.min(amostras.length - 1, j + 2)];
        const tl = Math.hypot(bx - ax, by - ay) || 1;
        let nx = -(by - ay) / tl;
        let ny = (bx - ax) / tl;
        if ((alvoX - cx) * nx + (alvoY - cy) * ny < 0) {
            nx = -nx;
            ny = -ny;
        }
        const sx = cx + nx * r * 0.58;
        const sy = cy + ny * r * 0.58;
        const rs = Math.max(1.5, r * 0.27);
        t.cada(sx - rs - 1, sy - rs - 1, sx + rs + 1, sy + rs + 1, (x, y) => {
            const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
            if (d > rs || y >= limiteY) return null;
            return d < rs * 0.5 ? K.esc : K.cla;
        });
    }
}

function desenharKraken(quadro, estilo) {
    const K = TONS_KRAKEN[estilo];
    const t = new Tela(KL, KA);
    const respira = quadro === 1 ? 2 : 0; // parado B: o manto incha
    const rugas = criarRuido(71);
    const [E1, E2] = OLHOS_DO_KRAKEN;
    const RO = 19; // raio do olho
    const BOLSA = 26; // raio da bolsa em volta do olho
    const LIM = LINHA_DAGUA + 3; // o corpo é pintado até aqui e cortado pela água ondulada
    // linha d'água ondulada (muda a cada quadro)
    const agua = (x) => LINHA_DAGUA - 1 + Math.round(1.6 * Math.sin(x * 0.13 + quadro * 1.4) + 1.1 * Math.sin(x * 0.31 + 2 + quadro));
    const mexe = [0, 2, -2, 3][quadro]; // os braços se mexem um pouco

    // ---- 1. braços grandes erguidos dos lados (atrás da cabeça) ----
    const bracosGrandes = [1, -1].map((lado) => {
        const cx = (x) => 128 - lado * (128 - x);
        const m = lado * mexe;
        return amostrasDoTubo(
            [
                [cx(44), 146],
                [cx(22), 122],
                [cx(10) - m * 0.3, 92],
                [cx(14) - m * 0.6, 60],
                [cx(30) - m, 40 - Math.abs(mexe) * 0.5],
                [cx(46) - m, 42],
                [cx(46) - m * 0.8, 54],
                [cx(38) - m * 0.5, 56],
            ],
            15,
            3,
        );
    });
    for (const amostras of bracosGrandes) {
        camadaDoKraken(t, K, caixaDasAmostras(amostras), normalDoTubo(amostras), { manchas: false, limiteY: LIM });
        ventosas(t, K, amostras, 128, 70, { limiteY: LIM });
    }

    // ---- 2. cabeça: manto, rosto e as bolsas dos olhos ----
    const manto = { cx: 128, cy: 60 - respira / 2, rx: 76 + respira / 2, ry: 57 + respira / 2 };
    const rosto = { cx: 128, cy: 104, rx: 94, ry: 36 };
    camadaDoKraken(t, K, [30, 0, 226, LIM], (px, py) => {
        const a = Math.atan2(py - manto.cy, px - manto.cx);
        const enrugado = 1 + 0.04 * (rugas(px / 9, py / 9) - 0.5) + 0.018 * Math.sin(a * 11);
        const mx = (px - manto.cx) / manto.rx;
        const my = (py - manto.cy) / manto.ry;
        for (const e of OLHOS_DO_KRAKEN) {
            const d = Math.hypot(px - e.x, py - e.y);
            if (d <= BOLSA) return [(px - e.x) / BOLSA, (py - e.y) / BOLSA];
        }
        if (mx * mx + my * my <= enrugado) return [mx, my];
        const rx = (px - rosto.cx) / rosto.rx;
        const ry = (py - rosto.cy) / rosto.ry;
        if (rx * rx + ry * ry <= 1) return [rx, ry * 0.6 + 0.25];
        return null;
    }, { limiteY: LIM });

    // verrugas no manto
    for (const [vx, vy, vr] of [
        [98, 22, 4],
        [150, 16, 3.5],
        [176, 38, 4.5],
        [80, 44, 3.5],
        [128, 30, 3],
        [114, 10, 3],
        [190, 60, 3],
    ]) {
        t.cada(vx - vr - 1, vy - vr - 1, vx + vr + 1, vy + vr + 1, (x, y) => {
            const nx = (x + 0.5 - vx) / vr;
            const ny = (y + 0.5 - vy) / vr;
            if (nx * nx + ny * ny > 1) return null;
            const v = luzDe(nx, ny, Math.sqrt(1 - nx * nx - ny * ny));
            return v > 0.5 ? K.cla : v > -0.1 ? K.med : K.esc;
        });
    }

    // ---- 3. sobrancelhas: cristas grossas puxadas para o meio (cara brava) ----
    for (const e of OLHOS_DO_KRAKEN) {
        const meio = e.x < 128 ? 1 : -1; // para que lado fica o meio do rosto
        const linha = (px) => e.y - RO - 1 + (px - e.x) * meio * 0.36;
        camadaDoKraken(t, K, [e.x - RO - 10, e.y - RO - 18, e.x + RO + 10, e.y + 4], (px, py) => {
            const dx = px - e.x;
            const alcance = dx * meio > 0 ? RO + 8 : RO + 4; // vai mais longe para o meio
            if (Math.abs(dx) > alcance) return null;
            const grossura = 5 * (1 - Math.pow(Math.abs(dx) / alcance, 2.5));
            const dy = py - linha(px);
            if (Math.abs(dy) > grossura) return null;
            return [dx / (RO + 10), dy / Math.max(1, grossura)];
        }, { manchas: false });
    }

    // ---- 4. boca: buraco escuro com o bico aparecendo ----
    camadaDoKraken(t, K, [106, 92, 150, LIM], (px, py) => {
        const nx = (px - 128) / 18;
        const ny = (py - 114) / 22;
        return nx * nx + ny * ny <= 1 && py > 94 ? [nx, ny] : null;
    }, { limiteY: LIM, tom: () => P.contorno });
    camadaDoKraken(t, K, [118, 98, 138, 124], (px, py) => {
        // bico: triângulo apontando para baixo
        const dy = py - 102;
        const meia = 6 * Math.pow(1 - dy / 16, 0.7);
        if (dy < 0 || dy > 16 || Math.abs(px - 128 - dy * 0.12) > meia) return null;
        return [(px - 128) / 7, dy / 16 - 0.3];
    }, { manchas: false, tom: (x, y, nx) => (nx < -0.2 ? K.cla : Math.abs(nx) < 0.08 ? K.esc : K.med) });

    // ---- 5. barba de tentáculos descendo para a água ----
    const barba = [62, 80, 98, 113, 143, 158, 176, 194];
    barba.forEach((bx, i) => {
        const c = i % 2 === 0 ? 1 : -1;
        const ondula = mexe * (i % 3 === 0 ? 0.6 : -0.4);
        const y0 = 92 + Math.abs(bx - 128) * 0.12;
        const amostras = amostrasDoTubo(
            [
                [bx, y0],
                [bx + c * 3 + ondula, y0 + 12],
                [bx - c * 2 - ondula, y0 + 26],
                [bx + c * 2, y0 + 44],
            ],
            bx === 113 || bx === 143 ? 6.5 : 7.5,
            3,
        );
        camadaDoKraken(t, K, caixaDasAmostras(amostras), normalDoTubo(amostras), { manchas: false, limiteY: LIM });
        ventosas(t, K, amostras, 128, 200, { a: 10, passo: 9, limiteY: LIM, rMin: 5 });
    });

    // ---- 6. olhos enormes ----
    const abertura = { 0: -0.12, 1: -0.02, 2: -0.86, 3: null }[quadro]; // altura da pálpebra (fração do raio)
    for (const e of OLHOS_DO_KRAKEN) {
        const meio = e.x < 128 ? 1 : -1;
        if (quadro === 2) {
            // brilho em volta do olho aberto (pontilhado sobre a pele)
            t.cada(e.x - RO - 10, e.y - RO - 10, e.x + RO + 10, e.y + RO + 10, (x, y) => {
                const d = Math.hypot(x + 0.5 - e.x, y + 0.5 - e.y);
                if (d <= RO + 1.5 || d > RO + 9 || !t.le(x, y) || t.le(x, y) === P.contorno) return null;
                return pontilhar(x, y, (1 - (d - RO - 1.5) / 7.5) * 0.6) ? K.olho : null;
            });
        }
        t.cada(e.x - RO - 2, e.y - RO - 2, e.x + RO + 2, e.y + RO + 2, (x, y) => {
            const dx = x + 0.5 - e.x;
            const dy = y + 0.5 - e.y;
            const d = Math.hypot(dx, dy);
            if (d > RO + 1.3) return null;
            if (d > RO) return P.contorno; // órbita
            const nx = dx / RO;
            const ny = dy / RO;
            const pele = () => {
                const v = luzDe(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)));
                return v > 0.42 ? K.cla : v > -0.05 ? K.med : K.esc;
            };
            if (abertura === null) {
                // dano: olho espremido, pálpebras fechadas com vincos
                const vinco1 = Math.abs(dy - (-1 + Math.abs(dx) * 0.22)) < 0.75;
                const vinco2 = Math.abs(dy - (5 + Math.abs(dx) * 0.28)) < 0.65 && Math.abs(dx) < RO - 5;
                if ((vinco1 && Math.abs(dx) < RO - 1.5) || vinco2) return P.contorno;
                return pele();
            }
            // pálpebra de cima inclinada: mais baixa do lado do meio do rosto
            const palpebra = abertura * RO + dx * meio * 0.38;
            if (dy < palpebra) {
                if (dy > palpebra - 1.3) return P.contorno;
                if (dy > palpebra - 3) return K.cla; // beirada grossa da pálpebra
                return pele();
            }
            // pálpebra de baixo
            const baixo = quadro === 2 ? RO * 0.9 : RO * 0.66 - dx * meio * 0.1;
            if (dy > baixo) return dy < baixo + 1.2 ? P.contorno : pele();
            // pupila em fenda vertical
            const pw = quadro === 2 ? 1.7 : 2.6;
            const ph = RO - 1;
            if (Math.abs(dx) <= pw * Math.sqrt(Math.max(0, 1 - (dy / ph) ** 2))) return P.contorno;
            // reflexo
            const topoVisivel = Math.max(palpebra, -RO);
            if (dx < -6 && dx > -10 && dy > topoVisivel + 1 && dy < topoVisivel + 4) return K.brilhoOlho;
            // íris: anel escuro, miolo claro em volta da fenda
            if (d > RO - 2.4) return K.olho;
            if (Math.abs(dx) < 7 || quadro === 2) return K.olhoClaro;
            return K.olho;
        });
    }

    // contorno geral e reflexo da lua na borda de cima
    let g = contornar(t.grade, P.contorno, K.borda);
    for (let x = 0; x < KL; x++) for (let y = agua(x); y < KA; y++) g[y][x] = 0;

    // dano: o corpo inteiro clareia um tom
    if (quadro === 3) g = trocarPapeis(g, { [K.esc]: K.med, [K.med]: K.cla, [K.cla]: K.flash });

    // ---- água: corpo submerso, reflexo, marolas e espuma ----
    const tela = new Tela(KL, KA);
    tela.grade = g;
    const noCorpo = (x) => !!(g[agua(x) - 1][x] || g[agua(x) - 2][x]);
    // sombra do corpo embaixo d'água
    tela.cada(0, LINHA_DAGUA, KL - 1, KA - 1, (x, y) => {
        const px = x + 0.5;
        const py = y + 0.5;
        if (y <= agua(x) + 1) return null;
        const dentro = ((px - 128) / 112) ** 2 + ((py - (LINHA_DAGUA - 6)) / 34) ** 2 <= 1;
        if (!dentro) return null;
        const fundo = (py - LINHA_DAGUA) / (KA - LINHA_DAGUA);
        return pontilhar(x, y, 0.5 - fundo * 0.45) ? K.esc : null;
    });
    // reflexo do brilho dos olhos
    if (quadro === 2) {
        for (const e of OLHOS_DO_KRAKEN) {
            for (let y = LINHA_DAGUA + 4; y < KA - 3; y += 3) {
                const meia = 7 - (y - LINHA_DAGUA) * 0.16 + (sorte(e.x, y, 2) - 0.5) * 3;
                const cx = e.x + (sorte(e.x, y, 4) - 0.5) * 4;
                for (let x = Math.round(cx - meia); x <= Math.round(cx + meia); x++) tela.pinta(x, y, K.olho);
            }
        }
    }
    // marolas: arcos quebrados que se afastam a cada quadro
    const afasta = [0, 4, 8, 2][quadro];
    [112, 130, 150, 172].forEach((rx, i) => {
        const raio = rx + afasta;
        const ry = 8 + i * 6 + afasta * 0.5;
        for (let x = 0; x < KL; x++) {
            const u = (x + 0.5 - 128) / raio;
            if (Math.abs(u) > 1) continue;
            const y = Math.round(LINHA_DAGUA + 2 + ry * Math.sqrt(1 - u * u) * 0.9);
            if (y >= KA) continue;
            if (sorte(Math.floor(x / 5), i, 30 + quadro) < 0.35) continue;
            tela.pinta(x, y, i === 0 || sorte(x, y, 31) < 0.3 ? K.espuma : K.agua);
        }
    });
    // espuma onde o corpo entra na água, e espuma subindo no corpo
    for (let x = 0; x < KL; x++) {
        if (!noCorpo(x)) continue;
        const n = sorte(Math.floor(x / 3), quadro, 40);
        const a = agua(x);
        tela.pinta(x, a, K.espuma);
        if (n > 0.25) tela.pinta(x, a + 1, K.espuma);
        if (n > 0.7) tela.pinta(x, a + 2, K.agua);
        if (n > 0.8) tela.pinta(x, a - 1, K.espuma);
        if (n > 0.93) tela.pinta(x, a - 2, K.espuma);
    }
    // gotas pulando da linha d'água
    const gotas = criarAleatorio(300 + quadro);
    for (let i = 0; i < 18; i++) {
        const x = Math.round(24 + gotas() * 208);
        const y = Math.round(agua(x) - 2 - gotas() * 5);
        if (!noCorpo(x) || g[y][x]) {
            if (!g[y][x]) tela.pinta(x, y, K.espuma);
        }
    }
    // respingos do dano
    if (quadro === 3) {
        const r = criarAleatorio(909);
        for (let i = 0; i < 30; i++) {
            const x = 20 + r() * 216;
            const y = LINHA_DAGUA - 3 - r() * 22;
            if (t.le(Math.round(x), Math.round(y))) continue;
            tela.pinta(x, y, K.espuma);
            tela.pinta(x, y + 1, K.agua);
        }
    }
    return tela.grade;
}

function desenharTentaculo(k, estilo) {
    const K = TONS_KRAKEN[estilo];
    const t = new Tela(32, 128);
    const fase = (k * Math.PI) / 2;
    // linha do meio ondulando (a onda desce), ponta enrolando
    const pontos = [];
    for (let y = -6; y <= 122; y += 4) {
        const amp = 1.5 + 5 * (Math.max(0, y) / 122);
        pontos.push([16 + amp * Math.sin(y * 0.07 - fase), y]);
    }
    const ultimo = pontos[pontos.length - 1];
    const enrola = Math.cos(fase) >= 0 ? 1 : -1;
    pontos.push([ultimo[0] + enrola * 3, 126]);
    pontos.push([ultimo[0] + enrola * 5.5, 123]);
    const amostras = amostrasDoTubo(pontos, 9.5, 1.2);
    camadaDoKraken(t, K, [0, 0, 31, 127], normalDoTubo(amostras), {
        tom: (x, y, nx, ny) => {
            let p = peleDoKraken(K, x, y, nx, ny * 0.3, false);
            if (manchasDoKraken(x / 4, y / 5) > 0.7 && p === K.med && Math.abs(nx) < 0.5) p = K.cla;
            return p;
        },
    });
    ventosas(t, K, amostras, 40, 64, { a: 6, passo: 7, rMin: 3 });
    // o topo continua fora do quadro: sem contorno em cima
    const g = contornar(t.grade, P.contorno, K.borda);
    return g;
}

// ===========================================================================
// Prévias
// ===========================================================================
// mar aberto com ondas, para fundo de prévia
function marDeFundo(largura, altura, estilo, semente = 5) {
    const T = TONS_ILHA[estilo];
    const g = novaGrade(largura, altura).map((l) => l.fill(T.fundo));
    const r = criarAleatorio(semente);
    for (let y = 2; y < altura; y += 4 + Math.floor(r() * 3)) {
        for (let i = 0; i < largura / 40; i++) {
            const x = Math.floor(r() * largura);
            const comp = 3 + Math.floor(r() * 5);
            for (let j = 0; j < comp && x + j < largura; j++) g[y][x + j] = T.onda;
            if (r() < 0.3) g[y - 1][Math.min(largura - 1, x + 1)] = T.crista;
        }
    }
    return g;
}

function gramaDeFundo(largura, altura, estilo) {
    const T = TONS_ILHA[estilo];
    const g = novaGrade(largura, altura).map((l) => l.fill(T.grama));
    const r = criarAleatorio(8);
    for (let i = 0; i < (largura * altura) / 60; i++) {
        const x = 1 + Math.floor(r() * (largura - 2));
        const y = 1 + Math.floor(r() * (altura - 1));
        const claro = r() < 0.4;
        g[y][x] = T.gramaEscura;
        g[y - 1][x - 1] = claro ? T.gramaClara : T.gramaEscura;
        g[y - 1][x + 1] = claro ? T.gramaClara : T.gramaEscura;
    }
    return g;
}

function transpor(grade) {
    return grade[0].map((_, x) => grade.map((l) => l[x]));
}

function girarHorario(grade) {
    // 90° no sentido horário: olhando para a direita -> olhando para baixo
    return transpor(grade).map((l) => [...l].reverse());
}

function girarAntiHorario(grade) {
    return transpor(grade).reverse();
}

function espelhar(grade) {
    return grade.map((l) => [...l].reverse());
}

// ===========================================================================
// Geração
// ===========================================================================
for (const estilo of ORDEM_DOS_ESTILOS) {
    // ilha
    const { grade: ilha } = desenharIlha(estilo);
    const imgIlha = gradeParaImagem(ilha, estilo);
    imgIlha.salvar(`public/data/img/farol-ilha-${estilo}.png`);

    // topo do farol
    const topo = novaGrade(128, 64);
    const apagado = desenharTopo(false, estilo);
    const aceso = desenharTopo(true, estilo);
    carimbar(topo, apagado, 0, 0);
    carimbar(topo, aceso, 64, 0);
    gradeParaImagem(topo, estilo).salvar(`public/data/img/farol-topo-${estilo}.png`);

    // monstros
    const { folha, quadros } = folhaDeInimigos(estilo);
    gradeParaImagem(folha, estilo).salvar(`public/data/img/inimigos-mar-${estilo}.png`);

    // Kraken e tentáculo
    const kraken = novaGrade(KL * 4, KA);
    const krakens = [0, 1, 2, 3].map((q) => desenharKraken(q, estilo));
    krakens.forEach((q, i) => carimbar(kraken, q, i * KL, 0));
    gradeParaImagem(kraken, estilo).salvar(`public/data/img/kraken-${estilo}.png`);
    const tentaculo = novaGrade(128, 128);
    const tentaculos = [0, 1, 2, 3].map((k) => desenharTentaculo(k, estilo));
    tentaculos.forEach((q, i) => carimbar(tentaculo, q, i * 32, 0));
    gradeParaImagem(tentaculo, estilo).salvar(`public/data/img/tentaculo-${estilo}.png`);

    // ---- prévia da tela do chefe: ilha, farol aceso, monstros e o Kraken ----
    const cena = ilha.map((l) => l.slice());
    carimbar(cena, krakens[2], 192, 0);
    carimbar(cena, tentaculos[1], 236, 150);
    carimbar(cena, tentaculos[3], 372, 160);
    carimbar(cena, aceso, FAROL.x - 32, FAROL.y - 32);
    // morcegos com sombra (indo até o farol)
    for (const [x, y, q, giro] of [
        [150, 230, 0, null],
        [470, 250, 1, "esq"],
        [250, 300, 2, null],
        [420, 330, 0, "esq"],
    ]) {
        carimbar(cena, quadros[24], x + 6, y + 14);
        let m = quadros[q];
        if (giro === "esq") m = espelhar(m);
        carimbar(cena, m, x, y);
    }
    // piranhas no mar, serpente nadando em volta
    for (const [x, y, q, giro] of [
        [70, 260, 8, null],
        [96, 284, 9, null],
        [560, 380, 10, "esq"],
        [585, 350, 11, "esq"],
        [180, 440, 13, null],
    ]) {
        let m = quadros[q];
        if (giro === "esq") m = espelhar(m);
        carimbar(cena, m, x, y);
    }
    carimbar(cena, girarHorario(quadros[16]), 580, 210);
    carimbar(cena, espelhar(quadros[18]), 420, 440);
    carimbar(cena, quadros[26], 110, 330);
    carimbar(cena, quadros[4], 300, 200);
    gradeParaImagem(cena, estilo).salvar(`previas/previa-farol-${estilo}.png`);

    // ---- prévia dos monstros: folha 4× sobre o mar (em cima) e a grama (embaixo) ----
    const sobreMar = marDeFundo(256, 128, estilo);
    carimbar(sobreMar, folha, 0, 0);
    const sobreGrama = gramaDeFundo(256, 128, estilo);
    carimbar(sobreGrama, folha, 0, 0);
    const pm = ampliar(gradeParaImagem(sobreMar, estilo), 4);
    const pg = ampliar(gradeParaImagem(sobreGrama, estilo), 4);
    const previaMonstros = new Imagem(1024, 1024 + 8);
    previaMonstros.colar(pm, 0, 0);
    previaMonstros.colar(pg, 0, 512 + 8);
    previaMonstros.salvar(`previas/previa-inimigos-mar-${estilo}.png`);

    // ---- prévia do Kraken: 4 quadros 2× em grade e os tentáculos ----
    const fundoK = marDeFundo(652, 324, estilo, 9);
    krakens.forEach((q, i) => carimbar(fundoK, q, (i % 2) * 260, Math.floor(i / 2) * 164));
    carimbar(fundoK, tentaculo, 522, 4);
    ampliar(gradeParaImagem(fundoK, estilo), 2).salvar(`previas/previa-kraken-${estilo}.png`);
}
console.log(`arte do farol gerada; farol em (${FAROL.x}, ${FAROL.y}); olhos do Kraken em (96, 70) e (160, 70)`);
