// Opções do jogador: volume da música e volume dos efeitos, salvos no
// navegador. Sem acesso ao localStorage (modo privado, site bloqueado) os
// valores valem até fechar a página.

const CHAVE = "faroleiro.opcoes";

const PADRAO = {
    volumeMusica: 0.5,
    volumeEfeitos: 0.7,
};

// volume de 0 a 1 com passos de 0,1 (evita 0,30000000000000004 na tela)
function limparVolume(v, padrao) {
    const n = Number(v);
    if (!Number.isFinite(n)) {
        return padrao;
    }
    return Math.round(Math.min(1, Math.max(0, n)) * 10) / 10;
}

function lerSalvo() {
    try {
        const texto = localStorage.getItem(CHAVE);
        const dados = texto === null ? {} : JSON.parse(texto);
        return {
            volumeMusica: limparVolume(dados?.volumeMusica, PADRAO.volumeMusica),
            volumeEfeitos: limparVolume(dados?.volumeEfeitos, PADRAO.volumeEfeitos),
        };
    } catch {
        return { ...PADRAO };
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

export function volumeMusica() {
    return valores.volumeMusica;
}

export function volumeEfeitos() {
    return valores.volumeEfeitos;
}

// Guarda o volume (0 a 1) e devolve o valor que ficou. Quem toca o som é
// src/systems/som.js: use definirVolumeMusica de lá para ouvir a mudança.
export function salvarVolumeMusica(v) {
    valores.volumeMusica = limparVolume(v, valores.volumeMusica);
    salvar();
    return valores.volumeMusica;
}

export function salvarVolumeEfeitos(v) {
    valores.volumeEfeitos = limparVolume(v, valores.volumeEfeitos);
    salvar();
    return valores.volumeEfeitos;
}
