import { pintar } from "../../entities/folha.js";
import { emitirEstrelinhas, emitirFaiscas } from "../../systems/particulas.js";
import { efeito } from "../../systems/som.js";
import { desenharIcone, ICONE } from "../../ui/Hud.js";
import { BAU } from "../config.js";
import { criarCorpo, moverCorpo } from "../fisica.js";

// Baú que o mini-chefe derruba ao morrer (itens 6 fechado e 7 aberto): cai
// com a física de plataforma; encostar abre (som, estrelinhas e faíscas),
// enche a bateria e, BAU.espera ms depois, a peça que sai dele vai para a
// fase (Itens.js chama fase.coletarPeca e, depois da cena da torre,
// fase.abrirCartasDoBau). Aberto, some aos poucos.

const ICONE_FECHADO = 6;
const ICONE_ABERTO = 7;

export class Bau {
    constructor(mapa, x, y) {
        this.mapa = mapa;
        // um chefe morto sobre o mar solta o baú na beira da praia
        const meio = Math.min(mapa.limiteDireito - BAU.largura, Math.max(mapa.limiteEsquerdo + BAU.largura, x));
        this.corpo = criarCorpo(meio - BAU.largura / 2, y - BAU.altura / 2, BAU.largura, BAU.altura);
        this.corpo.vy = -BAU.pulo;
        this.limites = { esquerdo: mapa.limiteEsquerdo, direito: mapa.limiteDireito };
        this.aberto = false;
        // ms desde que abriu
        this.tempoAberto = 0;
        // a peça já foi entregue
        this.entregue = false;
        // ícone da peça que sai (a fase decide qual ao abrir)
        this.iconeDaPeca = 0;
        this.removido = false;
        this.tempo = 0;
    }

    caixa() {
        const c = this.corpo;
        return { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    }

    // meio da base (px do mundo)
    base() {
        const c = this.corpo;
        return { x: c.x + c.largura / 2, y: c.y + c.altura };
    }

    abrir(iconeDaPeca) {
        this.aberto = true;
        this.tempoAberto = 0;
        this.iconeDaPeca = iconeDaPeca;
        efeito("bau");
        const b = this.base();
        emitirEstrelinhas(b.x, b.y - 10, 10);
        emitirFaiscas(b.x, b.y - 8, 8);
    }

    // a peça já pode ir para a fase
    get prontoParaEntregar() {
        return this.aberto && !this.entregue && this.tempoAberto >= BAU.espera;
    }

    // dt em segundos
    atualizar(dt) {
        this.tempo += dt;
        const corpo = this.corpo;
        corpo.vx = 0;
        corpo.vy = Math.min(600, corpo.vy + BAU.gravidade * dt);
        moverCorpo(corpo, dt, this.mapa, this.limites);
        if (corpo.y > this.mapa.altura + 32) {
            this.removido = true;
        }
        if (this.aberto) {
            this.tempoAberto += dt * 1000;
            if (this.entregue && this.tempoAberto >= BAU.espera + BAU.sumir * 1000) {
                this.removido = true;
            }
        }
    }

    // Por cima da escuridão: brilho, o baú e a peça subindo dele.
    desenharBrilho(renderer, cores) {
        if (this.removido) {
            return;
        }
        const b = this.base();
        let alfa = 1;
        if (this.entregue) {
            const sumindo = (this.tempoAberto - BAU.espera) / (BAU.sumir * 1000);
            alfa = Math.max(0, 1 - Math.max(0, sumindo - 0.6) / 0.4);
        }
        if (!this.aberto) {
            const pulso = 0.7 + Math.sin(this.tempo * 4) * 0.3;
            renderer.save();
            renderer.setBlendMode("additive");
            renderer.setColor(cores.feixe);
            for (let i = 0; i < 3; i++) {
                renderer.setGlobalAlpha(0.1 * pulso);
                const r = 14 - i * 4;
                renderer.fillEllipse(Math.round(b.x), Math.round(b.y - 6), r, r);
            }
            renderer.setBlendMode("normal");
            renderer.restore();
        }
        renderer.save();
        renderer.setGlobalAlpha(alfa);
        desenharIcone(renderer, this.aberto ? ICONE_ABERTO : ICONE_FECHADO, b.x - ICONE / 2, b.y - ICONE);
        renderer.restore();
        // a peça subindo até ser entregue
        if (this.aberto && !this.entregue) {
            const t = Math.min(1, this.tempoAberto / BAU.espera);
            const y = b.y - ICONE - t * BAU.subida;
            pintar(renderer, cores.miolo, Math.round(b.x - 1), Math.round(y), 2, Math.round(t * BAU.subida), 0.3);
            desenharIcone(renderer, this.iconeDaPeca, b.x - ICONE / 2, y - ICONE / 2);
        }
    }
}
