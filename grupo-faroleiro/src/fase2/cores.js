import { estiloAtual } from "../systems/estilo.js";

// Cores de tempo de execução da Fase 2, uma tabela por estilo (as cores da
// arte ficam nos PNG; estas são as do que o jogo desenha por código: facho,
// noite, mar vivo, interface da fase). Strings CSS opacas: a opacidade vem
// de quem desenha.
const CORES = {
    mare: {
        // escuridão da noite sobre a ilha
        noite: "#070a14",
        // facho: guia tênue, disparo e o miolo do disparo
        facho: "#ffcf8a",
        fachoForte: "#ffe7a3",
        fachoMiolo: "#fff8e0",
        // halo do farol
        halo: "#ffcf8a",
        // arco de recarga: apagado, enchendo e pronto
        arcoVazio: "#2a3a52",
        arcoCheio: "#f2a541",
        arcoPronto: "#ffe7a3",
        // espuma e brilhos do mar
        espuma: "#7fd1d8",
        brilho: "#d8f5ff",
        // flash de dano na torre
        dano: "#b0282a",
        // barra de vida da torre e do mini-chefe
        vidaTorre: "#c2413b",
        vidaChefe: "#f2a541",
        // contorno e halo do mini-chefe
        contorno: "#fff1b8",
        haloChefe: "#f2a541",
        // anel de alerta (piranha prestes a saltar)
        alerta: "#c2413b",
        // brilho da engrenagem voando
        engrenagem: "#ffe7a3",
    },
};

// Cores da Fase 2 no estilo atual.
export function coresDaFase2() {
    return CORES[estiloAtual()] ?? CORES.mare;
}
