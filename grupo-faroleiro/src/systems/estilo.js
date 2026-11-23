import { ESTILOS } from "../estilos.js";

// Estilo visual do jogo (ver src/estilos.js) e os nomes dos assets dele.
// Versões antigas guardavam no navegador um estilo escolhido pelo jogador;
// um valor salvo que não existe mais (ou sem acesso ao localStorage, como no
// modo privado) cai no estilo padrão.

const CHAVE = "faroleiro.estilo";
const PADRAO = "mare";

function valido(id) {
    return typeof id === "string" && Object.hasOwn(ESTILOS, id);
}

function lerSalvo() {
    try {
        const salvo = localStorage.getItem(CHAVE);
        return valido(salvo) ? salvo : PADRAO;
    } catch {
        return PADRAO;
    }
}

const atual = lerSalvo();

// Id do estilo atual ("mare").
export function estiloAtual() {
    return atual;
}

// { nome, jogo } do estilo atual.
export function dadosDoEstilo() {
    return ESTILOS[atual];
}

// Nome do mapa no estilo: nomeDaFase("fase1") → "fase1-mare".
export function nomeDaFase(fase, id = atual) {
    return `${fase}-${id}`;
}

// Nome de uma imagem no estilo: imagem("sprites") → "sprites-mare".
export function imagem(base, id = atual) {
    return `${base}-${id}`;
}
