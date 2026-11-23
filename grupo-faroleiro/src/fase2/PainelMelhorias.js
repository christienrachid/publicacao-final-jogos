import { input, loader, state } from "melonjs";
import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo, imagem } from "../systems/estilo.js";
import { efeito } from "../systems/som.js";
import { empilhar, eh, remover } from "../ui/entrada.js";
import { ICONE } from "../ui/Hud.js";
import { Painel } from "../ui/painel.js";
import { Rotulo } from "../ui/texto.js";
import { ENERGIA } from "./config.js";
import { nivelDe } from "./melhorias.js";

// Painel de escolha de cartas: abre no meio da tela com até três cartas.
// Na Fase 2, quando a barra de energia do farol enche (src/fase2/melhorias.js);
// na Fase 1, ao abrir o baú do mini-chefe (src/fase1/cartasDoBau.js).
// O jogador escolhe com o mouse (passar por cima e clicar) ou com as teclas
// 1 a N, uma por carta (←/→ e Enter também servem).
//
// Uma carta: { id, nome, linhas: [2 textos], maximo (Infinity: sem limite),
// desenharIcone(renderer, x, y, tamanho) (opcional) }. Sem desenharIcone,
// o ícone vem de `icone` e `dobrado` (desenharIconeDaMelhoria).
//
// Enquanto o painel está aberto o jogo fica parado como na pausa
// (state.pause: monstros, relógio e partículas param). O Esc abre a pausa
// por cima, e o painel volta quando ela fecha. A escolha só vale no
// quadro seguinte (atualizar), depois de um brilho curto na carta; assim a
// tecla 1, 2 ou 3 não chega como tecla de teste com o jogo já solto.
//
// Uso (Fase2Stage; a Fase1Stage faz o mesmo com as opções do baú):
//   painel = new PainelMelhorias(fase, (id) => fase.escolherMelhoria(id))
//   painel.abrir(cartas)       cartas = sortearCartas()
//   painel.atualizar(dt)       todo quadro, ANTES da base checar a pausa
//   painel.desenhar(renderer)  na tela, por cima do HUD
//   painel.desligar()          no fim da fase
// Opções (terceiro argumento do construtor, todas com o padrão da Fase 2):
//   titulo        texto do alto ("Energia cheia! Escolha uma melhoria")
//   nivelDe(id)   nível atual da carta, para os quadradinhos (melhorias.js)
// abrir(cartas, aoEscolher) aceita outra função de escolha só para esta vez.

const CARTA_LARGURA = 132;
const CARTA_ALTURA = 150;
const VAO = 10;
const MARGEM = 14;
const TITULO_ALTURA = 30;
const VEU_OPACIDADE = 0.45;
// placa do botão (botao-<tema>.png, dois quadros de 96×24)
const BOTAO_LARGURA = 96;
const BOTAO_ALTURA = 24;
const BOTAO_TEXTO_Y = 7;
// entrada do painel e brilho da carta escolhida (s)
const ENTRADA = 0.2;
const BRILHO_DA_ESCOLHA = 0.22;
// quadradinhos do nível
const PIP = 6;
const PIP_VAO = 3;
const COLUNAS_ITENS = 8;

const K = input.KEY;
// teclas 1 a 3 (linha de cima e teclado numérico); só valem as que têm carta
const TECLAS_DAS_CARTAS = {
    [K.NUM1]: 0,
    [K.NUM2]: 1,
    [K.NUM3]: 2,
    [K.NUMPAD1]: 0,
    [K.NUMPAD2]: 1,
    [K.NUMPAD3]: 2,
};
const MAXIMO_DE_CARTAS = 3;

// Ícone de uma melhoria da folha de itens, `tamanho` px, canto em (x, y).
// O Facho duplo desenha o ícone duas vezes, lado a lado.
export function desenharIconeDaMelhoria(renderer, m, x, y, tamanho = ICONE) {
    const img = loader.getImage(imagem("itens"));
    const sx = (m.icone % COLUNAS_ITENS) * ICONE;
    const sy = Math.floor(m.icone / COLUNAS_ITENS) * ICONE;
    if (m.dobrado) {
        const desvio = Math.round(tamanho / 5);
        renderer.save();
        renderer.setGlobalAlpha(0.65);
        renderer.drawImage(img, sx, sy, ICONE, ICONE, Math.round(x - desvio), Math.round(y), tamanho, tamanho);
        renderer.restore();
        renderer.drawImage(img, sx, sy, ICONE, ICONE, Math.round(x + desvio), Math.round(y), tamanho, tamanho);
        return;
    }
    renderer.drawImage(img, sx, sy, ICONE, ICONE, Math.round(x), Math.round(y), tamanho, tamanho);
}

