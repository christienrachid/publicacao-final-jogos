import { event, input, state } from "melonjs";
import { CONFIG } from "../config.js";
import { irParaEtapa, partida, perder, vencer } from "./partida.js";
import { minutosDe, relogio } from "./relogio.js";

// Modo de teste: com ?debug na URL, as teclas 0 a 6
// pulam horas, trocam de fase e forçam vitória ou derrota. FaseBase cria um
// destes quando CONFIG.debug é verdadeiro; fora do modo de teste nada liga.

const K = input.KEY;
// teclas da fileira de números e do teclado numérico
const TECLA = {
    [K.NUM0]: 0,
    [K.NUM1]: 1,
    [K.NUM2]: 2,
    [K.NUM3]: 3,
    [K.NUM4]: 4,
    [K.NUM5]: 5,
    [K.NUM6]: 6,
    [K.NUMPAD0]: 0,
    [K.NUMPAD1]: 1,
    [K.NUMPAD2]: 2,
    [K.NUMPAD3]: 3,
    [K.NUMPAD4]: 4,
    [K.NUMPAD5]: 5,
    [K.NUMPAD6]: 6,
};

// Texto curto das teclas, mostrado no rodapé da fase.
export const DICA_DEPURACAO = "1 +1h · 2 21h50 · 3 Fase 2 · 4 4h50 · 5 vitória · 6 derrota · 0 invencível";

export class Depuracao {
    // fase: a Stage da fase (FaseBase), para saber em que estado está e
    // avisar pulos de tempo (fase.aoPularTempo)
    constructor(fase, estadoDaFase) {
        this.fase = fase;
        this.estadoDaFase = estadoDaFase;
        this.seguradas = new Set();
        this.aoTeclar = this.aoTeclar.bind(this);
        this.aoSoltar = this.aoSoltar.bind(this);
    }

    ligar() {
        if (!CONFIG.debug) {
            return;
        }
        event.on(event.KEYDOWN, this.aoTeclar);
        event.on(event.KEYUP, this.aoSoltar);
    }

    desligar() {
        event.off(event.KEYDOWN, this.aoTeclar);
        event.off(event.KEYUP, this.aoSoltar);
        this.seguradas.clear();
    }

    aoSoltar(_acao, codigo) {
        this.seguradas.delete(codigo);
    }

    aoTeclar(_acao, codigo) {
        const tecla = TECLA[codigo];
        if (tecla === undefined || this.seguradas.has(codigo)) {
            return;
        }
        this.seguradas.add(codigo);
        // com a pausa aberta, nada muda
        if (state.isPaused()) {
            return;
        }
        this.executar(tecla);
    }

    executar(tecla) {
        const naFase2 = this.estadoDaFase === "fase2";
        switch (tecla) {
            case 1:
                relogio.avancar(60);
                this.fase.aoPularTempo?.();
                break;
            case 2:
                if (naFase2) {
                    irParaEtapa("fase1", { inicio: minutosDe(21, 50) });
                } else {
                    relogio.definir(minutosDe(21, 50));
                    this.fase.aoPularTempo?.();
                }
                break;
            case 3:
                partida.lente = true;
                irParaEtapa("fase2");
                break;
            case 4:
                if (naFase2) {
                    relogio.definir(minutosDe(4, 50));
                    this.fase.aoPularTempo?.();
                } else {
                    partida.lente = true;
                    irParaEtapa("fase2", { inicio: minutosDe(4, 50) });
                }
                break;
            case 5:
                vencer();
                break;
            case 6:
                perder("Derrota de teste");
                break;
            case 0:
                partida.invencivel = !partida.invencivel;
                break;
            default:
                break;
        }
    }
}
