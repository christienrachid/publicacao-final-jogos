import { state } from "melonjs";

// Ids dos estados do jogo. Só os números: quem
// registra cada Stage é o main.js.
export const ESTADOS = {
    // menu, opções e créditos (src/stages/MenuStage.js)
    MENU: state.MENU,
    // Fase 1, a ilha de lado (src/stages/Fase1Stage.js)
    FASE1: state.PLAY,
    // Fase 2, o farol visto de cima (src/stages/Fase2Stage.js)
    FASE2: state.USER + 0,
    // vitória ou derrota (src/stages/FimStage.js)
    FIM: state.GAMEOVER,
    // passagem vazia para recomeçar a stage atual (state.change para o
    // estado atual não faz nada; ver src/systems/partida.js)
    RECARGA: state.USER + 1,
};
