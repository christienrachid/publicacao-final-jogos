import { emitirEstrelinhas, emitirFaiscas } from "../../systems/particulas.js";
import { efeito } from "../../systems/som.js";
import { FAROL, KRAKEN } from "../config.js";
import { diferencaDeAngulo } from "../facho.js";
import { coresDoKraken } from "./cores.js";
import { comecarPontos, ponto } from "./desenho.js";

// Ataque dos anéis (ideia do Pedro): três a cinco anéis grossos (por fúria) em volta do farol,
// cada um com uma abertura, girando devagar e se fechando em tempos
// diferentes. Quando um anel chega à torre, o facho precisa estar apontado
// para a abertura dele: aí o anel se desfaz em brilho; senão a torre leva
// dano e o anel quebra com tremor.
//
// Leitura: a abertura tem as pontas e um pontilhado na cor de destaque; no
// fim (KRAKEN.aneis.aviso) o anel pisca e duas linhas saem do farol até as
// pontas da abertura, cheias na cor da abertura se o facho está dentro dela
// e tracejadas na cor de alerta se não está. Com o Facho duplo, vale
// qualquer um dos dois fachos na abertura (facho.distanciaAngular).

const GRAUS = Math.PI / 180;
const VOLTA = Math.PI * 2;

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

// Direções de chegada da abertura de cada anel (radianos), visíveis e
// diferentes entre um anel e o seguinte.
function sortearChegadas(quantidade) {
    const c = KRAKEN.aneis;
    const lista = [];
    for (let i = 0; i < quantidade; i++) {
        let a = sortear(c.chegada[0], c.chegada[1]) * GRAUS;
        for (let tentativa = 0; tentativa < 20 && i > 0; tentativa++) {
            if (Math.abs(diferencaDeAngulo(a, lista[i - 1])) >= c.diferenca * GRAUS) {
                break;
            }
            a = sortear(c.chegada[0], c.chegada[1]) * GRAUS;
        }
        lista.push(a);
    }
    return lista;
}

export class Aneis {
    // kraken: o Kraken (fase, fúria)
    constructor(kraken) {
        this.kraken = kraken;
        this.fase = kraken.fase;
        const c = KRAKEN.aneis;
        const f = kraken.furia;
        const velocidade = c.velocidade[f];
        const n = c.quantidade[f];
        const chegadas = sortearChegadas(n);
        this.lista = c.raios.slice(0, n).map((raio, i) => {
            // sentidos alternados; a abertura começa onde precisa para
            // terminar na direção sorteada
            const giro = c.giro[f] * GRAUS * (i % 2 === 0 ? 1 : -1);
            const viagem = c.surgir + (raio - c.raioDeChegada) / velocidade;
            return {
                raio,
                velocidade,
                giro,
                angulo: chegadas[i] - giro * viagem,
                estado: "surgindo",
                t: 0,
                alinhado: false,
            };
        });
        this.tempo = 0;
    }

    get terminou() {
        return this.lista.every((a) => a.estado === "fim");
    }

    // segundos até o anel chegar à torre
    restante(a) {
        const c = KRAKEN.aneis;
        const fechando = (a.raio - c.raioDeChegada) / a.velocidade;
        return a.estado === "surgindo" ? fechando + c.surgir - a.t : fechando;
    }

    // true se algum facho está dentro da abertura do anel
    alinhado(a) {
        const c = KRAKEN.aneis;
        return this.fase.facho.distanciaAngular(a.angulo) <= (c.abertura / 2 + c.folga) * GRAUS;
    }

    atualizar(dt) {
        const c = KRAKEN.aneis;
        this.tempo += dt;
        for (const a of this.lista) {
            a.t += dt;
            if (a.estado === "surgindo" || a.estado === "fechando") {
                a.angulo = (a.angulo + a.giro * dt) % VOLTA;
                a.alinhado = this.alinhado(a);
            }
            if (a.estado === "surgindo") {
                if (a.t >= c.surgir) {
                    a.estado = "fechando";
                    a.t = 0;
                }
            } else if (a.estado === "fechando") {
                a.raio -= a.velocidade * dt;
                if (a.raio <= c.raioDeChegada) {
                    a.raio = c.raioDeChegada;
                    this.chegar(a);
                }
            } else if ((a.estado === "desfeito" || a.estado === "quebrado") && a.t >= c.fim) {
                a.estado = "fim";
            }
        }
    }

    // O anel chegou à torre: desfaz se o facho está na abertura, senão quebra.
    chegar(a) {
        const c = KRAKEN.aneis;
        a.t = 0;
        if (this.alinhado(a)) {
            a.estado = "desfeito";
            efeito("coleta");
            this.espalhar(a, emitirEstrelinhas, 2);
        } else {
            a.estado = "quebrado";
            this.fase.danificarTorre(c.dano);
            this.fase.tremer(c.tremor, c.tremorMs);
            this.espalhar(a, emitirFaiscas, 3);
        }
    }

    // partículas em volta do anel
    espalhar(a, emitir, quantidade) {
        for (let i = 0; i < 10; i++) {
            const ang = a.angulo + (i / 10) * VOLTA + Math.PI / 10;
            emitir(FAROL.x + Math.cos(ang) * a.raio, FAROL.y + Math.sin(ang) * a.raio, quantidade);
        }
    }

    // O Kraken morreu: os anéis que faltam se desfazem sem dano.
    encerrar() {
        for (const a of this.lista) {
            if (a.estado === "surgindo" || a.estado === "fechando") {
                a.estado = "desfeito";
                a.t = 0;
            }
        }
    }

    // ---- desenho ------------------------------------------------------------

