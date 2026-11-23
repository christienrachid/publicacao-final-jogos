import { efeito } from "../../systems/som.js";
import { FASE1, MONSTROS } from "../config.js";
import { criarCorpo, moverCorpo, sobrepoe } from "../fisica.js";
import { Monstro } from "./Monstro.js";

// Vampiro: das 21h em diante, um vivo por
// vez, nasce num ponto de chão fora da vista. Persegue o jogador pelo chão
// com a física de plataforma (pula os degraus como o zumbi) e, a
// MONSTROS.vampiro.alcanceDoDash px dele, para com os olhos brilhando (o
// aviso) e dá um dash reto na direção guardada no início do aviso.
//
// Estados:
//   "andando"   persegue o jogador
//   "avisando"  parado por `aviso` s; o diretor desenha os olhos com alfa 1
//               por cima da escuridão (Diretor.desenharBrilho)
//   "dash"      reto a dash.velocidade × a velocidade do jogador por
//               dash.duracao s, sem gravidade; para ao bater numa parede
//   "pausa"     parado por `pausa` s, depois volta a andar
//
// O dash tira `dano` corações; encostar fora do dash tira `danoDeContato`.
// Vida 1: qualquer toque de luz mata (levarLuz). Conta como monstro comum ao
// morrer (coração e estatísticas, Diretor.aoMorrer).
//
// Desenho: quadros 32 a 39 da folha de inimigos (QUADROS.vampiro em
// folha.js), olhando para a esquerda como a folha.

export class Vampiro extends Monstro {
    // x: meio da base; pes: y do chão (px do mundo)
    constructor(mapa, x, pes) {
        super("vampiro");
        const d = this.dados;
        this.mapa = mapa;
        this.corpo = criarCorpo(x - d.largura / 2, pes - d.altura, d.largura, d.altura);
        this.limites = { esquerdo: mapa.limiteEsquerdo, direito: mapa.limiteDireito };
        // MONSTROS.vampiro.velocidade é uma fração da velocidade do jogador
        this.velocidade = this.velocidadeBase * FASE1.jogador.velocidade;
        this.estado = "andando";
        this.tempoDoEstado = 0;
        // direção do dash (vetor unitário), guardada no início do aviso
        this.direcaoDoDash = { x: 0, y: 0 };
        // aparecendo aos poucos, sem ferir
        this.surgindo = 0;
        this.ferindo = false;
        this.alfa = 0;
    }

    caixa() {
        const c = this.corpo;
        return { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    }

    // Qualquer toque de luz mata (a lanterna tira um pouco por quadro).
    levarLuz(_dano, _lanterna) {
        if (!this.vivo) {
            return;
        }
        this.vida = 0;
        this.iluminado = 0.12;
        this.morrer(true);
    }

    trocarEstado(estado) {
        this.estado = estado;
        this.tempoDoEstado = 0;
    }

    mover(dt, diretor) {
        const d = this.dados;
        const corpo = this.corpo;
        const jogador = diretor.jogador;
        const meu = this.centro();
        const dele = jogador.centro();
        const dx = dele.x - meu.x;
        const dy = dele.y - meu.y;
        this.tempoDoEstado += dt;

        if (this.surgindo < d.surgir) {
            this.surgindo += dt;
            const t = Math.min(1, this.surgindo / d.surgir);
            this.alfa = t;
            if (t >= 1) {
                this.ferindo = true;
                this.alfa = 1;
            }
        }

        if (this.estado === "dash") {
            const v = d.dash.velocidade * FASE1.jogador.velocidade;
            corpo.vx = this.direcaoDoDash.x * v;
            corpo.vy = this.direcaoDoDash.y * v;
            moverCorpo(corpo, dt, this.mapa, this.limites);
            if (corpo.bateuX !== 0 || corpo.bateuCabeca || this.tempoDoEstado >= d.dash.duracao) {
                // volta a cair com a gravidade
                corpo.vx = 0;
                corpo.vy = 0;
                this.trocarEstado("pausa");
            }
        } else {
            if (this.estado === "andando") {
                // sempre na direção do jogador (parado em cima dele ou com ele morto)
                const direcao = !jogador.vivo || Math.abs(dx) < 3 ? 0 : Math.sign(dx);
                corpo.vx = direcao * this.velocidade;
                if (direcao !== 0) {
                    this.olhando = direcao;
                }
                if (this.ferindo && jogador.vivo && corpo.noChao && Math.hypot(dx, dy) <= d.alcanceDoDash) {
                    const comprimento = Math.hypot(dx, dy) || 1;
                    this.direcaoDoDash.x = dx / comprimento;
                    this.direcaoDoDash.y = dy / comprimento;
                    if (dx !== 0) {
                        this.olhando = Math.sign(dx);
                    }
                    corpo.vx = 0;
                    this.trocarEstado("avisando");
                    efeito("vampiro-dash");
                }
            } else if (this.estado === "avisando") {
                corpo.vx = 0;
                if (this.tempoDoEstado >= d.aviso) {
                    this.trocarEstado("dash");
                }
            } else if (this.estado === "pausa") {
                corpo.vx = 0;
                if (this.tempoDoEstado >= d.pausa) {
                    this.trocarEstado("andando");
                }
            }

            // gravidade, degraus e o movimento na grade (como Zumbi.mover)
            const querAndar = corpo.vx;
            corpo.vy = Math.min(600, corpo.vy + d.gravidade * dt);
            moverCorpo(corpo, dt, this.mapa, this.limites);
            if (corpo.bateuX !== 0 && corpo.noChao && querAndar !== 0) {
                corpo.vy = -d.pulo;
            }
        }

        // caiu fora do mapa (no mar): some
        if (corpo.y > this.mapa.altura + MONSTROS.margemDoMapa) {
            this.removido = true;
            this.cancelarLuz();
        }
    }

    // Encostar fere com danoDeContato; no dash, com o dano do dash.
    ferirPorContato(jogador) {
        if (!this.ferindo || !jogador.vivo) {
            return;
        }
        if (sobrepoe(this.caixa(), jogador.caixa())) {
            const dano = this.estado === "dash" ? this.dados.dano : this.dados.danoDeContato;
            jogador.levarDano(dano, this.centro());
        }
    }

    // Olhos por cima da escuridão: alfa 1 no aviso, mais apagados fora dele.
    alfaDosOlhos() {
        if (this.estado === "avisando" && this.vivo) {
            return 1;
        }
        return this.opacidade() * this.dados.olhosNoEscuro;
    }

    quadroVivo() {
        const q = this.quadros;
        if (this.estado === "dash") {
            return q.dash;
        }
        if (this.estado === "andando" && Math.abs(this.corpo.vx) > 1) {
            // andando: os quadros q.andando[0] a q.andando[1]
            const [primeiro, ultimo] = q.andando;
            const n = ultimo - primeiro + 1;
            return primeiro + (Math.floor((this.tempo * 1000) / this.dados.msAndar) % n);
        }
        return q.parado;
    }
}
