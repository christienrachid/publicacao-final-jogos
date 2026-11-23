import { emitirFaiscas, emitirFumaca, emitirPoeira } from "../../systems/particulas.js";
import { efeito } from "../../systems/som.js";
import { LAPIDE } from "../config.js";
import { registrarAlvoDaLuz } from "../lanterna.js";
import { QUADRO, QUADROS } from "./folha.js";
import { Zumbi } from "./Zumbi.js";

// Lápide: o diretor (Diretor.surgirLapide)
// a faz brotar num ponto "lapide" do mapa. Ela sobe da areia com poeira, e a
// cada LAPIDE.zumbiACada s solta um zumbi ao pé dela, até
// LAPIDE.zumbisPorLapide vivos dela (zumbi.lapide === esta). No limite, a
// contagem para: o próximo só sai LAPIDE.zumbiACada s depois de um deles
// morrer, e o jogador tem esse tempo para chegar até ela. Leva luz da
// lanterna como os monstros (tremendo de leve); com a vida em 0 mostra o
// quadro rachado por LAPIDE.rachar s e vira fumaça. Os zumbis dela ficam.
// Não fere por contato e não tem corpo: o jogador passa por ela.
//
// Estados: "surgindo", "inteira", "rachando"; depois removida = true.

function suave(t) {
    return t * t * (3 - 2 * t);
}

export class Lapide {
    // ponto: { x, y } do mapa (meio da base, no chão)
    constructor(mapa, ponto) {
        this.mapa = mapa;
        // meio da base (px do mundo), no topo do chão
        this.pos = { x: ponto.x, y: Lapide.chaoNoPonto(mapa, ponto) };
        this.vidaMaxima = LAPIDE.vida;
        this.vida = LAPIDE.vida;
        this.estado = "surgindo";
        this.tempoDoEstado = 0;
        this.tempo = 0;
        this.esperaDoZumbi = LAPIDE.zumbiACada;
        // > 0 enquanto está levando luz (treme)
        this.iluminado = 0;
        this.poeira = 0;
        this.removida = false;
        this.cancelarLuz = registrarAlvoDaLuz(this);
        for (let i = 0; i < 3; i++) {
            emitirPoeira(this.pos.x + (i - 1) * 5, this.pos.y);
        }
    }

    // y do topo do chão no ponto: se o ponto ficou embaixo de um tile sólido
    // (um degrau de um tile na coluna), sobe até o topo da pilha de sólidos
    static chaoNoPonto(mapa, ponto) {
        const tx = Math.floor(ponto.x / mapa.lado);
        let ty = Math.floor((ponto.y - 1) / mapa.lado);
        while (ty >= 0 && mapa.solido(tx, ty)) {
            ty--;
        }
        return Math.min(ponto.y, (ty + 1) * mapa.lado);
    }

    get vivo() {
        return this.estado === "surgindo" || this.estado === "inteira";
    }

    caixa() {
        return {
            x: this.pos.x - LAPIDE.largura / 2,
            y: this.pos.y - LAPIDE.altura,
            largura: LAPIDE.largura,
            altura: LAPIDE.altura,
        };
    }

    centro() {
        return { x: this.pos.x, y: this.pos.y - LAPIDE.altura / 2 };
    }

    // ---- lanterna (lanterna.js) ---------------------------------------------

    pontoParaLuz() {
        return this.vivo ? this.centro() : null;
    }

    levarLuz(dano) {
        if (!this.vivo) {
            return;
        }
        this.vida -= dano;
        this.iluminado = 0.12;
        if (this.vida <= 0) {
            this.rachar();
        }
    }

    // ---- fim ------------------------------------------------------------------

    // Vida em 0: o quadro rachado e, passado LAPIDE.rachar, a fumaça.
    rachar() {
        this.estado = "rachando";
        this.tempoDoEstado = 0;
        this.cancelarLuz();
        const c = this.centro();
        emitirFaiscas(c.x, c.y, 6);
        efeito("disparo");
    }

    // Some com fumaça (a limpeza das 22h, no escuro: fumaça por cima dele).
    sumir() {
        if (this.removida) {
            return;
        }
        this.removida = true;
        this.cancelarLuz();
        const c = this.centro();
        emitirFumaca(c.x, c.y, 10, 7, true);
    }

    // ---- quadro ---------------------------------------------------------------

    // dt em segundos; diretor: o Diretor (lista de monstros, ativo, adicionar)
    atualizar(dt, diretor) {
        if (this.removida) {
            return;
        }
        this.tempo += dt;
        this.tempoDoEstado += dt;
        this.iluminado = Math.max(0, this.iluminado - dt);
        if (this.estado === "surgindo") {
            this.poeira -= dt;
            if (this.poeira <= 0) {
                this.poeira = 0.1;
                emitirPoeira(this.pos.x + (Math.random() - 0.5) * LAPIDE.largura, this.pos.y);
            }
            if (this.tempoDoEstado >= LAPIDE.surgir) {
                this.estado = "inteira";
                this.tempoDoEstado = 0;
            }
        } else if (this.estado === "inteira") {
            if (this.zumbisVivos(diretor) >= LAPIDE.zumbisPorLapide) {
                // no limite: a contagem recomeça quando um deles morrer
                this.esperaDoZumbi = LAPIDE.zumbiACada;
                } else {
                this.esperaDoZumbi -= dt;
                if (this.esperaDoZumbi <= 0) {
                    this.esperaDoZumbi = LAPIDE.zumbiACada;
                    if (diretor.ativo) {
                        diretor.adicionar(new Zumbi(this.mapa, this.pos.x, this.pos.y, this));
                    }
                }
            }
        } else if (this.estado === "rachando" && this.tempoDoEstado >= LAPIDE.rachar) {
            this.removida = true;
            const c = this.centro();
            emitirFumaca(c.x, c.y, 10, 7);
        }
    }

    zumbisVivos(diretor) {
        let n = 0;
        for (const m of diretor.lista) {
            if (m.vivo && m.lapide === this) {
                n++;
            }
        }
        return n;
    }

    // ---- desenho ----------------------------------------------------------------

    // img: a folha de inimigos (quadros de 32×32, base na linha 31). Brotando,
    // só o pedaço de cima do quadro aparece, com a base no chão.
    desenhar(renderer, img) {
        if (this.removida) {
            return;
        }
        const quadro = this.estado === "rachando" ? QUADROS.lapide[1] : QUADROS.lapide[0];
        const visivel = this.estado === "surgindo" ? Math.round(QUADRO * suave(Math.min(1, this.tempoDoEstado / LAPIDE.surgir))) : QUADRO;
        if (visivel <= 0) {
            return;
        }
        const tremor = this.iluminado > 0 ? (Math.floor(this.tempo / 0.04) % 2 === 0 ? 1 : -1) * LAPIDE.tremor : 0;
        const sx = (quadro % 8) * QUADRO;
        const sy = Math.floor(quadro / 8) * QUADRO;
        const x = Math.round(this.pos.x - QUADRO / 2 + tremor);
        const y = Math.round(this.pos.y - visivel);
        renderer.drawImage(img, sx, sy, QUADRO, visivel, x, y, QUADRO, visivel);
    }

    destroy() {
        this.cancelarLuz();
    }
}
