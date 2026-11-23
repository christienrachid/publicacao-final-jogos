// Valores globais do jogo (versão 2). Os valores de equilíbrio de cada fase
// ficam em src/fase1/config.js e src/fase2/config.js.

// ?debug na URL liga o modo de teste (src/systems/depuracao.js)
function lerDebug() {
    try {
        return new URLSearchParams(globalThis.location?.search ?? "").has("debug");
    } catch {
        return false;
    }
}

export const CONFIG = {
    // largura da tela do jogo, em pixels
    largura: 640,
    // altura da tela do jogo, em pixels
    altura: 360,
    // lado de um tile, em pixels
    tile: 16,
    // segundos reais por hora de jogo fora dos chefes
    segundosPorHora: 60,
    // segundos reais por hora de jogo na hora dos chefes (22h e 5h)
    segundosHoraChefe: 150,
    // modo de teste: teclas 0 a 6 (src/systems/depuracao.js)
    debug: lerDebug(),
    // segundos reais por hora de jogo na Fase 2 fora do Kraken, 0h às 5h; era 60
    segundosPorHoraFase2: 36,
};
