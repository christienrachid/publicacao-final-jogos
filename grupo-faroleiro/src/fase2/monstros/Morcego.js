import { TORRE } from "../config.js";
import { Monstro, direcaoAoFarol } from "./Monstro.js";

// Morcego: voa de uma borda da tela até o farol em leve zigue-zague, rápido
// e frágil, com a sombra no chão. O comum se joga na torre; o mini-chefe
// para em volta dela, batendo asas, e morde.

const DIRECAO = { x: 0, y: 0, d: 0 };

export class Morcego extends Monstro {
    constructor(opcoes) {
        super("morcego", opcoes);
        this.voando = true;
        this.sombra = true;
        // a linha reta até o farol (o zigue-zague é um desvio de lado dela)
        this.baseX = 0;
        this.baseY = 0;
        this.fase = Math.random() * Math.PI * 2;
        this.tempoDeVoo = 0;
        // balanço no ar enquanto morde
        this.balanco = Math.random() * Math.PI * 2;
    }

    colocar(x, y, angulo) {
        super.colocar(x, y, angulo);
        this.baseX = x;
        this.baseY = y;
    }

    mover(dt, diretor) {
        this.tempoDeVoo += dt;
        const dir = direcaoAoFarol(this.baseX, this.baseY, DIRECAO);
        const parada = this.chefe ? TORRE.raioDeAtaque + 14 : TORRE.raio;
        const passo = Math.min(this.velocidade * dt, Math.max(0, dir.d - parada));
        this.baseX += dir.x * passo;
        this.baseY += dir.y * passo;
        // o zigue-zague some perto da torre, para o golpe ser certeiro
        const restante = dir.d - passo - parada;
        const amplitude = this.dados.zigueAmplitude * this.escala * Math.min(1, restante / 60);
        const desvio = Math.sin(this.tempoDeVoo * this.dados.zigueFrequencia + this.fase) * amplitude;
        this.x = this.baseX - dir.y * desvio;
        this.y = this.baseY + dir.x * desvio;

        if (restante <= 0.5) {
            if (this.chefe) {
                this.comecarAtaque();
            } else {
                diretor.chegouNaTorre(this);
            }
        }
    }

    morder(dt, diretor) {
        // paira em volta do ponto de ataque
        this.balanco += dt * 3;
        this.x = this.baseX + Math.cos(this.balanco) * 3;
        this.y = this.baseY + Math.sin(this.balanco * 1.3) * 2;
        super.morder(dt, diretor);
    }
}
