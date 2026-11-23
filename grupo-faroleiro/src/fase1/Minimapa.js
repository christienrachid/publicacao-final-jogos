import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { ICONE } from "../ui/Hud.js";
import { MINIMAPA } from "./config.js";
import { coresDoJogoFase1 } from "./cores.js";
import { lerVista } from "./vista.js";

// Minimapa da Fase 1 no canto superior direito do HUD (abaixo das peças):
// 2 px por tile, fundo escuro, silhueta da ilha (terreno e tábuas), o
// jogador, os monstros, as lápides e os itens (peças, baús, corações) em
// pontos, e um retângulo fino com a vista da câmera. O Holandês não entra.
// Lê tudo da fase a cada quadro; nada é guardado além da silhueta.

export class Minimapa {
    constructor(fase) {
        this.fase = fase;
        this.mapa = fase.mapa;
        // por coluna: primeira linha sólida (ou -1)
        this.topos = [];
        this.mapaDaSilhueta = null;
    }

    get largura() {
        return this.mapa.colunas * MINIMAPA.escala;
    }

    get altura() {
        return this.mapa.linhas * MINIMAPA.escala;
    }

    // a silhueta é recalculada se o mapa mudou
    preparar() {
        const mapa = this.mapa;
        if (this.mapaDaSilhueta === mapa.solidos) {
            return;
        }
        this.mapaDaSilhueta = mapa.solidos;
        this.topos = [];
        for (let c = 0; c < mapa.colunas; c++) {
            let topo = -1;
            for (let r = 0; r < mapa.linhas; r++) {
                if (mapa.solido(c, r)) {
                    topo = r;
                    break;
                }
            }
            this.topos.push(topo);
        }
    }

    desenhar(renderer) {
        const fase = this.fase;
        const mapa = fase.mapa;
        if (!mapa || !fase.jogador) {
            return;
        }
        this.mapa = mapa;
        this.preparar();
        const cores = coresDoJogoFase1();
        const cm = cores.minimapa;
        const e = MINIMAPA.escala;
        const ox = CONFIG.largura - MINIMAPA.margem - this.largura;
        const oy = MINIMAPA.margem + ICONE + 4;
        const k = e / mapa.lado;

        pintar(renderer, "#000000", ox, oy, this.largura, this.altura, MINIMAPA.alfaFundo);

        // terreno: da primeira linha sólida até o fundo
        for (let c = 0; c < mapa.colunas; c++) {
            const topo = this.topos[c];
            if (topo >= 0) {
                pintar(renderer, cm.terra, ox + c * e, oy + topo * e, e, (mapa.linhas - topo) * e);
            }
        }
        // tábuas de mão única: uma faixa fina por tile
        for (let r = 0; r < mapa.linhas; r++) {
            for (let c = 0; c < mapa.colunas; c++) {
                if (mapa.plataforma(c, r)) {
                    pintar(renderer, cm.terra, ox + c * e, oy + r * e, e, 1);
                }
            }
        }

        const ponto = (x, y, cor, lado = MINIMAPA.ponto) => {
            const px = Math.round(ox + x * k - lado / 2);
            const py = Math.round(oy + y * k - lado / 2);
            pintar(renderer, cor, px, py, lado, lado);
        };
        const chefe = (x, y, cor) => {
            const lado = MINIMAPA.pontoChefe;
            ponto(x, y, cm.contorno, lado + 2);
            ponto(x, y, cor, lado);
        };

        // lápides (Tarefa 7; lista vazia enquanto não existir)
        for (const l of fase.diretor?.lapides ?? []) {
            if (l.vivo === false || l.removida) {
                continue;
            }
            const p = l.centro ? l.centro() : l;
            ponto(p.x, p.y, cm.lapide);
        }
        // itens: baús, corações e peças (na cor do feixe)
        const itens = fase.itens;
        for (const c of itens?.coracoes ?? []) {
            const b = c.caixa();
            ponto(b.x + b.largura / 2, b.y + b.altura / 2, cm.coracao);
        }
        for (const bau of itens?.baus ?? []) {
            const b = bau.caixa();
            ponto(b.x + b.largura / 2, b.y + b.altura / 2, cm.bau);
        }
        for (const peca of itens?.pecas ?? []) {
            const p = peca.posicao();
            ponto(p.x, p.y, cores.feixe);
        }
        // monstros vivos (o Diretor guarda em `lista`)
        for (const m of fase.diretor?.lista ?? []) {
            if (!m.vivo) {
                continue;
            }
            const p = m.centro();
            const cor = m.tipo === "vampiro" ? cm.vampiro : cm.inimigo;
            if (m.chefe) {
                chefe(p.x, p.y, cor);
            } else {
                ponto(p.x, p.y, cor);
            }
        }
        // jogador por último
        const j = fase.jogador.centro();
        ponto(j.x, j.y, cm.jogador);

        // vista da câmera: contorno de 1 px, cortado pelo minimapa
        const v = lerVista(fase.app.viewport);
        const vx = Math.max(0, v.x * k);
        const vy = Math.max(0, v.y * k);
        const vx1 = Math.min(this.largura, (v.x + v.largura) * k);
        const vy1 = Math.min(this.altura, (v.y + v.altura) * k);
        const w = Math.max(1, Math.round(vx1 - vx));
        const h = Math.max(1, Math.round(vy1 - vy));
        const rx = Math.round(ox + vx);
        const ry = Math.round(oy + vy);
        pintar(renderer, cm.vista, rx, ry, w, 1, 0.8);
        pintar(renderer, cm.vista, rx, ry + h - 1, w, 1, 0.8);
        pintar(renderer, cm.vista, rx, ry, 1, h, 0.8);
        pintar(renderer, cm.vista, rx + w - 1, ry, 1, h, 0.8);
    }
}
