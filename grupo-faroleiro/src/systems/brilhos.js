// Brilhos: pontinhos que aparecem por cima da escuridão (olhos do Rondador,
// chamas, a luz da saída). Qualquer objeto com `desenharBrilho(renderer)`
// pode se registrar; a PlayStage chama todos depois de pintar a escuridão,
// em pixels do mundo. Só desenho: nada aqui ilumina o jogo (ver luz.js).

const brilhos = new Set();

// Registra um objeto com desenharBrilho(renderer).
export function registrarBrilho(objeto) {
    brilhos.add(objeto);
    return objeto;
}

// Tira um objeto do registro.
export function removerBrilho(objeto) {
    brilhos.delete(objeto);
}

// Esvazia o registro (fim ou reinício da fase).
export function limparBrilhos() {
    brilhos.clear();
}

// Desenha todos os brilhos, cada um com opacidade cheia de saída e o estado
// do renderer devolvido no fim.
export function desenharBrilhos(renderer) {
    for (const objeto of brilhos) {
        renderer.save();
        renderer.setGlobalAlpha(1);
        objeto.desenharBrilho(renderer);
        renderer.restore();
    }
}
