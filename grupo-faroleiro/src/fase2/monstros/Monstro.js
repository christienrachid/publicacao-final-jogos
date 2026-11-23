import { emitirBrasa } from "../../systems/particulas.js";
import { diferencaDeAngulo } from "../facho.js";
import { FAROL, MELHORIA, MINI_CHEFE, MONSTROS, TORRE } from "../config.js";
import { QUADROS, SOMBRA, desenharQuadro } from "./folha.js";

// Base dos monstros da Fase 2. Cada tipo (Morcego, Piranha, Serpente)
// implementa mover(dt, diretor); a base cuida da vida, do quadro de dano, da
// morte, da mordida na torre e do desenho girado na direção do movimento.
//
// Posição: (x, y) é o ponto no chão (ou na água); quem voa ou salta é
// desenhado `altura` px acima, com a sombra no chão. O facho mira o corpo,
// em (x, yCorpo).
//
// Lento (melhoria Luz que queima): enquanto `lento` > 0, o monstro anda,
// morde e anima a MELHORIA.lentidao da velocidade, soltando brasas.

// tempo da animação de morte (s) e do quadro branco de dano (s)
const MORTE = 0.42;
const FLASH = 0.12;
// rapidez com que o desenho vira para a direção do movimento (1/s)
const GIRO = 14;
// investida da mordida: px na direção da torre e duração (s)
const INVESTIDA_PX = 5;
const INVESTIDA = 0.18;

export class Monstro {
    constructor(tipo, { chefe = false } = {}) {
        const dados = MONSTROS[tipo];
        this.tipo = tipo;
        this.dados = dados;
        this.quadros = QUADROS[tipo];
        this.chefe = chefe;
        this.escala = chefe ? MINI_CHEFE.escala : 1;
        this.vidaMaxima = dados.vida * (chefe ? MINI_CHEFE.vida : 1);
        this.vida = this.vidaMaxima;
        this.raio = dados.raio * this.escala;
        this.velocidade = dados.velocidade * (chefe ? MINI_CHEFE.velocidade : 1);
        this.dano = dados.dano * (chefe ? MINI_CHEFE.dano : 1);
        this.x = 0;
        this.y = 0;
        // altura do corpo acima do chão (voo, salto), em px
        this.altura = 0;
        // escala extra do desenho (o salto da piranha cresce)
        this.escalaExtra = 0;
        this.angulo = 0;
        this.anim = Math.random();
        this.flash = 0;
        this.morrendo = false;
        this.tempoMorte = 0;
        this.removido = false;
        // último disparo do facho que acertou (um dano por disparo)
        this.ultimoDisparo = -1;
        // false enquanto não pode levar dano (piranha ainda embaixo d'água)
        this.atingivel = true;
        // true para quem voa: desenhado por cima de quem nada ou anda
        this.voando = false;
        // sombra no chão (voo e salto)
        this.sombra = false;
        // mordendo a torre de perto
        this.atacando = false;
        this.proximaMordida = 0;
        this.investida = 0;
        // opacidade (o surgimento da piranha vai de 0 a 1)
        this.alfa = 1;
        // segundos que ainda faltam de lentidão (Luz que queima)
        this.lento = 0;
        // posição anterior, para girar na direção do movimento
        this.xAntes = 0;
        this.yAntes = 0;
    }

    get vivo() {
        return !this.morrendo && !this.removido;
    }

    get yCorpo() {
        return this.y - this.altura;
    }

    // Põe o monstro em (x, y) já virado para `angulo`.
    colocar(x, y, angulo = Math.atan2(FAROL.y - y, FAROL.x - x)) {
        this.x = x;
        this.y = y;
        this.xAntes = x;
        this.yAntes = y;
        this.angulo = angulo;
    }

    // Leva dano; devolve true se morreu agora.
    levarDano(dano) {
        if (!this.vivo) {
            return false;
        }
        this.vida -= dano;
        this.flash = FLASH;
        if (this.vida <= 0) {
            this.morrer();
            return true;
        }
        this.aoLevarDano();
        return false;
    }

    // gancho: reação a um dano que não matou (recuo da serpente)
    aoLevarDano() {}

    // A luz que queima deixa o monstro lento por `segundos`.
    queimar(segundos) {
        this.lento = Math.max(this.lento, segundos);
    }

    morrer() {
        this.morrendo = true;
        this.tempoMorte = 0;
        this.atacando = false;
    }

