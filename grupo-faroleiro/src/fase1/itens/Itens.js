import { Renderable } from "melonjs";
import { CONFIG } from "../../config.js";
import { pintar } from "../../entities/folha.js";
import { registrarBrilho, removerBrilho } from "../../systems/brilhos.js";
import { partida } from "../../systems/partida.js";
import { efeito } from "../../systems/som.js";
import { desenharIcone, ICONE } from "../../ui/Hud.js";
import { HOLANDES, PECAS } from "../config.js";
import { coresDoJogoFase1 } from "../cores.js";
import { sobrepoe } from "../fisica.js";
import { lerVista } from "../vista.js";
import { Bau } from "./Bau.js";
import { Coracao } from "./Coracao.js";
import { Peca } from "./Peca.js";

// Itens da Fase 1: as peças da torre na praia e os baús dos mini-chefes.
// Cuida de quando surgem, de quando o jogador encosta (pega a peça, abre o
// baú) e do desenho: tudo por cima da escuridão (brilham) e, na tela, um
// indicador na borda apontando para cada peça fora da vista.
//
// Pegar chama fase.coletarPeca(icone, { x, y }) (Fase1Stage), que toca a
// cena da torre ou dá o bônus. A peça da praia e a de um baú, depois disso
// (no fim da cena), chamam fase.abrirCartasDoBau() para a escolha da carta;
// a lente do Holandês (também uma Peca) não.
//
// API para a fase e o Holandês (tarefa 9):
//   itens.surgirPeca(indice)          a peça da hora (0 a 3), no ponto da vez
//   itens.surgirPecaEm(ponto, icone)  uma peça qualquer num ponto { x, y }
//   itens.soltarBau(x, y)             baú caindo de (x, y)
//   itens.limpar()                    tira tudo (sem efeito)

export class Itens {
    // fase: a Fase1Stage (mapa, jogador, escuridao, coletarPeca)
    constructor(fase) {
        this.fase = fase;
        this.mapa = fase.mapa;
        this.pecas = [];
        this.baus = [];
        this.coracoes = [];
        this.camada = new CamadaItens(this);
    }

    surgirPeca(indice) {
        const nome = PECAS.pontos[indice % PECAS.pontos.length];
        const ponto = this.mapa.ponto(nome);
        if (ponto === null) {
            throw new Error(`Fase 1: o mapa não tem o ponto "${nome}"`);
        }
        return this.surgirPecaEm(ponto, PECAS.icones[indice] ?? PECAS.icones[0]);
    }

    surgirPecaEm(ponto, icone) {
        const peca = new Peca(this.mapa, ponto, icone);
        this.fase.escuridao.adicionar(peca.luz);
        this.pecas.push(peca);
        efeito("hora");
        return peca;
    }

    soltarBau(x, y) {
        const bau = new Bau(this.mapa, x, y);
        this.baus.push(bau);
        return bau;
    }

    soltarCoracao(x, y) {
        const coracao = new Coracao(this.mapa, x, y);
        this.coracoes.push(coracao);
        return coracao;
    }

    // ícone da próxima peça que falta na torre
    proximoIcone() {
        return PECAS.icones[Math.min(PECAS.icones.length - 1, partida.pecas)];
    }

    // dt em segundos; só fora da pausa e das cenas
    atualizar(dt) {
        const jogador = this.fase.jogador;
        const caixaDoJogador = jogador.vivo ? jogador.caixa() : null;

        for (const peca of this.pecas) {
            peca.atualizar(dt);
            if (caixaDoJogador !== null && peca.pegavel && sobrepoe(peca.caixa(), caixaDoJogador)) {
                peca.removida = true;
                const fase = this.fase;
                const cena = fase.coletarPeca(peca.icone, peca.posicao());
                // a peça da praia também dá as cartas, depois da cena da torre
                // (ou já, no bônus); a lente do Holandês não
                if (peca.icone !== HOLANDES.lente.icone) {
                    Promise.resolve(cena).then(() => fase.abrirCartasDoBau());
                }
                // a cena pausa os itens: o resto fica para depois dela
                this.tirarRemovidos();
                return;
            }
        }
        for (const bau of this.baus) {
            bau.atualizar(dt);
            if (caixaDoJogador !== null && !bau.aberto && !bau.removido && sobrepoe(bau.caixa(), caixaDoJogador)) {
                bau.abrir(this.proximoIcone());
                jogador.lanterna.encher();
            }
            if (bau.prontoParaEntregar) {
                bau.entregue = true;
                const b = bau.base();
                const fase = this.fase;
                const cena = fase.coletarPeca(bau.iconeDaPeca, { x: b.x, y: b.y - ICONE });
                // as cartas do baú vêm depois da cena da torre (ou já, no bônus)
                Promise.resolve(cena).then(() => fase.abrirCartasDoBau());
                this.tirarRemovidos();
                return;
            }
        }
        for (const coracao of this.coracoes) {
            coracao.atualizar(dt);
            if (
                caixaDoJogador !== null &&
                !coracao.removido &&
                jogador.vida < jogador.vidaMaxima &&
                sobrepoe(coracao.caixa(), caixaDoJogador)
            ) {
                coracao.pegar();
                jogador.curar(1);
            }
        }
        this.tirarRemovidos();
    }