    desenhar(renderer, vista) {
        const c = KRAKEN.aneis;
        const cores = coresDoKraken();
        for (const a of this.lista) {
            if (a.estado === "fim") {
                continue;
            }
            const meia = (c.abertura / 2) * GRAUS;
            if (a.estado === "surgindo") {
                const alfa = Math.min(1, a.t / c.surgir);
                this.desenharAnel(renderer, vista, a.raio + (1 - alfa) * 20, a.angulo, meia, cores, alfa, false);
            } else if (a.estado === "fechando") {
                const avisando = this.restante(a) <= c.aviso;
                // pisca rápido no aviso
                const alfa = avisando && Math.floor(this.tempo * 10) % 2 === 0 ? 0.6 : 1;
                if (avisando) {
                    this.desenharGuia(renderer, a, meia, cores);
                }
                this.desenharAnel(renderer, vista, a.raio, a.angulo, meia, cores, alfa, avisando);
            } else {
                const k = Math.min(1, a.t / c.fim);
                if (a.estado === "desfeito") {
                    // abre em brilho, para fora
                    this.desenharContas(renderer, vista, a.raio + k * 40, a.angulo, meia, cores.abertura, 1 - k);
                } else {
                    // quebra no lugar, tremendo, na cor de alerta
                    const tremor = (Math.random() - 0.5) * 3 * (1 - k);
                    this.desenharContas(renderer, vista, a.raio + tremor, a.angulo, meia, cores.alerta, 1 - k);
                }
            }
        }
    }

    // Chama fn(x, y, k) em cada amostra do arco cheio (de uma ponta da
    // abertura até a outra), sem criar arrays por quadro.
    percorrer(raio, angulo, meia, fn) {
        const passo = KRAKEN.aneis.passo;
        const arco = VOLTA - 2 * meia;
        const n = Math.max(8, Math.ceil((arco * raio) / passo));
        for (let k = 0; k <= n; k++) {
            const ang = angulo + meia + (arco * k) / n;
            fn(FAROL.x + Math.cos(ang) * raio, FAROL.y + Math.sin(ang) * raio, k);
        }
    }

    // Anel: contorno escuro, corpo, contas claras, as pontas e o pontilhado
    // da abertura na cor de destaque.
    desenharAnel(renderer, vista, raio, angulo, meia, cores, alfa, avisando) {
        const esp = KRAKEN.aneis.espessura;
        const x0 = vista.x - esp;
        const x1 = vista.x + vista.largura + esp;
        const y0 = vista.y - esp;
        const y1 = vista.y + vista.altura + esp;
        const dentro = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

        comecarPontos(renderer, cores.anelEscuro, alfa * 0.9);
        this.percorrer(raio, angulo, meia, (x, y) => {
            if (dentro(x, y)) {
                ponto(renderer, x, y, esp + 2);
            }
        });
        renderer.restore();
        comecarPontos(renderer, cores.anel, alfa);
        this.percorrer(raio, angulo, meia, (x, y) => {
            if (dentro(x, y)) {
                ponto(renderer, x, y, esp);
            }
        });
        renderer.restore();
        comecarPontos(renderer, cores.anelClaro, alfa * 0.8);
        this.percorrer(raio, angulo, meia, (x, y, k) => {
            if (k % 4 === 0 && dentro(x, y)) {
                ponto(renderer, x, y - 1, 2);
            }
        });
        renderer.restore();

        // abertura: pontilhado de uma ponta à outra e as duas pontas grandes
        const aberto = 2 * meia;
        const n = Math.max(4, Math.ceil((aberto * raio) / 7));
        comecarPontos(renderer, cores.abertura, alfa * 0.55);
        for (let k = 1; k < n; k++) {
            const ang = angulo - meia + (aberto * k) / n;
            ponto(renderer, FAROL.x + Math.cos(ang) * raio, FAROL.y + Math.sin(ang) * raio, 2);
        }
        renderer.restore();
        const ponta = esp + (avisando ? 6 : 4);
        comecarPontos(renderer, cores.abertura, alfa);
        for (const lado of [-1, 1]) {
            const ang = angulo + lado * meia;
            ponto(renderer, FAROL.x + Math.cos(ang) * raio, FAROL.y + Math.sin(ang) * raio, ponta);
        }
        renderer.restore();
    }

    // Anel se desfazendo ou quebrando: só as contas, numa cor.
    desenharContas(renderer, vista, raio, angulo, meia, css, alfa) {
        if (alfa <= 0) {
            return;
        }
        comecarPontos(renderer, css, alfa);
        this.percorrer(raio, angulo, meia, (x, y, k) => {
            if (k % 2 === 0 && x >= vista.x - 8 && x <= vista.x + vista.largura + 8 && y >= vista.y - 8 && y <= vista.y + vista.altura + 8) {
                ponto(renderer, x, y, 4);
            }
        });
        renderer.restore();
    }

    // Aviso de chegada: linhas do farol até as pontas da abertura, cheias
    // (facho dentro) ou tracejadas na cor de alerta (facho fora).
    desenharGuia(renderer, a, meia, cores) {
        const pulso = 0.55 + 0.35 * Math.sin(this.tempo * 14);
        const css = a.alinhado ? cores.abertura : cores.alerta;
        comecarPontos(renderer, css, pulso);
        for (const lado of [-1, 1]) {
            const ang = a.angulo + lado * meia;
            const cos = Math.cos(ang);
            const sen = Math.sin(ang);
            for (let d = 36, k = 0; d < a.raio; d += 3, k++) {
                if (!a.alinhado && k % 3 === 2) {
                    continue;
                }
                ponto(renderer, FAROL.x + cos * d, FAROL.y + sen * d, 3);
            }
        }
        renderer.restore();
    }
}