export class PainelMelhorias {
    // fase: a stage da fase (pausa); aoEscolher(id) aplica a carta;
    // opcoes: ver o comentário do alto
    constructor(fase, aoEscolher, opcoes = {}) {
        this.fase = fase;
        this.aoEscolher = aoEscolher;
        // a função de escolha da vez (abrir pode trocar)
        this.aoEscolherAgora = aoEscolher;
        this.nivelDe = opcoes.nivelDe ?? nivelDe;
        this.aberto = false;
        this.cartas = [];
        this.foco = 0;
        this.apertada = -1;
        this.tempo = 0;
        // índice da carta escolhida (brilhando) ou -1
        this.escolhida = -1;
        this.tempoDaEscolha = 0;
        this.painel = new Painel();
        this.painelDaCarta = new Painel();
        this.titulo = new Rotulo(opcoes.titulo ?? "Energia cheia! Escolha uma melhoria");
        this.rotulos = Array.from({ length: MAXIMO_DE_CARTAS }, () => ({
            nome: new Rotulo(""),
            linhas: [new Rotulo(""), new Rotulo("")],
            nivel: new Rotulo(""),
            botao: new Rotulo(""),
        }));
        this.x = 0;
        this.y = 0;
        this.largura = 0;
        this.altura = 0;
    }

    // Abre com as cartas (1 a 3; a mais são cortadas). Sem cartas, ou já
    // aberto, não faz nada e devolve false.
    abrir(cartas, aoEscolher = this.aoEscolher) {
        if (this.aberto || cartas.length === 0) {
            return false;
        }
        cartas = cartas.slice(0, MAXIMO_DE_CARTAS);
        this.aberto = true;
        this.aoEscolherAgora = aoEscolher;
        this.cartas = cartas;
        this.foco = 0;
        this.apertada = -1;
        this.tempo = 0;
        this.escolhida = -1;
        const n = cartas.length;
        this.largura = Math.max(n * CARTA_LARGURA + (n - 1) * VAO + 2 * MARGEM, this.titulo.largura + 2 * MARGEM + 8);
        this.altura = MARGEM + TITULO_ALTURA + CARTA_ALTURA + MARGEM;
        this.x = Math.round((CONFIG.largura - this.largura) / 2);
        this.y = Math.round((CONFIG.altura - this.altura) / 2);
        cartas.forEach((m, i) => {
            const r = this.rotulos[i];
            r.nome.texto = m.nome;
            r.linhas[0].texto = m.linhas[0] ?? "";
            r.linhas[1].texto = m.linhas[1] ?? "";
            const nivel = this.nivelDe(m.id);
            r.nivel.texto = Number.isFinite(m.maximo) ? "" : nivel > 0 ? `Usado ${nivel}x` : "Sem limite";
            r.botao.texto = `[${i + 1}] Escolher`;
        });
        empilhar(this);
        state.pause();
        efeito("energiaCheia");
        return true;
    }

    // Fim da fase: sai da pilha de entrada (a pausa do MelonJS já foi solta
    // pela troca de tela).
    desligar() {
        remover(this);
        if (this.aberto && state.isPaused() && !this.fase.pausa?.aberta) {
            state.resume();
        }
        this.aberto = false;
    }

    fechar() {
        this.aberto = false;
        this.escolhida = -1;
        remover(this);
        if (!this.fase.pausa?.aberta) {
            state.resume();
        }
    }

    // Chame todo quadro, antes da base checar a pausa: anima, termina a
    // escolha e segura a pausa (a pausa do Esc, ao fechar, solta o jogo).
    atualizar(dt) {
        if (!this.aberto) {
            return;
        }
        const pausa = this.fase.pausa;
        if (pausa?.saindo) {
            return;
        }
        if (pausa?.aberta) {
            return;
        }
        const s = dt / 1000;
        this.tempo += s;
        if (this.escolhida >= 0) {
            this.tempoDaEscolha += s;
            if (this.tempoDaEscolha >= BRILHO_DA_ESCOLHA) {
                const id = this.cartas[this.escolhida].id;
                const aoEscolher = this.aoEscolherAgora;
                this.fechar();
                aoEscolher(id);
                return;
            }
        }
        if (!state.isPaused()) {
            state.pause();
        }
    }

