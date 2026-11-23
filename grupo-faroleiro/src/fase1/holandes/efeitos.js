import { Color } from "melonjs";
import { coresDoHolandes } from "./cores.js";

// Partículas e brilhos do Holandês, desenhados por cima da escuridão e do
// navio (as partículas da fase, em src/systems/particulas.js, saem antes do
// navio no registro de brilhos e ficariam escondidas atrás dele): fogo-fátuo
// das lanternas, faíscas na luz, fogo das balas, bolhas do naufrágio.
//
// Cada partícula guarda o NOME da cor (chave de coresDoHolandes), lido no
// desenho.

const LIMITE = 180;

const CORES = new Map();

// Color de uma string CSS, criada uma vez.
export function cor(css) {
    let c = CORES.get(css);
    if (c === undefined) {
        c = new Color().parseCSS(css);
        CORES.set(css, c);
    }
    return c;
}

// Brilho redondo aditivo em (x, y): três elipses de raio decrescente.
export function brilho(renderer, css, x, y, raio, alfa) {
    if (alfa <= 0.004 || raio <= 0) {
        return;
    }
    renderer.save();
    renderer.setBlendMode("additive");
    renderer.setGlobalAlpha(Math.min(1, alfa));
    renderer.setColor(cor(css));
    for (let i = 0; i < 3; i++) {
        const r = raio * (1 - i * 0.25);
        renderer.fillEllipse(Math.round(x), Math.round(y), r, r);
    }
    renderer.setBlendMode("normal");
    renderer.restore();
}

// Retângulo com cor e opacidade (sem mexer no estado de quem chama).
export function retangulo(renderer, css, x, y, largura, altura, alfa = 1) {
    if (alfa <= 0) {
        return;
    }
    renderer.save();
    renderer.setGlobalAlpha(Math.min(1, alfa));
    renderer.setColor(cor(css));
    renderer.fillRect(Math.round(x), Math.round(y), largura, altura);
    renderer.restore();
}

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

export class Efeitos {
    constructor() {
        this.lista = [];
        this.vivas = 0;
    }

    nova(x, y, nomeDaCor, duracao) {
        if (this.vivas >= LIMITE) {
            return null;
        }
        let p = this.lista[this.vivas];
        if (p === undefined) {
            p = {};
            this.lista.push(p);
        }
        this.vivas++;
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.ay = 0;
        p.vida = 0;
        p.duracao = duracao;
        p.cor = nomeDaCor;
        p.lado = 1;
        return p;
    }

    // Explosão para todos os lados (fogo-fátuo, fogo da bala): px/s.
    explodir(x, y, quantidade, nomesDasCores, { velocidade = [30, 90], duracao = [0.5, 0.9], subida = -20, lado = [1, 2], gravidade = 0 } = {}) {
        for (let i = 0; i < quantidade; i++) {
            const p = this.nova(x, y, nomesDasCores[i % nomesDasCores.length], sortear(...duracao));
            if (p === null) {
                return;
            }
            const angulo = (i / quantidade) * Math.PI * 2 + sortear(-0.4, 0.4);
            const v = sortear(...velocidade);
            p.vx = Math.cos(angulo) * v;
            p.vy = Math.sin(angulo) * v + subida;
            p.ay = gravidade;
            p.lado = Math.round(sortear(lado[0], lado[1]));
        }
    }

    // Punhado de faíscas pequenas (lanterna levando luz).
    faiscas(x, y, quantidade, nomeDaCor) {
        this.explodir(x, y, quantidade, [nomeDaCor], { velocidade: [25, 60], duracao: [0.25, 0.45], subida: -10, lado: [1, 1], gravidade: 120 });
    }

    // Bolha subindo devagar (naufrágio).
    bolha(x, y) {
        const p = this.nova(x, y, "espuma", sortear(0.5, 1.1));
        if (p !== null) {
            p.vx = sortear(-4, 4);
            p.vy = sortear(-22, -10);
            p.lado = Math.random() < 0.3 ? 2 : 1;
        }
    }

    // dt em segundos
    atualizar(dt) {
        let i = 0;
        while (i < this.vivas) {
            const p = this.lista[i];
            p.vida += dt;
            if (p.vida >= p.duracao) {
                this.vivas--;
                this.lista[i] = this.lista[this.vivas];
                this.lista[this.vivas] = p;
                continue;
            }
            p.vy += p.ay * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            i++;
        }
    }

    desenhar(renderer) {
        if (this.vivas === 0) {
            return;
        }
        const cores = coresDoHolandes();
        for (let i = 0; i < this.vivas; i++) {
            const p = this.lista[i];
            const t = p.vida / p.duracao;
            retangulo(renderer, cores[p.cor], p.x - p.lado / 2, p.y - p.lado / 2, p.lado, p.lado, 1 - t * t);
        }
    }

    limpar() {
        this.vivas = 0;
    }
}