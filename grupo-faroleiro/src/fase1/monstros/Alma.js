import { Monstro } from "./Monstro.js";

// Alma voadora: voa em ondas até ficar
// acima do jogador e mergulha nele (quadros 12 e 13); depois sobe e repete.
// Atravessa o terreno (é um espírito). Na luz ela recua para longe do
// jogador e morre depressa sob a luz (MONSTROS.alma.vida).
//
// Estados: "surgindo" (aparecendo), "voando", "mergulhando" e "subindo".
// (x, y) é o meio do corpo.

export class Alma extends Monstro {
    constructor(x, y, opcoes = {}) {
        super("alma", opcoes);
        const d = this.dados;
        this.x = x;
        this.y = y;
        this.largura = d.largura * this.escala;
        this.altura = d.altura * this.escala;
        this.estado = "surgindo";
        this.tempoDoEstado = 0;
        this.esperaDoMergulho = d.esperaDoMergulho * 0.5;
        // direção do mergulho (normalizada)
        this.dirX = 0;
        this.dirY = 0;
        this.distanciaDoMergulho = 0;
        // recuo da luz: tempo restante e direção
        this.recuo = 0;
        this.recuoX = 0;
        this.recuoY = 0;
        this.ferindo = false;
        this.alfa = 0;
    }

    caixa() {
        return { x: this.x - this.largura / 2, y: this.y - this.altura / 2, largura: this.largura, altura: this.altura };
    }

    centro() {
        return { x: this.x, y: this.y };
    }

    // o corpo fica no meio do quadro (linhas 8 a 23)
    baseDoDesenho() {
        return { x: this.x, y: this.y + 16 * this.escala };
    }

    trocarEstado(estado) {
        this.estado = estado;
        this.tempoDoEstado = 0;
    }

    aoLevarLuz(_dano, lanterna) {
        // recua para longe da boca da lanterna
        const dx = this.x - lanterna.x;
        const dy = this.y - lanterna.y;
        const d = Math.hypot(dx, dy) || 1;
        this.recuo = 0.15;
        this.recuoX = dx / d;
        this.recuoY = dy / d;
        if (this.estado === "mergulhando") {
            this.trocarEstado("subindo");
            this.esperaDoMergulho = this.dados.esperaDoMergulho;
        }
    }

    mover(dt, diretor) {
        const d = this.dados;
        this.tempoDoEstado += dt;
        this.esperaDoMergulho = Math.max(0, this.esperaDoMergulho - dt);
        const jogador = diretor.jogador;
        const alvo = jogador.centro();
        const velocidade = this.velocidadeBase;

        if (this.estado === "surgindo") {
            this.alfa = Math.min(1, this.tempoDoEstado / d.surgir);
            if (this.alfa >= 1) {
                this.trocarEstado("voando");
                this.ferindo = true;
            }
        }

        if (this.recuo > 0) {
            this.recuo -= dt;
            this.x += this.recuoX * d.recuo * dt;
            this.y += this.recuoY * d.recuo * dt;
        } else if (this.estado === "mergulhando") {
            const passo = d.mergulho * (velocidade / d.velocidade) * dt;
            this.x += this.dirX * passo;
            this.y += this.dirY * passo;
            this.distanciaDoMergulho -= passo;
            if (this.distanciaDoMergulho <= 0 || this.tempoDoEstado > 1.6) {
                this.trocarEstado("subindo");
                this.esperaDoMergulho = d.esperaDoMergulho;
            }
        } else {
            // voando (ou subindo, mais devagar no começo): acima do jogador, em ondas
            const lado = this.x < alvo.x ? -1 : 1;
            const tx = alvo.x + lado * 24 * this.escala;
            const ty = alvo.y - d.alturaDoVoo + Math.sin(this.tempo * d.ritmoDaOnda) * d.onda;
            const dx = tx - this.x;
            const dy = ty - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
                const v = Math.min(dist, velocidade * dt * (this.estado === "subindo" ? 0.8 : 1));
                this.x += (dx / dist) * v;
                this.y += (dy / dist) * v;
            }
            this.olhando = alvo.x < this.x ? -1 : 1;
            if (this.estado === "subindo" && this.tempoDoEstado > 0.9) {
                this.trocarEstado("voando");
            }
            // mergulho: perto, acima e com o jogador vivo
            const hx = Math.abs(alvo.x - this.x);
            if (
                this.estado === "voando" &&
                this.esperaDoMergulho <= 0 &&
                jogador.vivo &&
                hx < d.distanciaDoMergulho &&
                this.y < alvo.y - 10
            ) {
                const mx = alvo.x - this.x;
                const my = alvo.y - this.y;
                const md = Math.hypot(mx, my) || 1;
                this.dirX = mx / md;
                this.dirY = my / md;
                // passa um pouco do ponto em que o jogador estava
                this.distanciaDoMergulho = md + 24;
                this.olhando = mx < 0 ? -1 : 1;
                this.trocarEstado("mergulhando");
            }
        }
        // não sai pelo alto do mapa
        this.y = Math.max(this.altura, this.y);
    }

    quadroVivo() {
        const q = this.quadros;
        if (this.estado === "mergulhando") {
            return q.mergulho[Math.floor(this.tempo * 10) % q.mergulho.length];
        }
        return q.voar[Math.floor(this.tempo * this.dados.fps) % q.voar.length];
    }
}
