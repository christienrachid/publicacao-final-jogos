import { partida } from "../systems/partida.js";
import { ENERGIA, MELHORIA } from "./config.js";

// Melhorias do farol: a barra de energia
// cheia abre o painel de escolha (src/fase2/PainelMelhorias.js) com três
// cartas sorteadas desta lista. O nível de cada uma fica em
// partida.melhorias, para o ponto de retorno do Kraken guardar; o facho
// (src/fase2/facho.js) e os monstros leem os efeitos pelas funções daqui.
// Os valores ficam em MELHORIA (src/fase2/config.js).

// número com vírgula decimal: 0.1 → "0,1"
function numero(valor) {
    return String(valor).replace(".", ",");
}

// `icone`: ícone da folha de itens (src/ui/Hud.js); `dobrado` desenha o
// ícone duas vezes, lado a lado. `linhas`: o texto da carta, já quebrado.
export const MELHORIAS = [
    {
        id: "reparo",
        nome: "Reparo",
        linhas: [`Cura ${Math.round(MELHORIA.reparo * 100)}% da`, "vida do farol."],
        icone: 0,
        maximo: Infinity,
    },
    {
        id: "muralha",
        nome: "Muralha",
        linhas: [`+${MELHORIA.muralhaVida} de vida`, `máxima, cura ${MELHORIA.muralhaCura}.`],
        icone: 1,
        maximo: 3,
    },
    {
        id: "lente",
        nome: "Lente larga",
        linhas: [`Facho ${MELHORIA.lente} graus`, "mais aberto."],
        icone: 5,
        maximo: 3,
    },
    {
        id: "mecanismo",
        nome: "Mecanismo",
        linhas: [`Recarga ${Math.round(MELHORIA.mecanismo * 100)}%`, "mais rápida."],
        icone: 11,
        maximo: 3,
    },
    {
        id: "pavio",
        nome: "Pavio longo",
        linhas: [`Disparo ${numero(MELHORIA.pavio)} s`, "mais longo."],
        icone: 3,
        maximo: 3,
    },
    {
        id: "duplo",
        nome: "Facho duplo",
        linhas: ["Outro facho atrás,", `com ${Math.round(MELHORIA.duplo * 100)}% do dano.`],
        icone: 5,
        dobrado: true,
        maximo: 1,
    },
    {
        id: "queima",
        nome: "Luz que queima",
        linhas: [`Quem a luz toca fica ${Math.round((1 - MELHORIA.lentidao) * 100)}%`, `mais lento ${numero(MELHORIA.queima)} s.`],
        icone: 13,
        maximo: 1,
    },
];

const POR_ID = new Map(MELHORIAS.map((m) => [m.id, m]));

export function melhoria(id) {
    return POR_ID.get(id);
}

// Nível atual de uma melhoria (0 = não pegou).
export function nivelDe(id) {
    return partida.melhorias[id] ?? 0;
}

// Até `quantidade` melhorias sorteadas, sem as que chegaram ao máximo.
export function sortearCartas(quantidade = 3) {
    const lista = MELHORIAS.filter((m) => nivelDe(m.id) < m.maximo);
    for (let i = lista.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista.slice(0, quantidade);
}

// Faíscas para encher a barra do nível `nivel` (0 = a primeira barra).
export function capacidadeDaEnergia(nivel = partida.nivelEnergia) {
    const media = (ENERGIA.faiscas[0] + ENERGIA.faiscas[1]) / 2;
    return Math.round(ENERGIA.abates * media * Math.pow(ENERGIA.crescimento, nivel));
}

// Pega a melhoria `id`: sobe o nível e aplica o que é imediato (vida).
export function aplicarMelhoria(id) {
    partida.melhorias[id] = nivelDe(id) + 1;
    if (id === "reparo") {
        partida.vidaTorre = Math.min(partida.vidaTorreMax, partida.vidaTorre + partida.vidaTorreMax * MELHORIA.reparo);
    } else if (id === "muralha") {
        partida.vidaTorreMax += MELHORIA.muralhaVida;
        partida.vidaTorre = Math.min(partida.vidaTorreMax, partida.vidaTorre + MELHORIA.muralhaCura);
    }
}

// ---- efeitos lidos pelo facho e pelos monstros ------------------------------

// graus de abertura a mais (Lente larga)
export function aberturaExtra() {
    return nivelDe("lente") * MELHORIA.lente;
}

// fator da espera da recarga (Mecanismo)
export function fatorDaEspera() {
    return Math.pow(1 - MELHORIA.mecanismo, nivelDe("mecanismo"));
}

// segundos de disparo a mais (Pavio longo)
export function duracaoExtra() {
    return nivelDe("pavio") * MELHORIA.pavio;
}

// true com o Facho duplo
export function temFachoDuplo() {
    return nivelDe("duplo") > 0;
}

// segundos de lentidão de quem a luz toca (0 sem a Luz que queima)
export function tempoDeQueima() {
    return nivelDe("queima") > 0 ? MELHORIA.queima : 0;
}
