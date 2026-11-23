import { criarCorpo, moverCorpo, sobrepoe } from "../fisica.js";
import { MONSTROS } from "../config.js";
import { Monstro } from "../monstros/Monstro.js";

// Pirata fantasma do Holandês (etapas 2 e 3): desce do navio pela prancha de luz até o topo do morro, anda pelo
// morro e pelas encostas com a física de plataforma (pula os degraus),
// persegue o jogador e ataca com o sabre (quadros 20 e 21). Morre com pouco
// de luz (MONSTROS.pirata.vida). Não sai de perto do morro (`limites`, os
// mesmos x das balas): com o jogador longe, espera na ponta do lado dele.
//
// Estados: "descendo" (pela prancha, sem física e sem ferir), "andando" e
// "atacando". O Holandês cria e põe no diretor (diretor.adicionar), que
// atualiza, desenha e conta a morte.

export class Pirata extends Monstro {
    // de: { x, y } dos pés no convés; ate: { x, y } dos pés no morro;
    // limites: { esquerdo, direito } (x do mundo) por onde ele anda
    constructor(mapa, de, ate, limites) {
        super("pirata");
        const d = this.dados;
        this.mapa = mapa;
        this.corpo = criarCorpo(de.x - d.largura / 2, de.y - d.altura, d.largura, d.altura);
        this.limites = {
            esquerdo: Math.max(mapa.limiteEsquerdo, limites.esquerdo),
            direito: Math.min(mapa.limiteDireito, limites.direito),
        };
        this.de = { x: de.x, y: de.y };
        this.ate = { x: ate.x, y: ate.y };
        this.olhando = ate.x > de.x ? 1 : -1;
        this.estado = "descendo";
        this.tempoDoEstado = 0;
        this.esperaDoAtaque = 0;
        this.golpeDado = false;
        this.ferindo = false;
        this.alfa = 0;
        this.colocarNaPrancha(0);
    }

    caixa() {
        const c = this.corpo;
        return { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    }

    // O convés anda com o navio: o Holandês atualiza o começo da prancha.
    moverConves(x, y) {
        this.de.x = x;
        this.de.y = y;
    }

    colocarNaPrancha(t) {
        const c = this.corpo;
        const x = this.de.x + (this.ate.x - this.de.x) * t;
        const pes = this.de.y + (this.ate.y - this.de.y) * t;
        c.x = x - c.largura / 2;
        c.y = pes - c.altura;
        this.alfa = Math.min(1, t * 3);
    }

    mover(dt, diretor) {
        const d = this.dados;
        this.tempoDoEstado += dt;
        this.esperaDoAtaque = Math.max(0, this.esperaDoAtaque - dt);
        const corpo = this.corpo;
        if (this.estado === "descendo") {
            const t = Math.min(1, this.tempoDoEstado / d.descer);
            this.colocarNaPrancha(t);
            if (t >= 1) {
                this.estado = "andando";
                this.tempoDoEstado = 0;
                this.ferindo = true;
                this.alfa = 1;
                corpo.vx = 0;
                corpo.vy = 0;
            }
            return;
        }

        const jogador = diretor.jogador;
        const meu = this.centro();
        const dele = jogador.centro();
        const dx = dele.x - meu.x;
        const dy = dele.y - meu.y;

        if (this.estado === "atacando") {
            corpo.vx = 0;
            if (!this.golpeDado && this.tempoDoEstado >= d.golpe) {
                this.golpeDado = true;
                this.golpear(jogador);
            }
            if (this.tempoDoEstado >= d.ataque) {
                this.estado = "andando";
                this.tempoDoEstado = 0;
                this.esperaDoAtaque = d.esperaDoAtaque;
            }
        } else {
            // persegue o jogador perto; longe, anda na direção dele, até a
            // ponta do morro (não passa dos limites)
            const cacando = jogador.vivo && Math.hypot(dx, dy) < d.distanciaDeCaca;
            const meia = corpo.largura / 2;
            const alvo = jogador.vivo ? Math.min(this.limites.direito - meia, Math.max(this.limites.esquerdo + meia, dele.x)) : meu.x;
            const direcao = Math.abs(alvo - meu.x) < 3 ? 0 : Math.sign(alvo - meu.x);
            corpo.vx = direcao * (cacando ? d.perseguir : d.velocidade);
            if (direcao !== 0) {
                this.olhando = direcao;
            }
            if (
                jogador.vivo &&
                this.esperaDoAtaque <= 0 &&
                corpo.noChao &&
                Math.abs(dx) < d.distanciaDoAtaque + corpo.largura / 2 &&
                Math.abs(dy) < 20
            ) {
                this.olhando = dx < 0 ? -1 : 1;
                this.estado = "atacando";
                this.tempoDoEstado = 0;
                this.golpeDado = false;
                corpo.vx = 0;
            }
        }

        const querAndar = corpo.vx;
        corpo.vy = Math.min(600, corpo.vy + d.gravidade * dt);
        moverCorpo(corpo, dt, this.mapa, this.limites);
        if (corpo.bateuX !== 0 && corpo.noChao && querAndar !== 0) {
            corpo.vy = -d.pulo;
        }
        if (corpo.y > this.mapa.altura + MONSTROS.margemDoMapa) {
            this.removido = true;
            this.cancelarLuz();
        }
    }

    // O sabre acerta uma caixa à frente do pirata.
    golpear(jogador) {
        if (!jogador.vivo) {
            return;
        }
        const c = this.caixa();
        const alcance = this.dados.alcanceDoSabre;
        const golpe = {
            x: this.olhando > 0 ? c.x + c.largura : c.x - alcance,
            y: c.y + 2,
            largura: alcance,
            altura: c.altura - 2,
        };
        if (sobrepoe(golpe, jogador.caixa()) || sobrepoe(c, jogador.caixa())) {
            jogador.levarDano(this.dano, this.centro());
        }
    }

    quadroVivo() {
        const q = this.quadros;
        if (this.estado === "atacando") {
            return this.tempoDoEstado < this.dados.golpe ? q.ataque[0] : q.ataque[1];
        }
        const andando = this.estado === "descendo" || Math.abs(this.corpo.vx) > 1;
        if (!andando) {
            return q.andar[0];
        }
        return q.andar[Math.floor(this.tempo * this.dados.fps) % q.andar.length];
    }
}