import { Stage, state } from "melonjs";

// Passagem vazia para recomeçar a stage atual: state.change para o estado
// em que o jogo já está não faz nada, então partida.js vem para cá (sem
// transição) e daqui volta ao estado pedido, com o fade de sempre.
export class RecargaStage extends Stage {
    onResetEvent(_app, { estado, args = [] } = {}) {
        state.change(estado, false, ...args);
    }
}
