import { input, state } from "melonjs";
import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo } from "../systems/estilo.js";
import { voltarAoMenu } from "../systems/partida.js";
import { efeito, modoPausa } from "../systems/som.js";
import { Botao } from "./controles.js";
import { empilhar, remover } from "./entrada.js";
import { Lista } from "./lista.js";
import { PainelOpcoes } from "./PainelOpcoes.js";
import { Painel } from "./painel.js";
import { Rotulo } from "./texto.js";

// Pausa das fases (Esc): véu escuro sobre o jogo e um painel no meio com
// Continuar, Opções e Voltar ao menu. A pausa é de verdade: state.pause()
// congela o mundo (monstros, partículas, animações) e o relógio, e a
// música fica abafada (modoPausa). A Stage continua desenhando e recebendo
// a entrada, então a fase precisa:
//   - criar a Pausa no onResetEvent e chamar ligar();
//   - chamar atualizar(dt) no update ANTES de checar state.isPaused();
//   - chamar desenhar(renderer) por último, dentro de desenharNaTela;
//   - chamar desligar() e destroy() no onDestroyEvent.
// FaseBase (src/stages/FaseBase.js) já faz tudo isso.

const VEU_OPACIDADE = 0.55;
const LARGURA = 176;
const ALTURA = 146;
const TITULO_Y = 18;
const BOTOES_Y = 44;
const ESPACO = 30;

export class Pausa {
    constructor(app) {
        this.app = app;
        this.aberta = false;
        // "Voltar ao menu" escolhido: o painel fica na tela durante o fade,
        // mas a pausa do MelonJS sai (com ela o fade não andaria)
        this.saindo = false;
        // "pausa" (os três botões) ou "opcoes" (o painel de opções)
        this.tela = "pausa";
        this.painel = new Painel();
        this.titulo = new Rotulo("Pausa");
        this.lista = new Lista(
            [
                new Botao("Continuar", () => this.fechar()),
                new Botao("Opções", () => this.mostrarOpcoes()),
                new Botao("Voltar ao menu", () => this.sairParaOMenu()),
            ],
            { aoVoltar: () => this.fechar() },
        );
        this.x = Math.round((CONFIG.largura - LARGURA) / 2);
        this.y = Math.round((CONFIG.altura - ALTURA) / 2);
        this.lista.posicionar(CONFIG.largura / 2, this.y + BOTOES_Y, ESPACO);
        this.opcoes = new PainelOpcoes(app, { aoVoltar: () => this.mostrarPausa() });
        this.opcoes.posicionar(CONFIG.largura / 2, CONFIG.altura / 2);
    }

    // Passa a ouvir o Esc (fica no fundo da pilha de entrada da fase).
    ligar() {
        empilhar(this);
    }

    // Sai da pilha e solta a pausa, se estava aberta (fim da Stage).
    desligar() {
        remover(this);
        if (this.aberta) {
            this.aberta = false;
            modoPausa(false);
            state.resume();
        }
    }

    abrir() {
        if (this.aberta) {
            return;
        }
        this.aberta = true;
        this.tela = "pausa";
        this.lista.focar();
        state.pause();
        modoPausa(true);
        efeito("clique");
    }

    fechar() {
        if (!this.aberta) {
            return;
        }
        this.aberta = false;
        modoPausa(false);
        state.resume();
    }

    mostrarOpcoes() {
        this.tela = "opcoes";
        this.opcoes.abrir();
    }

    mostrarPausa() {
        this.tela = "pausa";
        this.lista.focar(1);
    }

    sairParaOMenu() {
        // voltarAoMenu solta a pausa antes do fade (os tweens do fade param
        // com a pausa); a fase não anda enquanto `saindo` (ver FaseBase)
        this.saindo = true;
        voltarAoMenu();
    }

    // receptor da entrada: com a pausa fechada, só o Esc interessa
    receptorAtivo() {
        return this.tela === "opcoes" ? this.opcoes.lista : this.lista;
    }

    teclar(codigo, repeticao) {
        if (this.saindo) {
            return;
        }
        if (!this.aberta) {
            if (codigo === input.KEY.ESC && !repeticao) {
                this.abrir();
            }
            return;
        }
        this.receptorAtivo().teclar(codigo, repeticao);
    }

    moverPonteiro(x, y) {
        if (this.aberta && !this.saindo) {
            this.receptorAtivo().moverPonteiro(x, y);
        }
    }

    apertarPonteiro(x, y) {
        if (this.aberta && !this.saindo) {
            this.receptorAtivo().apertarPonteiro(x, y);
        }
    }

    soltarPonteiro(x, y) {
        if (this.aberta && !this.saindo) {
            this.receptorAtivo().soltarPonteiro(x, y);
        }
    }

    // Chame todo quadro no update da Stage, antes de checar a pausa. O
    // MelonJS solta a pausa sozinho quando a janela volta ao foco
    // (pauseOnBlur); com o painel aberto, a pausa volta aqui.
    atualizar() {
        if (this.aberta && !this.saindo && !state.isPaused()) {
            state.pause();
        }
    }

    desenhar(renderer) {
        if (!this.aberta) {
            return;
        }
        const { jogo } = dadosDoEstilo();
        pintar(renderer, jogo.escuridao, 0, 0, CONFIG.largura, CONFIG.altura, VEU_OPACIDADE);
        if (this.tela === "opcoes") {
            this.opcoes.desenhar(renderer);
            return;
        }
        this.painel.desenhar(renderer, this.x, this.y, LARGURA, ALTURA, 0.88);
        this.titulo.desenhar(renderer, CONFIG.largura / 2, this.y + TITULO_Y, {
            cor: jogo.destaque,
            alinhamento: "centro",
        });
        this.lista.desenhar(renderer);
    }

    destroy() {
        this.painel.destroy();
        this.titulo.destroy();
        this.lista.destroy();
        this.opcoes.destroy();
    }
}
