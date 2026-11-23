import { emitirFaiscas, emitirFumaca } from "../../systems/particulas.js";
import { FASE1, MINI_CHEFE, MONSTROS } from "../config.js";
import { sobrepoe } from "../fisica.js";
import { registrarAlvoDaLuz } from "../lanterna.js";
import { desenharInimigo, QUADROS } from "./folha.js";

// Base dos monstros da Fase 1 (caranguejo e alma; o pirata do Holandês,
// tarefa 9, também pode estender esta classe). Cuida da vida, do registro
// como alvo da lanterna, do quadro branco piscando na luz, da morte com
// fumaça, do dano por contato no jogador e do desenho espelhado.
//
// Cada tipo implementa:
//   caixa()            { x, y, largura, altura } de colisão (px do mundo)
//   mover(dt, diretor) o comportamento (dt em segundos)
//   quadroVivo()       quadro da folha fora do dano e da morte
// e pode sobrescrever aoLevarLuz(dano, lanterna).
//
// O diretor (Diretor.js) chama atualizar(dt, diretor) todo quadro fora da
// pausa e das cenas, desenhar(renderer, img) no mundo (embaixo da
// escuridão) e, para os mini-chefes, desenharChefe por cima da escuridão.
export class Monstro {
    // tipo: chave de MONSTROS e de QUADROS; chefe: mini-chefe (escala 2)
    constructor(tipo, { chefe = false } = {}) {
        const dados = MONSTROS[tipo];
        this.tipo = tipo;
        this.dados = dados;
        this.quadros = QUADROS[tipo];
        this.chefe = chefe;
        this.escala = chefe ? MINI_CHEFE.escala : 1;
        this.vidaMaxima = dados.vida * (chefe ? MINI_CHEFE.vida : 1);
        this.vida = this.vidaMaxima;
        this.velocidadeBase = dados.velocidade * (chefe ? MINI_CHEFE.velocidade : 1);
        this.dano = chefe ? MINI_CHEFE.dano : dados.dano;
        // olhando para a esquerda (-1, como na folha) ou para a direita (1)
        this.olhando = -1;
        this.tempo = Math.random() * 10;
        // > 0 enquanto está levando luz (quadro de dano piscando)
        this.iluminado = 0;
        this.morrendo = false;
        this.tempoMorte = 0;
        this.removido = false;
        // false enquanto não pode ferir o jogador (surgindo do mar)
        this.ferindo = true;
        this.alfa = 1;
        // alvo da lanterna: um mini-chefe é alcançado um pouco mais longe
        if (chefe) {
            this.alcanceDaLuz = FASE1.lanterna.alcance + MINI_CHEFE.alcanceExtra;
        }
        this.cancelarLuz = registrarAlvoDaLuz(this);
    }

    get vivo() {
        return !this.morrendo && !this.removido;
    }

    // ---- ganchos ------------------------------------------------------------

    caixa() {
        return { x: 0, y: 0, largura: 0, altura: 0 };
    }

    mover(_dt, _diretor) {}

    quadroVivo() {
        return 0;
    }

    aoLevarLuz(_dano, _lanterna) {}

    // ---- consultas ----------------------------------------------------------

    centro() {
        const c = this.caixa();
        return { x: c.x + c.largura / 2, y: c.y + c.altura / 2 };
    }

    // meio da base do desenho (px do mundo); a caixa fica nos pés
    baseDoDesenho() {
        const c = this.caixa();
        return { x: c.x + c.largura / 2, y: c.y + c.altura };
    }

    // ---- lanterna (lanterna.js) ---------------------------------------------

    pontoParaLuz() {
        return this.vivo ? this.centro() : null;
    }

    levarLuz(dano, lanterna) {
        if (!this.vivo) {
            return;
        }
        this.vida -= dano;
        this.iluminado = 0.12;
        if (this.vida <= 0) {
            this.morrer(true);
            return;
        }
        this.aoLevarLuz(dano, lanterna);
    }

    // ---- vida e morte -------------------------------------------------------

    // pelaLuz: morto pelo jogador (conta na estatística, chefe solta o baú)
    morrer(pelaLuz, diretor = this.diretor) {
        if (!this.vivo) {
            return;
        }
        this.morrendo = true;
        this.tempoMorte = 0;
        this.cancelarLuz();
        const c = this.centro();
        emitirFumaca(c.x, c.y, this.chefe ? 16 : 8, 6 * this.escala, !pelaLuz);
        if (pelaLuz) {
            emitirFaiscas(c.x, c.y, this.chefe ? 20 : 6);
        }
        diretor?.aoMorrer(this, pelaLuz);
    }

    // Some com fumaça, sem contar como derrotado (fim das 18h às 22h).
    sumir() {
        this.morrer(false);
    }

    // dt em segundos
    atualizar(dt, diretor) {
        this.diretor = diretor;
        if (this.removido) {
            return;
        }
        this.tempo += dt;
        if (this.morrendo) {
            this.tempoMorte += dt;
            if (this.tempoMorte >= MONSTROS.morte) {
                this.removido = true;
            }
            return;
        }
        this.iluminado = Math.max(0, this.iluminado - dt);
        this.mover(dt, diretor);
        if (this.vivo) {
            this.ferirPorContato(diretor.jogador);
        }
    }

    // Encostar no jogador tira coração (a invencibilidade dele segura o resto).
    ferirPorContato(jogador) {
        if (!this.ferindo || !jogador.vivo) {
            return;
        }
        if (sobrepoe(this.caixa(), jogador.caixa())) {
            jogador.levarDano(this.dano, this.centro());
        }
    }

    // ---- desenho --------------------------------------------------------------

    quadroAtual() {
        if (this.morrendo) {
            return this.quadros.morte;
        }
        if (this.iluminado > 0 && Math.floor(this.tempo / MONSTROS.piscar) % 2 === 0) {
            return this.quadros.dano;
        }
        return this.quadroVivo();
    }

    opacidade() {
        const fim = this.morrendo ? Math.max(0, 1 - this.tempoMorte / MONSTROS.morte) : 1;
        return this.alfa * fim;
    }

    desenhar(renderer, img) {
        if (this.removido) {
            return;
        }
        const b = this.baseDoDesenho();
        desenharInimigo(renderer, img, this.quadroAtual(), b.x, b.y, this.olhando, this.escala, this.opacidade());
    }
}