    get aceitaEntrada() {
        return this.aberto && this.escolhida < 0 && this.tempo >= ENERGIA.esperaDoPainel;
    }

    escolher(i) {
        if (!this.aceitaEntrada || i < 0 || i >= this.cartas.length) {
            return;
        }
        this.foco = i;
        this.escolhida = i;
        this.tempoDaEscolha = 0;
        efeito("clique");
    }

    // ---- entrada (receptor de src/ui/entrada.js) ---------------------------

    teclar(codigo, repeticao) {
        const pausa = this.fase.pausa;
        if (pausa?.aberta || (codigo === K.ESC && !repeticao)) {
            pausa?.teclar(codigo, repeticao);
            return;
        }
        if (repeticao || !this.aceitaEntrada) {
            return;
        }
        const carta = TECLAS_DAS_CARTAS[codigo];
        if (carta !== undefined) {
            this.escolher(carta);
        } else if (eh("esquerda", codigo) || eh("direita", codigo)) {
            const passo = eh("esquerda", codigo) ? -1 : 1;
            this.foco = (this.foco + passo + this.cartas.length) % this.cartas.length;
            efeito("navegar");
        } else if (eh("confirmar", codigo)) {
            this.escolher(this.foco);
        }
    }

    // posição de cada carta, em pixels da tela
    cartaX(i) {
        const n = this.cartas.length;
        const total = n * CARTA_LARGURA + (n - 1) * VAO;
        return Math.round(this.x + (this.largura - total) / 2 + i * (CARTA_LARGURA + VAO));
    }

    cartaY() {
        return this.y + MARGEM + TITULO_ALTURA;
    }

    cartaEm(px, py) {
        const y = this.cartaY();
        if (py < y || py >= y + CARTA_ALTURA) {
            return -1;
        }
        for (let i = 0; i < this.cartas.length; i++) {
            const x = this.cartaX(i);
            if (px >= x && px < x + CARTA_LARGURA) {
                return i;
            }
        }
        return -1;
    }

    moverPonteiro(x, y) {
        const pausa = this.fase.pausa;
        if (pausa?.aberta) {
            pausa.moverPonteiro(x, y);
            return;
        }
        const i = this.cartaEm(x, y);
        if (i >= 0 && i !== this.foco && this.escolhida < 0) {
            this.foco = i;
            efeito("navegar");
        }
    }

    apertarPonteiro(x, y) {
        const pausa = this.fase.pausa;
        if (pausa?.aberta) {
            pausa.apertarPonteiro(x, y);
            return;
        }
        this.apertada = this.aceitaEntrada ? this.cartaEm(x, y) : -1;
    }

    soltarPonteiro(x, y) {
        const pausa = this.fase.pausa;
        if (pausa?.aberta) {
            pausa.soltarPonteiro(x, y);
            return;
        }
        const i = this.cartaEm(x, y);
        if (i >= 0 && i === this.apertada) {
            this.escolher(i);
        }
        this.apertada = -1;
    }

    // ---- desenho (em pixels da tela) ----------------------------------------

    desenhar(renderer) {
        if (!this.aberto) {
            return;
        }
        const { jogo } = dadosDoEstilo();
        const entrada = Math.min(1, this.tempo / ENTRADA);
        const subida = Math.round((1 - entrada) * 8);
        pintar(renderer, jogo.escuridao, 0, 0, CONFIG.largura, CONFIG.altura, VEU_OPACIDADE * entrada);
        this.painel.desenhar(renderer, this.x, this.y + subida, this.largura, this.altura, 0.9 * entrada);
        this.titulo.desenhar(renderer, CONFIG.largura / 2, this.y + subida + MARGEM + 4, {
            cor: jogo.destaque,
            opacidade: entrada,
            alinhamento: "centro",
        });
        for (let i = 0; i < this.cartas.length; i++) {
            this.desenharCarta(renderer, i, this.cartaX(i), this.cartaY() + subida, entrada);
        }
    }