    // dt em segundos
    atualizar(dt, diretor) {
        if (this.removido) {
            return;
        }
        if (this.morrendo) {
            this.tempoMorte += dt;
            // quem morre no ar cai devagar
            this.altura = Math.max(0, this.altura - 40 * dt);
            if (this.tempoMorte >= MORTE) {
                this.removido = true;
            }
            return;
        }
        if (this.lento > 0) {
            this.lento = Math.max(0, this.lento - dt);
            if (Math.random() < dt * 9) {
                emitirBrasa(this.x, this.yCorpo);
            }
            dt *= MELHORIA.lentidao;
        }
        this.anim += dt;
        this.flash = Math.max(0, this.flash - dt);
        this.investida = Math.max(0, this.investida - dt);
        this.xAntes = this.x;
        this.yAntes = this.y - this.altura;
        if (this.atacando) {
            this.morder(dt, diretor);
        } else {
            this.mover(dt, diretor);
        }
        this.virar(dt);
    }

    // gancho de cada tipo
    mover(_dt, _diretor) {}

    // Vira o desenho para onde andou (ou para a torre, mordendo).
    virar(dt) {
        let alvo;
        if (this.atacando) {
            alvo = Math.atan2(FAROL.y - this.y, FAROL.x - this.x);
        } else {
            const dx = this.x - this.xAntes;
            const dy = this.y - this.altura - this.yAntes;
            if (dx * dx + dy * dy < 0.0001) {
                return;
            }
            alvo = Math.atan2(dy, dx);
        }
        const d = diferencaDeAngulo(alvo, this.angulo);
        this.angulo += d * Math.min(1, GIRO * dt);
    }

    // Para perto da torre e passa a morder de tempos em tempos.
    comecarAtaque() {
        this.atacando = true;
        this.proximaMordida = 0.35;
        this.altura = this.voando ? this.altura : 0;
    }

    morder(dt, diretor) {
        this.proximaMordida -= dt;
        if (this.proximaMordida <= 0) {
            this.proximaMordida = this.chefe ? MINI_CHEFE.mordida : (this.dados.mordida ?? MINI_CHEFE.mordida);
            this.investida = INVESTIDA;
            diretor.danificarTorre(this.dano, this);
        }
    }

    // Ponto de parada para morder, na direção de onde o monstro está.
    pontoDeAtaque() {
        const a = Math.atan2(this.y - FAROL.y, this.x - FAROL.x);
        const r = TORRE.raioDeAtaque + (this.chefe ? 10 : 0);
        return { x: FAROL.x + Math.cos(a) * r, y: FAROL.y + Math.sin(a) * r };
    }

    quadroAtual() {
        const q = this.quadros;
        if (this.morrendo) {
            const i = Math.min(q.morte.length - 1, Math.floor((this.tempoMorte / MORTE) * q.morte.length));
            return q.morte[i];
        }
        if (this.flash > 0) {
            return q.dano;
        }
        const fps = this.dados.fps * (this.atacando ? 1.5 : 1);
        return q.anim[Math.floor(this.anim * fps) % q.anim.length];
    }

    // posição do corpo no desenho (com a investida da mordida)
    posicaoDoDesenho(saida) {
        let x = this.x;
        let y = this.y - this.altura;
        if (this.investida > 0) {
            const t = this.investida / INVESTIDA;
            const empurrao = Math.sin(t * Math.PI) * INVESTIDA_PX;
            x += Math.cos(this.angulo) * empurrao;
            y += Math.sin(this.angulo) * empurrao;
        }
        saida.x = x;
        saida.y = y;
        return saida;
    }

    desenharSombra(renderer, img) {
        if (!this.sombra || this.removido) {
            return;
        }
        const dados = this.dados;
        const desloca = this.voando ? 1 : Math.min(1, this.altura / 20);
        const sx = (dados.sombraX ?? 4) * desloca * this.escala;
        const sy = (dados.sombraY ?? 4) * desloca * this.escala + (this.voando ? 0 : this.altura * 0.35);
        const alfa = (dados.sombraOpacidade ?? 0.4) * this.alfa * (this.morrendo ? 1 - this.tempoMorte / MORTE : 1);
        const escala = this.escala * (this.voando ? 0.8 : 0.7 - this.escalaExtra * 0.3);
        desenharQuadro(renderer, img, SOMBRA, this.x + sx, this.y + sy, 0, escala, alfa);
    }

    desenhar(renderer, img) {
        if (this.removido) {
            return;
        }
        const p = this.posicaoDoDesenho(PONTO);
        const escala = this.escala * (1 + this.escalaExtra);
        desenharQuadro(renderer, img, this.quadroAtual(), p.x, p.y, this.angulo, escala, this.alfa);
    }
}

const PONTO = { x: 0, y: 0 };

// Direção normalizada de (x, y) até o farol, em `saida`.
export function direcaoAoFarol(x, y, saida) {
    const dx = FAROL.x - x;
    const dy = FAROL.y - y;
    const d = Math.hypot(dx, dy) || 1;
    saida.x = dx / d;
    saida.y = dy / d;
    saida.d = d;
    return saida;
}
