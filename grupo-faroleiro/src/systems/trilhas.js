// Trilhas gravadas do jogo, tocadas por src/systems/som.js. Só dados.
//
// Cada música do jogo (nome em src/systems/musicas.js) pode ser trocada por
// uma trilha em arquivo. As que não aparecem em TRILHA_DA_MUSICA continuam
// sintetizadas, e a sintetizada também vale de reserva se o arquivo não carregar.

// arquivos em public/data/audio/; volume (0 a 1) iguala a altura das trilhas
export const TRILHAS = {
    interludio: { arquivo: "data/audio/interludio.mp3", volume: 0.55 },
    rafael: { arquivo: "data/audio/ost-rafael.mp3", volume: 1 },
};

// Qual trilha toca em cada música. Trilha igual em músicas seguidas continua
// sem reiniciar (menu → Fase 1, e o Holandês dentro da Fase 1).
export const TRILHA_DA_MUSICA = {
    menu: "interludio",
    fase1: "interludio",
    holandes: "interludio",
    fase2: "rafael",
    kraken: "rafael",
};

// música sintetizada que toca enquanto o jogo está pausado
export const MUSICA_DA_PAUSA = "menu";