    tirarRemovidos() {
        let j = 0;
        for (let i = 0; i < this.pecas.length; i++) {
            const peca = this.pecas[i];
            if (peca.removida) {
                this.fase.escuridao?.remover(peca.luz);
                peca.destroy();
            } else {
                this.pecas[j++] = peca;
            }
        }
        this.pecas.length = j;
        this.baus = this.baus.filter((b) => !b.removido);
        this.coracoes = this.coracoes.filter((c) => !c.removido);
    }

    limpar() {
        for (const peca of this.pecas) {
            peca.removida = true;
        }
        this.tirarRemovidos();
        this.baus.length = 0;
        this.coracoes.length = 0;
    }

    // Por cima da escuridão (px do mundo).
    desenharBrilho(renderer) {
        const cores = coresDoJogoFase1();
        for (const peca of this.pecas) {
            peca.desenharBrilho(renderer, cores);
        }
        for (const bau of this.baus) {
            bau.desenharBrilho(renderer, cores);
        }
        for (const coracao of this.coracoes) {
            coracao.desenharBrilho(renderer, cores);
        }
    }

    // Na tela (px da tela): o ícone de cada peça fora da vista, preso à
    // borda, com uma setinha apontando para ela.
    desenharIndicadores(renderer, camera) {
        if (this.pecas.length === 0) {
            return;
        }
        const v = lerVista(camera);
        const cores = coresDoJogoFase1();
        const m = PECAS.indicadorMargem;
        const largura = CONFIG.largura;
        const altura = CONFIG.altura;
        for (const peca of this.pecas) {
            if (!peca.pegavel) {
                continue;
            }
            const p = peca.posicao();
            const sx = (p.x - v.x) * v.zoom;
            const sy = (p.y - v.y) * v.zoom;
            if (sx >= 0 && sx <= largura && sy >= 0 && sy <= altura) {
                continue;
            }
            const ix = Math.min(largura - m - ICONE / 2, Math.max(m + ICONE / 2, sx));
            const iy = Math.min(altura - m - ICONE / 2, Math.max(m + ICONE / 2 + 24, sy));
            const pulso = 0.75 + Math.sin(peca.tempo * 5) * 0.25;
            // para que lado a seta aponta: o eixo em que a peça saiu mais
            const foraX = sx < 0 ? sx : sx > largura ? sx - largura : 0;
            const foraY = sy < 0 ? sy : sy > altura ? sy - altura : 0;
            let dx = 0;
            let dy = 0;
            if (Math.abs(foraX) >= Math.abs(foraY)) {
                dx = Math.sign(foraX);
            } else {
                dy = Math.sign(foraY);
            }
            renderer.save();
            renderer.setGlobalAlpha(pulso);
            desenharIcone(renderer, peca.icone, ix - ICONE / 2, iy - ICONE / 2);
            renderer.restore();
            desenharSeta(renderer, cores.miolo, ix + dx * (ICONE / 2 + 3), iy + dy * (ICONE / 2 + 3), dx, dy, pulso);
        }
    }

    destroy() {
        for (const peca of this.pecas) {
            this.fase.escuridao?.remover(peca.luz);
            peca.destroy();
        }
        this.pecas.length = 0;
        this.baus.length = 0;
        this.coracoes.length = 0;
    }
}

// Setinha de pixel (triângulo de 4 degraus) com a ponta para (dx, dy),
// começando em (x, y).
export function desenharSeta(renderer, cor, x, y, dx, dy, alfa) {
    const bx = Math.round(x);
    const by = Math.round(y);
    for (let i = 0; i < 4; i++) {
        const meia = 3 - i;
        if (dx !== 0) {
            pintar(renderer, cor, bx + dx * i, by - meia, 1, meia * 2 + 1, alfa);
        } else {
            pintar(renderer, cor, bx - meia, by + dy * i, meia * 2 + 1, 1, alfa);
        }
    }
}

// Camada dos itens no mundo: do tamanho do mapa, só registra o brilho.
export class CamadaItens extends Renderable {
    constructor(itens) {
        super(0, 0, itens.mapa.largura, itens.mapa.altura);
        this.anchorPoint.set(0, 0);
        this.itens = itens;
    }

    onActivateEvent() {
        registrarBrilho(this);
    }

    onDeactivateEvent() {
        removerBrilho(this);
    }

    update() {
        return true;
    }

    draw() {}

    desenharBrilho(renderer) {
        this.itens.desenharBrilho(renderer);
    }
}
