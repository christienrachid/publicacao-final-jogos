import { state } from "melonjs";
import { CONFIG } from "../config.js";

// Relógio de jogo da partida.
//
// O tempo é contado em "minutos da noite": 18h = 1080 e cada hora soma 60,
// sem voltar a zero na meia-noite, então 0h = 1440 e 6h = 1800. Assim
// comparar horas é só comparar números. Use minutosDe(h, m) para converter
// uma hora do relógio (minutosDe(22) = 1320, minutosDe(5) = 1740).
//
// O relógio só anda em atualizar(dt), que a Stage chama todo quadro; ele
// para sozinho com a pausa do MelonJS (state.pause) e com parar().

export const MINUTOS_POR_HORA = 60;
// 18h e 6h em minutos da noite
export const INICIO_DA_NOITE = 18 * MINUTOS_POR_HORA;
export const FIM_DA_NOITE = 30 * MINUTOS_POR_HORA;

// horas do relógio antes do meio-dia contam como "depois da meia-noite"
const MEIO_DIA = 12;

// Minutos da noite de uma hora do relógio: minutosDe(19, 30) = 1170.
export function minutosDe(hora, minuto = 0) {
    const h = hora < MEIO_DIA ? hora + 24 : hora;
    return h * MINUTOS_POR_HORA + minuto;
}

// horas dos chefes, mais lentas: [início, fim) em minutos da noite
// (Holandês das 22h às 23h, Kraken das 5h às 6h)
const HORAS_DE_CHEFE = [
    [minutosDe(22), minutosDe(23)],
    [minutosDe(5), minutosDe(6)],
];

let minutos = INICIO_DA_NOITE;
let rodando = false;
// null = automático pela hora; true/false força a velocidade
let chefeForcado = null;

// ouvintes por tipo: "hora" (hora cheia) e "meiaHora" (h:30)
const ouvintes = {
    hora: new Set(),
    meiaHora: new Set(),
};

// Dados de um instante para os ouvintes: hora do relógio (0 a 23), minuto
// e os minutos da noite.
function instante(m) {
    const total = Math.round(m);
    return {
        minutos: total,
        hora: Math.floor(total / MINUTOS_POR_HORA) % 24,
        minuto: total % MINUTOS_POR_HORA,
    };
}

function avisar(tipo, m) {
    const dados = instante(m);
    // cópia: um ouvinte pode se remover durante o aviso
    for (const fn of [...ouvintes[tipo]]) {
        fn(dados);
    }
}

// true se a hora dada (minutos da noite) é hora de chefe.
export function ehHoraDeChefe(m = minutos) {
    if (chefeForcado !== null) {
        return chefeForcado;
    }
    return HORAS_DE_CHEFE.some(([inicio, fim]) => m >= inicio && m < fim);
}

// Segundos reais que uma hora de jogo dura agora: chefe, Fase 2 (a partir
// da 0h, fora do Kraken) ou Fase 1.
export function segundosPorHoraAgora() {
    if (ehHoraDeChefe()) {
        return CONFIG.segundosHoraChefe;
    }
    return minutos >= minutosDe(0) ? CONFIG.segundosPorHoraFase2 : CONFIG.segundosPorHora;
}

export const relogio = {
    // Começa a contar a partir de m (minutos da noite), sem avisos.
    iniciar(m = INICIO_DA_NOITE) {
        minutos = m;
        rodando = true;
        chefeForcado = null;
    },

    // Para de contar (fim de fase, cena de conserto); retomar() volta.
    parar() {
        rodando = false;
    },

    retomar() {
        rodando = true;
    },

    estaRodando() {
        return rodando;
    },

    // Chame todo quadro na Stage. Fica parado com a pausa do MelonJS.
    atualizar(dt) {
        if (!rodando || state.isPaused()) {
            return;
        }
        const minutosPorMs = MINUTOS_POR_HORA / (segundosPorHoraAgora() * 1000);
        this.avancar(dt * minutosPorMs);
    },

    // Soma minutos de jogo e avisa cada hora cheia e meia hora cruzada
    // (o modo de teste usa isto para pular uma hora).
    avancar(delta) {
        const antes = minutos;
        minutos += delta;
        const primeiro = Math.floor(antes / 30) + 1;
        const ultimo = Math.floor(minutos / 30);
        for (let marca = primeiro; marca <= ultimo; marca++) {
            const m = marca * 30;
            avisar(m % MINUTOS_POR_HORA === 0 ? "hora" : "meiaHora", m);
        }
    },

    // Pula para m (minutos da noite) sem avisar as horas do meio.
    definir(m) {
        minutos = m;
    },

    // Força a velocidade de chefe (true), a normal (false) ou volta ao
    // automático pela hora (null).
    forcarVelocidadeDeChefe(ligado) {
        chefeForcado = ligado;
    },

    // Minutos da noite agora (com fração).
    minutos() {
        return minutos;
    },

    // Hora do relógio agora (0 a 23).
    hora() {
        return instante(Math.floor(minutos)).hora;
    },

    // "HH:MM" da hora atual (ou de m, em minutos da noite).
    formatar(m = minutos) {
        const { hora, minuto } = instante(Math.floor(m));
        return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
    },

    // Escuta "hora" ou "meiaHora"; fn recebe { minutos, hora, minuto }.
    // Devolve a função que cancela; a Stage chama no onDestroyEvent.
    ouvir(tipo, fn) {
        if (!Object.hasOwn(ouvintes, tipo)) {
            throw new Error(`relogio: evento desconhecido "${tipo}"`);
        }
        ouvintes[tipo].add(fn);
        return () => ouvintes[tipo].delete(fn);
    },

    // Tira todos os ouvintes (rede de segurança ao sair de uma fase).
    limparOuvintes() {
        for (const lista of Object.values(ouvintes)) {
            lista.clear();
        }
    },
};
