import { KRAKEN } from "../config.js";

// Ataque do cardume: ondas de piranhas em leque vindas de um lado (pelo
// diretor da Fase 2, surgirPiranhas). Acaba quando todas morrem ou chegam,
// ou depois de KRAKEN.cardume.duracaoMaxima segundos.

const GRAUS = Math.PI / 180;

export class Cardume {
    // kraken: o Kraken (fase, fúria)
    constructor(kraken) {
        this.fase = kraken.fase;
        const c = KRAKEN.cardume;
        const f = kraken.furia;
        this.ondas = c.ondas[f];
        this.porOnda = c.porOnda[f];
        this.intervalo = c.intervalo[f];
        this.base = c.direcoes[Math.floor(Math.random() * c.direcoes.length)] * GRAUS;
        // o leque vai de um lado ao outro, num sentido sorteado
        this.sentido = Math.random() < 0.5 ? 1 : -1;
        this.feitas = 0;
        this.espera = 0;
        this.peixes = [];
        this.tempo = 0;
    }

    get terminou() {
        if (this.feitas < this.ondas) {
            return false;
        }
        return this.tempo >= KRAKEN.cardume.duracaoMaxima || this.peixes.every((p) => !p.vivo || p.removido);
    }

    atualizar(dt) {
        this.tempo += dt;
        this.espera -= dt;
        const diretor = this.fase.diretor;
        if (this.feitas < this.ondas && this.espera <= 0 && diretor !== null) {
            const meio = (this.ondas - 1) / 2;
            const angulo = this.base + this.sentido * (this.feitas - meio) * KRAKEN.cardume.leque * GRAUS;
            const peixes = diretor.surgirPiranhas(this.porOnda, angulo);
            // no cardume as piranhas não circulam: só avisam e saltam
            for (const p of peixes) p.circula = false;
            this.peixes.push(...peixes);
            this.feitas++;
            this.espera = this.intervalo;
        }
    }

    // O Kraken morreu: não nascem mais (o diretor mata os vivos).
    encerrar() {
        this.feitas = this.ondas;
    }

    desenhar() {}
}
