import { loader } from "melonjs";
import { imagem } from "../../systems/estilo.js";
import { emitirPoeira } from "../../systems/particulas.js";
import { FASE1, MONSTROS } from "../config.js";
import { criarCorpo, moverCorpo } from "../fisica.js";
import { Monstro } from "./Monstro.js";

// Zumbi: só nasce de uma lápide (Lapide.js),
// sai da terra ao pé dela, persegue o jogador pelo chão com a física de
// plataforma e pula os degraus como o caranguejo. Fere por contato
// (Monstro.ferirPorContato) e conta como monstro comum ao morrer (coração e
// estatísticas, Diretor.aoMorrer).
//
// Desenho: zumbi-<tema>.png, quadros de 24×24 com o layout do jogador
// (QUADROS.zumbi em folha.js), olhando para a direita: espelhado quando anda
// para a esquerda. Os olhos são foscos: o diretor não desenha olhos dele por
// cima da escuridão.

const QUADRO = 24;
const COLUNAS = 8;

export class Zumbi extends Monstro {
    // x: meio da base; pes: y do chão (px do mundo); lapide: de onde saiu
    constructor(mapa, x, pes, lapide = null) {
        super("zumbi");
        const d = this.dados;
        this.mapa = mapa;
        this.lapide = lapide;
        this.corpo = criarCorpo(x - d.largura / 2, pes - d.altura, d.largura, d.altura);
        this.limites = { esquerdo: mapa.limiteEsquerdo, direito: mapa.limiteDireito };
        // MONSTROS.zumbi.velocidade é uma fração da velocidade do jogador
        this.velocidade = this.velocidadeBase * FASE1.jogador.velocidade;
        this.olhando = 1;
        // saindo da terra: sem ferir e aparecendo aos poucos
        this.surgindo = 0;
        this.ferindo = false;
        this.alfa = 0;
        emitirPoeira(x, pes);
    }

    caixa() {
        const c = this.corpo;
        return { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    }

    mover(dt, diretor) {
        const d = this.dados;
        const corpo = this.corpo;
        const jogador = diretor.jogador;
        const dx = jogador.centro().x - this.centro().x;
        if (this.surgindo < d.surgir) {
            this.surgindo += dt;
            const t = Math.min(1, this.surgindo / d.surgir);
            this.alfa = t;
            if (dx !== 0) {
                this.olhando = Math.sign(dx);
            }
            if (t >= 1) {
                this.ferindo = true;
                this.alfa = 1;
            }
            return;
        }

        // sempre na direção do jogador (parado em cima dele ou com ele morto)
        const direcao = !jogador.vivo || Math.abs(dx) < 3 ? 0 : Math.sign(dx);
        corpo.vx = direcao * this.velocidade;
        if (direcao !== 0) {
            this.olhando = direcao;
        }

        // gravidade, degraus e o movimento na grade (como Caranguejo.mover)
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

    quadroVivo() {
        const q = this.quadros;
        const d = this.dados;
        const ms = this.tempo * 1000;
        if (Math.abs(this.corpo.vx) > 1) {
            return q.andar[Math.floor(ms / d.msAndar) % q.andar.length];
        }
        return q.parado[Math.floor(ms / d.msParado) % q.parado.length];
    }

    // morrendo: os quadros 11 a 14 ao longo de MONSTROS.morte
    quadroAtual() {
        if (this.morrendo) {
            const q = this.quadros.morrendo;
            const i = Math.min(q.length - 1, Math.floor((this.tempoMorte / MONSTROS.morte) * q.length));
            return q[i];
        }
        return super.quadroAtual();
    }

    // img (a folha de inimigos) não serve: o zumbi tem a folha dele
    desenhar(renderer, _img) {
        const alfa = this.opacidade();
        if (this.removido || alfa <= 0) {
            return;
        }
        const folha = loader.getImage(imagem("zumbi"));
        const quadro = this.quadroAtual();
        const sx = (quadro % COLUNAS) * QUADRO;
        const sy = Math.floor(quadro / COLUNAS) * QUADRO;
        const b = this.baseDoDesenho();
        const x = Math.round(b.x - QUADRO / 2);
        const y = Math.round(b.y - QUADRO);
        renderer.save();
        renderer.setGlobalAlpha(alfa);
        if (this.olhando < 0) {
            renderer.translate(x + QUADRO, y);
            renderer.scale(-1, 1);
            renderer.drawImage(folha, sx, sy, QUADRO, QUADRO, 0, 0, QUADRO, QUADRO);
        } else {
            renderer.drawImage(folha, sx, sy, QUADRO, QUADRO, x, y, QUADRO, QUADRO);
        }
        renderer.restore();
    }
}
