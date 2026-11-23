import { partida } from "../systems/partida.js";
import { efeito } from "../systems/som.js";
import { ENERGIA, FAROL } from "./config.js";
import { coresDaFase2 } from "./cores.js";
import { brilhoRedondo, comecarPontos, ponto } from "./kraken/desenho.js";
import { capacidadeDaEnergia } from "./melhorias.js";

// Faíscas de luz da Fase 2: cada monstro morto pelo facho solta algumas
// (ENERGIA.faiscas; o mini-chefe, ENERGIA.faiscasDoChefe), que se espalham
// um instante e voam em arco até o farol. Cada uma que chega soma 1 em
// partida.energia, com um som curto; com a barra cheia (capacidadeDaEnergia)
// a Fase2Stage abre o painel de melhorias.
//
// Só anda em atualizar(dt), que a fase chama fora da pausa e do painel.

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

export class Energia {
    constructor() {
        this.lista = [];
        this.somDaFaisca = 0;
        // 1 quando uma faísca chega, caindo até 0 (brilho no farol)
        this.chegada = 0;
    }

    // true com a barra cheia
    get cheia() {
        return partida.energia >= capacidadeDaEnergia();
    }

    // 0 a 1: quanto da barra atual está cheio
    get fracao() {
        return Math.min(1, partida.energia / capacidadeDaEnergia());
    }

    // Um monstro morreu em (x, y): solta as faíscas dele.
    soltar(x, y, chefe = false) {
        const [minimo, maximo] = ENERGIA.faiscas;
        const quantidade = chefe ? ENERGIA.faiscasDoChefe : minimo + Math.floor(Math.random() * (maximo - minimo + 1));
        for (let i = 0; i < quantidade; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = sortear(50, 110);
            this.lista.push({
                x,
                y,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v,
                // "espalhando" e depois "voando"
                voando: false,
                t: -i * 0.04,
                duracao: sortear(ENERGIA.voo[0], ENERGIA.voo[1]),
                x0: 0,
                y0: 0,
                lado: Math.random() < 0.5 ? -1 : 1,
                rastroX: x,
                rastroY: y,
            });
        }
    }

    // dt em segundos
    atualizar(dt) {
        this.somDaFaisca = Math.max(0, this.somDaFaisca - dt);
        this.chegada = Math.max(0, this.chegada - dt / 0.35);
        for (let i = this.lista.length - 1; i >= 0; i--) {
            const f = this.lista[i];
            f.t += dt;
            f.rastroX = f.x;
            f.rastroY = f.y;
            if (!f.voando) {
                // espalha para fora, freando
                if (f.t > 0) {
                    f.x += f.vx * dt;
                    f.y += f.vy * dt;
                    const freio = Math.exp(-6 * dt);
                    f.vx *= freio;
                    f.vy *= freio;
                }
                if (f.t >= ENERGIA.espalhar) {
                    f.voando = true;
                    f.t = 0;
                    f.x0 = f.x;
                    f.y0 = f.y;
                }
                continue;
            }
            // voa até o farol num arco, acelerando no fim
            const k = Math.min(1, f.t / f.duracao);
            const e = k * k;
            const dx = FAROL.x - f.x0;
            const dy = FAROL.y - f.y0;
            const d = Math.hypot(dx, dy) || 1;
            const arco = Math.sin(k * Math.PI) * Math.min(ENERGIA.arco, d * 0.4) * f.lado;
            f.x = f.x0 + dx * e - (dy / d) * arco;
            f.y = f.y0 + dy * e + (dx / d) * arco;
            if (k >= 1) {
                this.lista.splice(i, 1);
                this.chegou();
            }
        }
    }

    chegou() {
        partida.energia++;
        this.chegada = 1;
        if (this.somDaFaisca <= 0) {
            efeito("faisca");
            this.somDaFaisca = ENERGIA.somMinimo;
        }
    }

    // Por cima da noite, em pixels do mundo: as faíscas com rastro e o
    // brilho no farol quando chegam.
    desenhar(renderer) {
        const cores = coresDaFase2();
        if (this.chegada > 0) {
            brilhoRedondo(renderer, cores.fachoForte, FAROL.x, FAROL.y, 16, 0.12 * this.chegada, 2);
        }
        if (this.lista.length === 0) {
            return;
        }
        // rastro: um ponto mais fraco três quadros atrás
        comecarPontos(renderer, cores.fachoForte, 0.45);
        for (const f of this.lista) {
            if (f.t > 0 || f.voando) {
                ponto(renderer, f.x + (f.rastroX - f.x) * 3, f.y + (f.rastroY - f.y) * 3, 2);
            }
        }
        renderer.restore();
        comecarPontos(renderer, cores.fachoMiolo, 1);
        for (const f of this.lista) {
            if (f.t > 0 || f.voando) {
                ponto(renderer, f.x, f.y, 2);
            }
        }
        renderer.restore();
    }
}
