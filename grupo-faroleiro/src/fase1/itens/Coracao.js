import { emitirEstrelinhas } from "../../systems/particulas.js";
import { desenharIcone, ICONE } from "../../ui/Hud.js";
import { CORACAO } from "../config.js";
import { criarCorpo, moverCorpo } from "../fisica.js";

// Coração que um monstro comum pode soltar ao morrer (itens 8): pula, cai
// com a física de plataforma e fica flutuando no chão. Encostar cura 1
// coração (Itens.js chama jogador.curar). Com a vida cheia o jogador passa
// por cima sem pegar. Some depois de CORACAO.duracao s, piscando no fim.

const ICONE_CORACAO = 8;

export class Coracao {
    constructor(mapa, x, y) {
        this.mapa = mapa;
        const meio = Math.min(mapa.limiteDireito - CORACAO.lado, Math.max(mapa.limiteEsquerdo + CORACAO.lado, x));
        this.corpo = criarCorpo(meio - CORACAO.lado / 2, y - CORACAO.lado / 2, CORACAO.lado, CORACAO.lado);
        this.corpo.vy = -CORACAO.pulo;
        this.limites = { esquerdo: mapa.limiteEsquerdo, direito: mapa.limiteDireito };
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

    pegar() {
        this.removido = true;
        const b = this.base();
        emitirEstrelinhas(b.x, b.y - 8, 6);
    }

    // dt em segundos
    atualizar(dt) {
        this.tempo += dt;
        const corpo = this.corpo;
        corpo.vx = 0;
        corpo.vy = Math.min(600, corpo.vy + CORACAO.gravidade * dt);
        moverCorpo(corpo, dt, this.mapa, this.limites);
        if (corpo.y > this.mapa.altura + 32 || this.tempo >= CORACAO.duracao) {
            this.removido = true;
        }
    }

    // Por cima da escuridão: halo pulsando e o coração balançando.
    desenharBrilho(renderer, cores) {
        if (this.removido) {
            return;
        }
        const restante = CORACAO.duracao - this.tempo;
        // pisca nos últimos segundos antes de sumir
        if (restante < CORACAO.piscar && Math.floor(this.tempo * 8) % 2 === 0) {
            return;
        }
        const b = this.base();
        const flutua = Math.round(Math.sin(this.tempo * 3) * 1.5);
        const pulso = 0.7 + Math.sin(this.tempo * 5) * 0.3;
        renderer.save();
        renderer.setBlendMode("additive");
        renderer.setColor(cores.feixe);
        for (let i = 0; i < 2; i++) {
            renderer.setGlobalAlpha(0.12 * pulso);
            const r = 11 - i * 4;
            renderer.fillEllipse(Math.round(b.x), Math.round(b.y - 7 + flutua), r, r);
        }
        renderer.setBlendMode("normal");
        renderer.restore();
        desenharIcone(renderer, ICONE_CORACAO, Math.round(b.x - ICONE / 2), Math.round(b.y - ICONE + flutua));
    }
}
