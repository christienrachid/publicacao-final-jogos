import { sobrepoe, criarCorpo, moverCorpo } from "../fisica.js";
import { MONSTROS } from "../config.js";
import { Monstro } from "./Monstro.js";

// Caranguejo sombrio: sai do mar num dos
// pontos SpawnMar, anda pelo chão com a física de plataforma (pula os
// degraus do relevo), sobe a praia em direção ao meio da ilha, persegue o
// jogador quando ele está perto e ataca com a pinça (quadros 4 e 5).
//
// Estados: "surgindo" (saindo da água até a beira da praia, sem física),
// "andando" e "atacando".

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

export class Caranguejo extends Monstro {
    // saida: { x, y } do ponto no mar; praia: { x, y } da beira da praia
    // (pés), para onde ele sobe ao surgir
    constructor(mapa, saida, praia, opcoes = {}) {
        super("caranguejo", opcoes);
        const d = this.dados;
        this.mapa = mapa;
        const largura = Math.round(d.largura * this.escala);
        const altura = Math.round(d.altura * this.escala);
        this.corpo = criarCorpo(saida.x - largura / 2, saida.y, largura, altura);
        this.limites = { esquerdo: mapa.limiteEsquerdo, direito: mapa.limiteDireito };
        this.saida = { x: saida.x, y: saida.y + altura * 0.5 };
        this.praia = praia;
        this.olhando = praia.x > saida.x ? 1 : -1;
        this.estado = "surgindo";
        this.tempoDoEstado = 0;
        this.esperaDoAtaque = 0;
        this.golpeDado = false;
        // para onde anda quando não está caçando (o meio da ilha, com folga)
        this.alvoX = null;
        this.ferindo = false;
        this.alfa = 0;
        this.colocarNaSaida(0);
    }

    caixa() {
        const c = this.corpo;
        return { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    }

    // Surgindo: do mar até a beira da praia, aparecendo aos poucos.
    colocarNaSaida(t) {
        const s = t * t * (3 - 2 * t);
        const c = this.corpo;
        const x = this.saida.x + (this.praia.x - this.saida.x) * s;
        const pes = this.saida.y + (this.praia.y - this.saida.y) * s;
        c.x = x - c.largura / 2;
        c.y = pes - c.altura;
        this.alfa = Math.min(1, t * 2);
    }

    mover(dt, diretor) {
        const d = this.dados;
        this.tempoDoEstado += dt;
        this.esperaDoAtaque = Math.max(0, this.esperaDoAtaque - dt);
        if (this.estado === "surgindo") {
            const t = Math.min(1, this.tempoDoEstado / d.surgir);
            this.colocarNaSaida(t);
            if (t >= 1) {
                this.estado = "andando";
                this.tempoDoEstado = 0;
                this.ferindo = true;
                this.alfa = 1;
            }
            return;
        }

        const corpo = this.corpo;
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
            const cacando = jogador.vivo && Math.hypot(dx, dy) < d.distanciaDeCaca * this.escala;
            let alvo;
            if (cacando) {
                alvo = dele.x;
                this.alvoX = null;
            } else {
                if (this.alvoX === null || Math.abs(this.alvoX - meu.x) < 4) {
                    this.alvoX = diretor.meioDaIlha + sortear(-160, 160);
                }
                alvo = this.alvoX;
            }
            const direcao = Math.abs(alvo - meu.x) < 3 ? 0 : Math.sign(alvo - meu.x);
            const velocidade = (cacando ? d.perseguir : d.velocidade) * (this.velocidadeBase / d.velocidade);
            corpo.vx = direcao * velocidade;
            if (direcao !== 0) {
                this.olhando = direcao;
            }
            // pinça: perto do jogador e mais ou menos na mesma altura
            const alcance = d.distanciaDoAtaque * this.escala;
            if (jogador.vivo && this.esperaDoAtaque <= 0 && corpo.noChao && Math.abs(dx) < alcance + corpo.largura / 2 && Math.abs(dy) < 18 * this.escala) {
                this.olhando = dx < 0 ? -1 : 1;
                this.estado = "atacando";
                this.tempoDoEstado = 0;
                this.golpeDado = false;
                corpo.vx = 0;
            }
        }

        // gravidade, degraus e o movimento na grade
        const querAndar = corpo.vx;
        corpo.vy = Math.min(600, corpo.vy + d.gravidade * dt);
        moverCorpo(corpo, dt, this.mapa, this.limites);
        if (corpo.bateuX !== 0 && corpo.noChao && querAndar !== 0) {
            corpo.vy = -d.pulo;
        }
        // caiu fora do mapa (no mar): some
        if (corpo.y > this.mapa.altura + MONSTROS.margemDoMapa) {
            this.removido = true;
            this.cancelarLuz();
        }
    }

    // A pinça acerta uma caixa à frente do caranguejo.
    golpear(jogador) {
        if (!jogador.vivo) {
            return;
        }
        const c = this.caixa();
        const alcance = this.dados.alcanceDaPinca * this.escala;
        const golpe = {
            x: this.olhando > 0 ? c.x + c.largura : c.x - alcance,
            y: c.y - 4 * this.escala,
            largura: alcance,
            altura: c.altura + 4 * this.escala,
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
        const andando = this.estado === "surgindo" || Math.abs(this.corpo.vx) > 1;
        if (!andando) {
            return q.andar[0];
        }
        return q.andar[Math.floor(this.tempo * this.dados.fps) % q.andar.length];
    }
}
