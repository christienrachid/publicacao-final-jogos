import { minutosDe } from "../systems/relogio.js";
import { estiloAtual } from "../systems/estilo.js";

// Cores de tempo de execução da Fase 1, uma tabela por estilo: o céu pintado
// por código (cores-chave por hora, interpoladas), o mar ao fundo, a cor
// das ilhas distantes e das nuvens (tinta multiplicada) e a luz da lua.
//
// Cada chave tem a hora (minutos da noite) e:
//   ceu     paradas [altura acima do horizonte (px do mundo), cor], de baixo
//           para cima; entre duas paradas o céu fica liso e termina num
//           pontilhado de uma cor para a outra
//   mar     [cor de cima, cor de baixo] do mar ao fundo
//   espuma  pontinhos de brilho nas ondas do mar ao fundo
//   ilhas   tinta das ilhas distantes (fundo-ilhas); à noite bem escura,
//           só a silhueta: as luzes da ilha recortam a escuridão por cima
//           do céu e revelam a cor de verdade
//   nuvens  tinta das nuvens (a folha é do pôr do sol, laranja)
//   nuvensAlfa  opacidade das nuvens: some quase toda à noite
//
// `misturar`: "cor" mistura as cores de duas chaves; "pontilhado" troca uma
// pela outra num pontilhado, para paletas que não podem misturar cores.
// `luar`: cor da lua, das estrelas e do reflexo na água.

const H = minutosDe;

export const CORES_FASE1 = {
    mare: {
        misturar: "cor",
        luar: "#d8f5ff",
        brilhoDoSol: "#ffe7a3",
        chaves: [
            {
                hora: H(18),
                ceu: [[0, "#f39a52"], [36, "#d9613f"], [96, "#a24a5e"], [170, "#5a2d5c"], [270, "#2e2350"]],
                mar: ["#4a5c86", "#1f3a5a"],
                espuma: "#ffc98a",
                ilhas: "#ffffff",
                nuvens: "#ffffff",
                nuvensAlfa: 1,
            },
            {
                hora: H(18, 30),
                ceu: [[0, "#e0704a"], [40, "#b04e58"], [104, "#6a3060"], [190, "#352656"], [290, "#1f1a40"]],
                mar: ["#3f4c78", "#1a3050"],
                espuma: "#f2a07a",
                ilhas: "#e6d0dc",
                nuvens: "#f0c8c8",
                nuvensAlfa: 1,
            },
            {
                hora: H(19),
                ceu: [[0, "#a8506a"], [44, "#6e3a66"], [116, "#3e2c5e"], [210, "#262250"], [310, "#191840"]],
                mar: ["#34406a", "#162a48"],
                espuma: "#c88aa0",
                ilhas: "#b8a8c8",
                nuvens: "#c898b0",
                nuvensAlfa: 0.8,
            },
            {
                hora: H(19, 30),
                ceu: [[0, "#5e4a86"], [56, "#3e3a72"], [150, "#2a2a5e"], [260, "#1c1e48"]],
                mar: ["#2e3c68", "#142846"],
                espuma: "#9aa8d0",
                ilhas: "#6a6a98",
                nuvens: "#8c88b0",
                nuvensAlfa: 0.4,
            },
            {
                hora: H(20, 30),
                ceu: [[0, "#4a5c98"], [70, "#36447e"], [170, "#28306a"], [290, "#1c2252"]],
                mar: ["#2c4472", "#142a4c"],
                espuma: "#a8d0e0",
                ilhas: "#3a4270",
                nuvens: "#40466e",
                nuvensAlfa: 0.14,
            },
        ],
    },
};

// Cores do que a jogabilidade da Fase 1 desenha por código (peças, baú,
// mini-chefes), uma tabela por estilo, iguais às da Fase 2 (src/fase2/cores.js).
//   feixe      feixe de luz vertical e brilho em volta da peça e do baú
//   miolo      miolo claro do feixe
//   contorno   contorno brilhante do mini-chefe
//   halo       halo do mini-chefe
//   vidaChefe  barra de vida do mini-chefe
//   olhoFantasma  olhos do pirata fantasma no escuro (papel fantasmaClaro);
//              os do caranguejo e da alma usam jogo.olho de src/estilos.js
//   minimapa   cores do minimapa do HUD (terra, jogador, inimigo, vampiro, lapide,
//              coracao, bau, contorno, vista); a peça usa a cor do feixe
//   vidaBaixa  moldura vermelha que pulsa com 1 coração
const CORES_DO_JOGO = {
    mare: { feixe: "#ffcf8a", miolo: "#ffe7a3", contorno: "#fff1b8", halo: "#f2a541", vidaChefe: "#f2a541", olhoFantasma: "#a8ffe0", vidaBaixa: "#b0282a",
        minimapa: { terra: "#6b5a4a", jogador: "#ffffff", inimigo: "#e0403a", vampiro: "#a070e0", lapide: "#9a9a9a", coracao: "#ff8ab0", bau: "#ffd23a", contorno: "#fff1b8", vista: "#ffffff" },
    },
};

// Cores do jogo da Fase 1 no estilo atual.
export function coresDoJogoFase1() {
    return CORES_DO_JOGO[estiloAtual()] ?? CORES_DO_JOGO.mare;
}