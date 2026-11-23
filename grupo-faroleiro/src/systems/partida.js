import { state } from "melonjs";
import { ESTADOS } from "../estados.js";
import { registrarDerrota, registrarVitoria } from "./recordes.js";
import { minutosDe, relogio } from "./relogio.js";

// Estado da partida, que passa de uma stage para outra: etapa, peças da
// torre, lente, nível da lanterna da Fase 2, vida da torre, estatísticas e o
// melhorias e energia do farol, ponto de retorno do "Tentar de novo". Também as trocas de tela da partida
// (irParaEtapa, vencer, perder, voltarAoMenu), para as stages não repetirem
// state.change com argumentos.

// As quatro etapas da noite: em que stage ficam e a hora em que começam.
// "Tentar de novo" volta ao começo da etapa em que o jogador perdeu.
export const ETAPAS = {
    fase1: { estado: ESTADOS.FASE1, inicio: minutosDe(18) },
    holandes: { estado: ESTADOS.FASE1, inicio: minutosDe(22) },
    fase2: { estado: ESTADOS.FASE2, inicio: minutosDe(0) },
    kraken: { estado: ESTADOS.FASE2, inicio: minutosDe(5) },
};

function estatisticasZeradas() {
    return {
        // monstros derrotados (as fases somam)
        monstros: 0,
        // vezes que o faroleiro caiu sem corações
        quedas: 0,
        // ids das cartas do baú pegas, uma entrada por carta (repete o id)
        cartas: [],
        // peças pegas na Fase 1 e engrenagens na Fase 2
        pecas: 0,
        engrenagens: 0,
        // vezes que o jogador usou "Tentar de novo"
        tentativas: 0,
        // ms de jogo real, sem contar a pausa (FaseBase soma)
        tempoMs: 0,
    };
}

export const partida = {
    // etapa atual (chave de ETAPAS)
    etapa: "fase1",
    // peças da torre consertadas, de 0 a 4
    pecas: 0,
    // lente do farol (solta pelo Holandês)
    lente: false,
    // engrenagens da lanterna da Fase 2, de 0 a 4
    nivelLanterna: 0,
    // vida da torre na Fase 2 (a Fase 2 define ao começar)
    vidaTorre: 0,
    vidaTorreMax: 0,
    // melhorias do farol na Fase 2 ({ id: nível }, src/fase2/melhorias.js),
    // a energia da barra e quantas barras já encheram
    melhorias: {},
    energia: 0,
    nivelEnergia: 0,
    // cartas do baú da Fase 1 (src/fase1/cartasDoBau.js): segundos a mais
    // de bateria máxima e fração a mais de dano da lanterna
    bateriaExtra: 0,
    danoExtra: 0,
    // modo de teste: jogador e torre não levam dano (tecla 0)
    invencivel: false,
    estatisticas: estatisticasZeradas(),
    // hora da derrota (minutos da noite) e se ela, ou a vitória, bateu um
    // recorde (src/systems/recordes.js); a tela de fim lê
    horaDaDerrota: null,
    novoRecorde: false,
};

// Lembretes de controles já mostrados na primeira Fase 1 e na primeira Fase 2
// da sessão. De módulo de propósito: o "Tentar de novo" e "Jogar" não zeram,
// só recarregar a página.
const lembretesMostrados = { fase1: false, fase2: false };

export function lembreteMostrado(fase) {
    return lembretesMostrados[fase] === true;
}

export function marcarLembrete(fase) {
    lembretesMostrados[fase] = true;
}

// cópia das estatísticas (a lista de cartas não pode ser a mesma)
function copiarEstatisticas(e) {
    return { ...e, cartas: [...e.cartas] };
}

// cópia do estado no começo da etapa atual (null antes da primeira)
let pontoDeRetorno = null;

function copiarEstado() {
    return {
        pecas: partida.pecas,
        lente: partida.lente,
        nivelLanterna: partida.nivelLanterna,
        vidaTorre: partida.vidaTorre,
        vidaTorreMax: partida.vidaTorreMax,
        melhorias: { ...partida.melhorias },
        energia: partida.energia,
        nivelEnergia: partida.nivelEnergia,
        bateriaExtra: partida.bateriaExtra,
        danoExtra: partida.danoExtra,
        estatisticas: copiarEstatisticas(partida.estatisticas),
    };
}

