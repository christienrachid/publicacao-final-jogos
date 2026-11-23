import { event, input, Vector2d } from "melonjs";

// Entrada da interface (menus, painéis, pausa): teclado e mouse num lugar só.
//
// As telas se empilham como "receptores" e só o do topo recebe teclas e
// mouse; assim a pausa aberta por cima da fase, ou o painel de opções por
// cima do menu, não deixam a tecla vazar para baixo. O jogo em si (andar,
// pular, mirar) não passa por aqui: usa input.bindKey e input.pointer.
//
// Um receptor é um objeto com qualquer destes métodos:
//   teclar(codigo, repeticao)   tecla apertada (codigo = input.KEY.*);
//                               repeticao = true quando o navegador repete
//                               a tecla segurada
//   moverPonteiro(x, y)         mouse movido, em pixels da tela do jogo
//   apertarPonteiro(x, y)       botão do mouse apertado
//   soltarPonteiro(x, y)        botão do mouse solto (em qualquer lugar)
//
// As teclas vêm do evento KEYDOWN do MelonJS, que chega para toda tecla,
// presa a uma ação ou não; por isso a interface não precisa de bindKey e
// não briga com as teclas da fase (↑ pode ser "pular" na fase e "subir" no
// menu).

const pilha = [];
const seguradas = new Set();

// posição do mouse na tela do jogo (640×360) e o botão
export const ponteiro = { x: -1, y: -1, apertado: false };

let iniciada = false;

function topo() {
    return pilha.length > 0 ? pilha[pilha.length - 1] : null;
}

function aoTeclar(_acao, codigo) {
    const repeticao = seguradas.has(codigo);
    seguradas.add(codigo);
    topo()?.teclar?.(codigo, repeticao);
}

function aoSoltarTecla(_acao, codigo) {
    seguradas.delete(codigo);
}

// coordenadas do evento do navegador em pixels da tela do jogo
const local = new Vector2d();
function lerPosicao(e) {
    input.globalToLocal(e.pageX, e.pageY, local);
    ponteiro.x = local.x;
    ponteiro.y = local.y;
}

function aoMover(e) {
    lerPosicao(e);
    topo()?.moverPonteiro?.(ponteiro.x, ponteiro.y);
}

// só o botão principal (esquerdo) mexe na interface
function aoApertar(e) {
    if (e.button !== 0) {
        return;
    }
    lerPosicao(e);
    ponteiro.apertado = true;
    topo()?.apertarPonteiro?.(ponteiro.x, ponteiro.y);
}

function aoSoltar(e) {
    if (!ponteiro.apertado) {
        return;
    }
    if (e?.pageX !== undefined) {
        lerPosicao(e);
    }
    ponteiro.apertado = false;
    topo()?.soltarPonteiro?.(ponteiro.x, ponteiro.y);
}

// janela perdeu o foco: nenhuma tecla segue segurada
function aoPerderFoco() {
    seguradas.clear();
    aoSoltar(null);
}

// Liga a entrada uma vez, depois do app.init() (main.js). O mouse vem
// direto dos eventos do navegador: um registerPointerEvent no viewport
// ficaria preso à câmera da stage de carga (cada stage tem a sua).
export function iniciarEntrada(app) {
    if (iniciada) {
        return;
    }
    iniciada = true;
    const canvas = app.renderer.getCanvas();
    canvas.addEventListener("pointerdown", aoApertar);
    globalThis.addEventListener("pointermove", aoMover);
    globalThis.addEventListener("pointerup", aoSoltar);
    globalThis.addEventListener("pointercancel", aoSoltar);
    event.on(event.KEYDOWN, aoTeclar);
    event.on(event.KEYUP, aoSoltarTecla);
    event.on(event.BLUR, aoPerderFoco);
}

// Põe o receptor no topo (ele passa a receber tudo).
export function empilhar(receptor) {
    remover(receptor);
    pilha.push(receptor);
}

// Tira o receptor, esteja onde estiver na pilha.
export function remover(receptor) {
    const i = pilha.indexOf(receptor);
    if (i !== -1) {
        pilha.splice(i, 1);
    }
}

// true se o receptor é o do topo.
export function estaNoTopo(receptor) {
    return topo() === receptor;
}

// Teclas da interface, para os controles não repetirem listas.
const K = input.KEY;
export const TECLAS = {
    cima: [K.UP, K.W],
    baixo: [K.DOWN, K.S],
    esquerda: [K.LEFT, K.A],
    direita: [K.RIGHT, K.D],
    confirmar: [K.ENTER, K.SPACE],
    voltar: [K.ESC, K.BACKSPACE],
};

// true se o código é de uma das teclas do grupo ("cima", "confirmar"...).
export function eh(grupo, codigo) {
    return TECLAS[grupo].includes(codigo);
}
