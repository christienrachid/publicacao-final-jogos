import { loader } from "melonjs";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo, imagem } from "../systems/estilo.js";
import { efeito } from "../systems/som.js";
import { eh } from "./entrada.js";
import { Rotulo } from "./texto.js";

// Controles da interface: botão, slider e seletor "< valor >". Ficam numa
// Lista (src/ui/lista.js), que cuida do foco, das setas ↑↓ e do mouse; cada
// controle só sabe se desenhar e responder ao que chega até ele.
//
// Todo controle tem x, y (canto superior esquerdo, em pixels da tela),
// largura, altura e estes métodos (todos opcionais menos desenhar):
//   desenhar(renderer, focado)
//   teclar(codigo, repeticao)  → true se usou a tecla
//   apertar(x, y) / arrastar(x, y) / soltar(x, y)

class Controle {
    constructor(largura, altura) {
        this.x = 0;
        this.y = 0;
        this.largura = largura;
        this.altura = altura;
        this.focavel = true;
    }

    contem(px, py) {
        return px >= this.x && px < this.x + this.largura && py >= this.y && py < this.y + this.altura;
    }

    destroy() {}
}

// botão: placa de madeira de botao-<tema>.png (96×48, dois quadros de 96×24)
const BOTAO_LARGURA = 96;
const BOTAO_ALTURA = 24;
// topo do texto dentro da placa (a fonte tem 11 px de linha)
const BOTAO_TEXTO_Y = 7;

// Botão: Enter, Espaço ou clique (apertar e soltar em cima) chamam aoAtivar.
export class Botao extends Controle {
    constructor(texto, aoAtivar) {
        super(BOTAO_LARGURA, BOTAO_ALTURA);
        this.rotulo = new Rotulo(texto);
        this.aoAtivar = aoAtivar;
        this.apertado = false;
    }

    ativar() {
        efeito("clique");
        this.aoAtivar();
    }

    teclar(codigo, repeticao) {
        if (eh("confirmar", codigo)) {
            if (!repeticao) {
                this.ativar();
            }
            return true;
        }
        return false;
    }

    apertar() {
        this.apertado = true;
    }

    soltar(px, py) {
        const ativa = this.apertado && this.contem(px, py);
        this.apertado = false;
        if (ativa) {
            this.ativar();
        }
    }

    desenhar(renderer, focado) {
        const { jogo } = dadosDoEstilo();
        const quadro = focado ? 1 : 0;
        renderer.drawImage(
            loader.getImage(imagem("botao")),
            0,
            quadro * BOTAO_ALTURA,
            BOTAO_LARGURA,
            BOTAO_ALTURA,
            this.x,
            this.y,
            BOTAO_LARGURA,
            BOTAO_ALTURA,
        );
        // apertado: o texto afunda 1 px
        const afunda = this.apertado ? 1 : 0;
        this.rotulo.desenhar(renderer, this.x + BOTAO_LARGURA / 2, this.y + BOTAO_TEXTO_Y + afunda, {
            cor: focado ? jogo.destaque : jogo.texto,
            alinhamento: "centro",
        });
    }

    destroy() {
        this.rotulo.destroy();
    }
}

// linha de opção (slider e seletor): rótulo à esquerda, valor à direita
const LINHA_LARGURA = 240;
const LINHA_ALTURA = 18;
const LINHA_TEXTO_Y = 4;
// início da área do valor, a partir do x da linha
const VALOR_X = 84;
// slider: trilho e largura do texto da porcentagem
const TRILHO_ALTURA = 4;
const TRILHO_Y = 7;
const PORCENTAGEM_LARGURA = 34;
const PEGADOR_LARGURA = 4;
const PEGADOR_ALTURA = 10;
const PASSO_TECLA = 0.1;

// Slider de 0 a 1: ←/→ mudam de 10 em 10%, o mouse arrasta. `obter` lê o
// valor e `definir(v)` grava e devolve o que ficou; `aoMudar` (opcional)
// toca uma amostra, chamado ao soltar o mouse ou a cada toque de tecla.
export class Slider extends Controle {
    constructor(texto, obter, definir, aoMudar = null) {
        super(LINHA_LARGURA, LINHA_ALTURA);
        this.rotulo = new Rotulo(texto);
        this.valor = new Rotulo("");
        this.obter = obter;
        this.definir = definir;
        this.aoMudar = aoMudar;
        this.arrastando = false;
    }

    trilho() {
        const x = this.x + VALOR_X;
        const largura = this.largura - VALOR_X - PORCENTAGEM_LARGURA;
        return { x, y: this.y + TRILHO_Y, largura };
    }