    desenharCarta(renderer, i, x, y, entrada) {
        const { jogo } = dadosDoEstilo();
        const m = this.cartas[i];
        const r = this.rotulos[i];
        const focada = i === this.foco;
        const escolhida = i === this.escolhida;
        // a carta em foco sobe 2 px e fica mais opaca
        const topo = y - (focada ? 2 : 0);
        const meio = x + CARTA_LARGURA / 2;
        this.painelDaCarta.desenhar(renderer, x, topo, CARTA_LARGURA, CARTA_ALTURA, (focada ? 0.98 : 0.72) * entrada);

        // ícone em dobro, com um brilho atrás na carta em foco
        const iconeTamanho = ICONE * 2;
        const iconeY = topo + 14;
        if (focada) {
            pintar(renderer, jogo.destaque, meio - 20, iconeY - 4, 40, iconeTamanho + 8, 0.12 * entrada);
        }
        renderer.save();
        renderer.setGlobalAlpha(entrada);
        if (m.desenharIcone) {
            m.desenharIcone(renderer, meio - iconeTamanho / 2, iconeY, iconeTamanho);
        } else {
            desenharIconeDaMelhoria(renderer, m, meio - iconeTamanho / 2, iconeY, iconeTamanho);
        }
        renderer.restore();

        r.nome.desenhar(renderer, meio, topo + 52, { cor: focada ? jogo.destaque : jogo.texto, opacidade: entrada, alinhamento: "centro" });
        r.linhas[0].desenhar(renderer, meio, topo + 68, { cor: focada ? jogo.texto : jogo.textoFraco, opacidade: entrada, alinhamento: "centro" });
        r.linhas[1].desenhar(renderer, meio, topo + 80, { cor: focada ? jogo.texto : jogo.textoFraco, opacidade: entrada, alinhamento: "centro" });

        // nível: um quadradinho por nível (cheios até o atual, o próximo
        // piscando); o Reparo, sem limite, mostra um texto
        const nivelY = topo + 98;
        if (Number.isFinite(m.maximo)) {
            const atual = this.nivelDe(m.id);
            const largura = m.maximo * PIP + (m.maximo - 1) * PIP_VAO;
            const inicio = Math.round(meio - largura / 2);
            for (let k = 0; k < m.maximo; k++) {
                const px = inicio + k * (PIP + PIP_VAO);
                pintar(renderer, jogo.escuridao, px - 1, nivelY - 1, PIP + 2, PIP + 2, 0.9 * entrada);
                if (k < atual) {
                    pintar(renderer, jogo.destaque, px, nivelY, PIP, PIP, entrada);
                } else if (k === atual) {
                    const pulso = 0.45 + 0.35 * Math.sin(this.tempo * 8);
                    pintar(renderer, jogo.destaque, px, nivelY, PIP, PIP, pulso * entrada);
                } else {
                    pintar(renderer, jogo.textoFraco, px, nivelY, PIP, PIP, 0.35 * entrada);
                }
            }
        } else {
            r.nivel.desenhar(renderer, meio, nivelY - 3, { cor: jogo.textoFraco, opacidade: entrada, alinhamento: "centro" });
        }

        // placa do botão, no estilo dos botões do menu
        const bx = Math.round(meio - BOTAO_LARGURA / 2);
        const by = topo + CARTA_ALTURA - BOTAO_ALTURA - 10;
        renderer.save();
        renderer.setGlobalAlpha(entrada);
        renderer.drawImage(
            loader.getImage(imagem("botao")),
            0,
            (focada ? 1 : 0) * BOTAO_ALTURA,
            BOTAO_LARGURA,
            BOTAO_ALTURA,
            bx,
            by,
            BOTAO_LARGURA,
            BOTAO_ALTURA,
        );
        renderer.restore();
        const afunda = this.apertada === i || escolhida ? 1 : 0;
        r.botao.desenhar(renderer, meio, by + BOTAO_TEXTO_Y + afunda, {
            cor: focada ? jogo.destaque : jogo.texto,
            opacidade: entrada,
            alinhamento: "centro",
        });

        // carta escolhida: um clarão que some
        if (escolhida) {
            const k = 1 - Math.min(1, this.tempoDaEscolha / BRILHO_DA_ESCOLHA);
            pintar(renderer, jogo.destaque, x, topo, CARTA_LARGURA, CARTA_ALTURA, 0.35 * k);
        }
    }

    destroy() {
        this.painel.destroy();
        this.painelDaCarta.destroy();
        this.titulo.destroy();
        for (const r of this.rotulos) {
            r.nome.destroy();
            r.linhas[0].destroy();
            r.linhas[1].destroy();
            r.nivel.destroy();
            r.botao.destroy();
        }
    }
}