// Zera tudo para uma partida nova (o botão Jogar do menu chama).
export function novaPartida() {
    partida.etapa = "fase1";
    partida.pecas = 0;
    partida.lente = false;
    partida.nivelLanterna = 0;
    partida.vidaTorre = 0;
    partida.vidaTorreMax = 0;
    partida.melhorias = {};
    partida.energia = 0;
    partida.nivelEnergia = 0;
    partida.bateriaExtra = 0;
    partida.danoExtra = 0;
    partida.invencivel = false;
    partida.estatisticas = estatisticasZeradas();
    partida.horaDaDerrota = null;
    partida.novoRecorde = false;
    pontoDeRetorno = null;
}

// Guarda o estado atual como começo da etapa (as stages chamam ao entrar
// numa etapa: 18h, 22h, 0h e 5h).
export function salvarPontoDeRetorno(etapa) {
    if (!Object.hasOwn(ETAPAS, etapa)) {
        throw new Error(`partida: etapa desconhecida "${etapa}"`);
    }
    partida.etapa = etapa;
    pontoDeRetorno = { etapa, ...copiarEstado() };
}

// "Tentar de novo": volta o estado ao ponto salvo e reabre a etapa dele.
// As estatísticas também voltam, menos as tentativas, que somam um.
export function voltarAoPonto() {
    if (pontoDeRetorno === null) {
        novaPartida();
        irParaEtapa("fase1");
        return;
    }
    const tentativas = partida.estatisticas.tentativas + 1;
    const ponto = pontoDeRetorno;
    partida.etapa = ponto.etapa;
    partida.pecas = ponto.pecas;
    partida.lente = ponto.lente;
    partida.nivelLanterna = ponto.nivelLanterna;
    partida.vidaTorre = ponto.vidaTorre;
    partida.vidaTorreMax = ponto.vidaTorreMax;
    partida.melhorias = { ...ponto.melhorias };
    partida.energia = ponto.energia;
    partida.nivelEnergia = ponto.nivelEnergia;
    partida.bateriaExtra = ponto.bateriaExtra;
    partida.danoExtra = ponto.danoExtra;
    partida.estatisticas = { ...copiarEstatisticas(ponto.estatisticas), tentativas };
    irParaEtapa(ponto.etapa);
}

// Troca de estado com o fade; com a pausa ligada, solta antes (a transição
// é um efeito da câmera e não pode ficar presa).
function mudarPara(estado, ...args) {
    if (state.isPaused()) {
        state.resume();
    }
    if (state.isCurrent(estado)) {
        // state.change para o estado atual não faz nada: passa pela RECARGA
        state.change(ESTADOS.RECARGA, false, { estado, args });
    } else {
        state.change(estado, false, ...args);
    }
}

// Abre a stage da etapa. A stage recebe { etapa, inicio } no onResetEvent;
// inicio (minutos da noite) é a hora em que o relógio começa, e por padrão
// é a hora da etapa. O modo de teste usa inicio para pular para 21h50.
export function irParaEtapa(etapa, { inicio } = {}) {
    const dados = ETAPAS[etapa];
    if (dados === undefined) {
        throw new Error(`partida: etapa desconhecida "${etapa}"`);
    }
    partida.etapa = etapa;
    mudarPara(dados.estado, { etapa, inicio: inicio ?? dados.inicio });
}

// Tela de vitória (amanhecer).
export function vencer() {
    partida.novoRecorde = registrarVitoria(partida.estatisticas.tempoMs / 1000);
    mudarPara(ESTADOS.FIM, { tipo: "vitoria" });
}

// Tela de derrota com o motivo ("O farol apagou"). Guarda a hora da derrota
// e confere o recorde de noite mais longa.
export function perder(motivo) {
    partida.horaDaDerrota = relogio.minutos();
    partida.novoRecorde = registrarDerrota(partida.horaDaDerrota);
    mudarPara(ESTADOS.FIM, { tipo: "derrota", motivo });
}

export function voltarAoMenu() {
    mudarPara(ESTADOS.MENU);
}
