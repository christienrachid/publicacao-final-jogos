import { estiloAtual } from "../../systems/estilo.js";

// Cores de tempo de execução do Kraken por estilo: os anéis, a abertura e o
// aviso de chegada, o brilho dos olhos, a espuma, o clarão do fim e os
// tentáculos do minigame. Tiradas da paleta do estilo
// (tools/arte/paletas.mjs). Strings CSS opacas: a opacidade vem de quem
// desenha.
const CORES = {
    mare: {
        // corpo do anel, contorno escuro e as contas claras
        anel: "#9b4f7a",
        anelEscuro: "#2a1028",
        anelClaro: "#d07aa8",
        // abertura e o aviso "facho na abertura"
        abertura: "#ffe7a3",
        // aviso "facho fora da abertura" e o anel quebrando
        alerta: "#c2413b",
        // brilho dos olhos abertos e das queimaduras
        olho: "#ffcf8a",
        espuma: "#d8f5ff",
        clarao: "#fff8e0",
        // tentáculos: corpo, faixa da folga, trecho queimado e círculo de partida
        tentaculo: "#9b4f7a",
        faixa: "#7fd1d8",
        brasa: "#f2a541",
        partida: "#ffe7a3",
    },
};

// Cores do Kraken no estilo atual.
export function coresDoKraken() {
    return CORES[estiloAtual()] ?? CORES.mare;
}