    mudarPara(v) {
        const antes = this.obter();
        const depois = this.definir(v);
        return depois !== antes;
    }

    teclar(codigo) {
        const direcao = eh("esquerda", codigo) ? -1 : eh("direita", codigo) ? 1 : 0;
        if (direcao === 0) {
            return false;
        }
        if (this.mudarPara(this.obter() + direcao * PASSO_TECLA)) {
            efeito("navegar");
            this.aoMudar?.();
        }
        return true;
    }

    porX(px) {
        const t = this.trilho();
        return (px - t.x) / t.largura;
    }

    apertar(px) {
        this.arrastando = true;
        this.mudarPara(this.porX(px));
    }

    arrastar(px) {
        if (this.arrastando) {
            this.mudarPara(this.porX(px));
        }
    }

    soltar() {
        if (this.arrastando) {
            this.arrastando = false;
            efeito("navegar");
            this.aoMudar?.();
        }
    }

    desenhar(renderer, focado) {
        const { jogo } = dadosDoEstilo();
        const v = this.obter();
        this.rotulo.desenhar(renderer, this.x, this.y + LINHA_TEXTO_Y, { cor: focado ? jogo.destaque : jogo.texto });
        const t = this.trilho();
        pintar(renderer, jogo.escuridao, t.x - 1, t.y - 1, t.largura + 2, TRILHO_ALTURA + 2, 0.85);
        pintar(renderer, jogo.textoFraco, t.x, t.y, t.largura, TRILHO_ALTURA, 0.45);
        const cheio = Math.round(t.largura * v);
        if (cheio > 0) {
            pintar(renderer, jogo.destaque, t.x, t.y, cheio, TRILHO_ALTURA);
        }
        const px = t.x + cheio - PEGADOR_LARGURA / 2;
        const py = t.y + TRILHO_ALTURA / 2 - PEGADOR_ALTURA / 2;
        pintar(renderer, jogo.escuridao, px - 1, py - 1, PEGADOR_LARGURA + 2, PEGADOR_ALTURA + 2);
        pintar(renderer, focado ? jogo.destaque : jogo.texto, px, py, PEGADOR_LARGURA, PEGADOR_ALTURA);
        this.valor.texto = `${Math.round(v * 100)}%`;
        this.valor.desenhar(renderer, this.x + this.largura, this.y + LINHA_TEXTO_Y, {
            cor: focado ? jogo.destaque : jogo.textoFraco,
            alinhamento: "direita",
        });
    }

    destroy() {
        this.rotulo.destroy();
        this.valor.destroy();
    }
}

// Seletor "< valor >": ←/→ (ou clique na metade esquerda/direita) chamam
// mudar(-1 ou 1); Enter avança. `obterTexto` devolve o valor mostrado.
export class Seletor extends Controle {
    constructor(texto, obterTexto, mudar) {
        super(LINHA_LARGURA, LINHA_ALTURA);
        this.rotulo = new Rotulo(texto);
        this.valor = new Rotulo("");
        this.setaEsquerda = new Rotulo("<");
        this.setaDireita = new Rotulo(">");
        this.obterTexto = obterTexto;
        this.mudar = mudar;
    }

    passo(direcao) {
        this.mudar(direcao);
        efeito("navegar");
    }

    teclar(codigo, repeticao) {
        if (eh("esquerda", codigo)) {
            this.passo(-1);
            return true;
        }
        if (eh("direita", codigo) || (eh("confirmar", codigo) && !repeticao)) {
            this.passo(1);
            return true;
        }
        return false;
    }

    apertar(px) {
        const meio = this.x + VALOR_X + (this.largura - VALOR_X) / 2;
        this.passo(px < meio ? -1 : 1);
    }

    desenhar(renderer, focado) {
        const { jogo } = dadosDoEstilo();
        const cor = focado ? jogo.destaque : jogo.texto;
        const y = this.y + LINHA_TEXTO_Y;
        this.rotulo.desenhar(renderer, this.x, y, { cor });
        const inicio = this.x + VALOR_X;
        const fim = this.x + this.largura;
        this.setaEsquerda.desenhar(renderer, inicio, y, { cor: focado ? jogo.destaque : jogo.textoFraco });
        this.setaDireita.desenhar(renderer, fim, y, {
            cor: focado ? jogo.destaque : jogo.textoFraco,
            alinhamento: "direita",
        });
        this.valor.texto = this.obterTexto();
        this.valor.desenhar(renderer, (inicio + fim) / 2, y, { cor, alinhamento: "centro" });
    }

    destroy() {
        this.rotulo.destroy();
        this.valor.destroy();
        this.setaEsquerda.destroy();
        this.setaDireita.destroy();
    }
}
