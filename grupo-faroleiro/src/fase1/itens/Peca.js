import { pintar } from "../../entities/folha.js";
import { relogio } from "../../systems/relogio.js";
import { efeito } from "../../systems/som.js";
import { desenharIcone, ICONE } from "../../ui/Hud.js";
import { PECAS } from "../config.js";
import { LuzRedonda } from "../escuridao.js";

// Peça da torre na praia: flutua acima do
// chão com um brilho, uma luz em volta e um feixe de luz vertical visível de
// longe. Se ninguém pegar em PECAS.duracao minutos de jogo, afunda e some.
// Quem pega é o gerenciador (Itens.js), que chama a fase.

export class Peca {
    // ponto: { x, y } do chão (pontos PecaEsquerda/PecaDireita); icone: id
    // em itens-<tema>.png
    constructor(mapa, ponto, icone) {
        this.x = ponto.x;
        this.chao = ponto.y;
        this.icone = icone;
        this.tempo = Math.random() * 3;
        this.expira = relogio.minutos() + PECAS.duracao;
        // null enquanto não afunda; depois, segundos afundando
        this.afundando = null;
        this.removida = false;
        this.luz = new LuzRedonda(mapa, this.x, this.chao - PECAS.altura, PECAS.luz);
    }

    get pegavel() {
        return !this.removida && this.afundando === null;
    }

    // meio do ícone (px do mundo)
    posicao() {
        const afundou = this.afundando === null ? 0 : Math.min(1, this.afundando / PECAS.afundar);
        return {
            x: this.x,
            y: this.chao - PECAS.altura + Math.sin(this.tempo * PECAS.ritmo) * PECAS.flutuar + afundou * PECAS.afundarPx,
        };
    }

    opacidade() {
        return this.afundando === null ? 1 : Math.max(0, 1 - this.afundando / PECAS.afundar);
    }

    caixa() {
        const p = this.posicao();
        const lado = PECAS.caixa;
        return { x: p.x - lado / 2, y: p.y - lado / 2, largura: lado, altura: lado };
    }

    // dt em segundos
    atualizar(dt) {
        if (this.removida) {
            return;
        }
        this.tempo += dt;
        if (this.afundando === null && relogio.minutos() >= this.expira) {
            this.afundando = 0;
            efeito("respingo");
        }
        if (this.afundando !== null) {
            this.afundando += dt;
            if (this.afundando >= PECAS.afundar) {
                this.removida = true;
            }
        }
        const p = this.posicao();
        this.luz.x = p.x;
        this.luz.y = p.y;
        this.luz.forca = this.opacidade();
    }

    // Por cima da escuridão: feixe, brilho e o ícone.
    desenharBrilho(renderer, cores) {
        if (this.removida) {
            return;
        }
        const p = this.posicao();
        const alfa = this.opacidade();
        const pulso = 0.8 + Math.sin(this.tempo * 3) * 0.2;
        desenharFeixe(renderer, cores, p.x, this.chao, alfa * pulso);
        // brilho em volta do ícone (aditivo)
        renderer.save();
        renderer.setBlendMode("additive");
        renderer.setColor(cores.feixe);
        for (let i = 0; i < 3; i++) {
            renderer.setGlobalAlpha(0.12 * alfa * pulso);
            const r = 12 - i * 3;
            renderer.fillEllipse(Math.round(p.x), Math.round(p.y), r, r);
        }
        renderer.setBlendMode("normal");
        renderer.restore();
        renderer.save();
        renderer.setGlobalAlpha(alfa);
        desenharIcone(renderer, this.icone, p.x - ICONE / 2, p.y - ICONE / 2);
        renderer.restore();
    }

    destroy() {
        this.luz.destroy();
    }
}

// Feixe vertical de luz saindo do chão (x, chao) para cima, em degraus de
// opacidade (aditivo), com o miolo mais claro.
export function desenharFeixe(renderer, cores, x, chao, alfa) {
    const altura = PECAS.feixeAltura;
    const largura = PECAS.feixeLargura;
    const degraus = 6;
    const passo = altura / degraus;
    renderer.save();
    renderer.setBlendMode("additive");
    for (let i = 0; i < degraus; i++) {
        const a = PECAS.feixeOpacidade * alfa * (1 - i / degraus);
        const y = Math.round(chao - (i + 1) * passo);
        pintar(renderer, cores.feixe, Math.round(x - largura / 2), y, largura, Math.ceil(passo), a);
        pintar(renderer, cores.miolo, Math.round(x - 1), y, 2, Math.ceil(passo), a * 1.5);
    }
    renderer.setBlendMode("normal");
    renderer.restore();
}
