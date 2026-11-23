import { desenharIconeDaMelhoria } from "../fase2/PainelMelhorias.js";
import { partida } from "../systems/partida.js";
import { BAU } from "./config.js";

// Cartas do baú do mini-chefe e das peças da praia (conserto da torre): ao
// abrir o baú ou pegar a peça, o jogo para e o painel de cartas
// (src/fase2/PainelMelhorias.js) mostra as que ainda não chegaram ao
// máximo. O efeito fica em partida (bateriaExtra, danoExtra), que a
// lanterna (src/fase1/lanterna.js) lê, e volta com o ponto de retorno.
// Os valores ficam em BAU.cartas (src/fase1/config.js).

// ícones da folha de itens (itens-<estilo>.png)
const ICONE_BATERIA = 10;
const ICONE_LENTE = 5;

const cBateria = BAU.cartas.bateria;
const cDano = BAU.cartas.dano;

// Cartas no formato do painel: `linhas` já quebradas, `maximo` para os
// quadradinhos de nível, `desenharIcone(renderer, x, y, tamanho)`.
export const CARTAS_DO_BAU = [
    {
        id: "bateria",
        nome: "Bateria maior",
        linhas: [`+${cBateria.passo} s de bateria`, "e bateria cheia."],
        maximo: cBateria.maximo,
        desenharIcone(renderer, x, y, tamanho) {
            desenharIconeDaMelhoria(renderer, { icone: ICONE_BATERIA }, x, y, tamanho);
        },
    },
    {
        id: "dano",
        nome: "Luz forte",
        linhas: [`+${Math.round(cDano.fator * 100)}% de dano`, "da lanterna."],
        maximo: cDano.maximo,
        desenharIcone(renderer, x, y, tamanho) {
            desenharIconeDaMelhoria(renderer, { icone: ICONE_LENTE }, x, y, tamanho);
        },
    },
];

const POR_ID = new Map(CARTAS_DO_BAU.map((c) => [c.id, c]));

export function cartaDoBau(id) {
    return POR_ID.get(id);
}

// Quantas vezes a carta já foi pega nesta partida (0 a maximo).
export function nivelDaCarta(id) {
    if (id === "bateria") {
        return Math.round(partida.bateriaExtra / cBateria.passo);
    }
    if (id === "dano") {
        return Math.round(partida.danoExtra / cDano.fator);
    }
    return 0;
}

// As cartas que ainda não chegaram ao máximo (vazia: o painel não abre).
export function cartasDisponiveis() {
    return CARTAS_DO_BAU.filter((c) => nivelDaCarta(c.id) < c.maximo);
}

// Aplica a carta `id`: Bateria maior soma à bateria máxima e enche a
// lanterna da fase (se houver); Luz forte soma ao dano.
export function aplicarCartaDoBau(id, lanterna = null) {
    if (id === "bateria") {
        partida.bateriaExtra = Math.min(cBateria.passo * cBateria.maximo, partida.bateriaExtra + cBateria.passo);
        lanterna?.encher();
    } else if (id === "dano") {
        // arredonda para não acumular 0,30000000000000004
        const novo = Math.min(cDano.fator * cDano.maximo, partida.danoExtra + cDano.fator);
        partida.danoExtra = Math.round(novo * 1000) / 1000;
    } else {
        throw new Error(`cartas do baú: carta desconhecida "${id}"`);
    }
}

