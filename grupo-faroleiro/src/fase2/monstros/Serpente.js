import { FAROL, ILHA } from "../config.js";
import { Monstro } from "./Monstro.js";

// Serpente do mar: nada em volta da ilha num círculo que se fecha (uma
// espiral na forma da elipse da ilha), aguenta vários disparos e, quando
// chega perto, para e morde a torre. Cada disparo que não a mata a empurra
// um pouco para fora.

export class Serpente extends Monstro {
    constructor(opcoes) {
        super("serpente", opcoes);
        // posição na espiral: ângulo da elipse e escala dela (1 = a costa)
        this.anguloDaVolta = 0;
        this.escalaDaVolta = this.dados.escalaInicial;
        // sentido do giro: 1 horário, −1 anti-horário
        this.sentido = Math.random() < 0.5 ? 1 : -1;
    }

    // Nasce na espiral, no ângulo `angulo` (radianos, da elipse da ilha).
    colocarNaVolta(angulo) {
        this.anguloDaVolta = angulo;
        this.escalaDaVolta = this.dados.escalaInicial;
        this.posicionar();
        super.colocar(this.x, this.y, angulo + (this.sentido * Math.PI) / 2);
    }

    posicionar() {
        this.x = FAROL.x + Math.cos(this.anguloDaVolta) * ILHA.rx * this.escalaDaVolta;
        this.y = FAROL.y + Math.sin(this.anguloDaVolta) * ILHA.ry * this.escalaDaVolta;
    }

    mover(dt) {
        // velocidade ao longo da elipse: o ângulo anda o que dá `velocidade` px/s
        const s = this.escalaDaVolta;
        const sen = Math.sin(this.anguloDaVolta);
        const cos = Math.cos(this.anguloDaVolta);
        const raioLocal = Math.max(8, s * Math.hypot(ILHA.rx * sen, ILHA.ry * cos));
        this.anguloDaVolta += (this.sentido * this.velocidade * dt) / raioLocal;
        this.escalaDaVolta -= this.dados.fechamento * dt * (this.chefe ? 0.8 : 1);
        this.posicionar();

        const ataque = this.pontoDeAtaque();
        const dx = this.x - FAROL.x;
        const dy = this.y - FAROL.y;
        if (Math.hypot(dx, dy) <= Math.hypot(ataque.x - FAROL.x, ataque.y - FAROL.y)) {
            this.x = ataque.x;
            this.y = ataque.y;
            this.comecarAtaque();
        }
    }

    // um disparo que não matou empurra a serpente para fora da espiral
    aoLevarDano() {
        const dx = (this.x - FAROL.x) / ILHA.rx;
        const dy = (this.y - FAROL.y) / ILHA.ry;
        this.anguloDaVolta = Math.atan2(dy, dx);
        this.escalaDaVolta = Math.hypot(dx, dy) + this.dados.recuo * (this.chefe ? 0.5 : 1);
        this.atacando = false;
        this.posicionar();
    }
}
