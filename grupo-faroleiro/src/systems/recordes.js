// Recordes do jogador: a noite mais longa (hora da derrota mais tarde, em
// minutos da noite) e a vitória mais rápida (tempo de jogo, em segundos).
// Ficam salvos no navegador, no mesmo padrão de src/systems/opcoes.js: sem
// acesso ao localStorage (modo privado, site bloqueado) valem até fechar a
// página.

import { CONFIG } from "../config.js";

const CHAVE = "faroleiro.recordes";

// no modo de teste (?debug) nada é registrado, para não misturar teste com jogo
const emTeste = () => CONFIG.debug === true;

const VAZIO = { noiteMaisLonga: null, vitoriaMaisRapida: null };

// número finito e positivo, ou null
function limpar(v) {
    const n = Number(v);
    return v !== null && Number.isFinite(n) && n > 0 ? n : null;
}

function lerSalvo() {
    try {
        const texto = localStorage.getItem(CHAVE);
        const dados = texto === null ? {} : JSON.parse(texto);
        return {
            noiteMaisLonga: limpar(dados?.noiteMaisLonga),
            vitoriaMaisRapida: limpar(dados?.vitoriaMaisRapida),
        };
    } catch {
        return { ...VAZIO };
    }
}

const valores = lerSalvo();

function salvar() {
    try {
        localStorage.setItem(CHAVE, JSON.stringify(valores));
    } catch {
        // sem armazenamento: vale só até fechar a página
    }
}

// { noiteMaisLonga: minutos da noite | null, vitoriaMaisRapida: segundos | null }
export function lerRecordes() {
    return { ...valores };
}

// Guarda a hora da derrota (minutos da noite) se for mais tarde que a
// guardada; devolve true se é recorde novo.
export function registrarDerrota(minutos) {
    const m = limpar(Math.floor(minutos));
    if (emTeste() || m === null || (valores.noiteMaisLonga !== null && m <= valores.noiteMaisLonga)) {
        return false;
    }
    valores.noiteMaisLonga = m;
    salvar();
    return true;
}

// Guarda o tempo de jogo da vitória (segundos) se for menor que o guardado;
// devolve true se é recorde novo.
export function registrarVitoria(segundos) {
    const s = limpar(Math.round(segundos));
    if (emTeste() || s === null || (valores.vitoriaMaisRapida !== null && s >= valores.vitoriaMaisRapida)) {
        return false;
    }
    valores.vitoriaMaisRapida = s;
    salvar();
    return true;
}
