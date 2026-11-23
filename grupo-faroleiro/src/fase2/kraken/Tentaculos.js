import { CONFIG } from "../../config.js";
import { emitirFaiscas } from "../../systems/particulas.js";
import { efeito } from "../../systems/som.js";
import { CAMERA, FAROL, KRAKEN, TORRE } from "../config.js";
import { coresDoKraken } from "./cores.js";
import { brilhoRedondo, comecarPontos, ponto } from "./desenho.js";

// Ataque dos tentáculos (minigame): o Kraken solta 2 ou 3 tentáculos
// (por fúria) deitados em volta do farol, cada um uma linha reta (com
// KRAKEN.tentaculos.amplitude em 0 a senoide some e o corpo desenhado é a
// própria guia). Com o cursor no círculo de partida e o botão esquerdo
// apertado, o jogador arrasta o mouse em linha reta, de uma ponta à outra
// (a "guia": o segmento entre a partida e a ponta), e o tentáculo queima.
// Sair da faixa (KRAKEN.tentaculos.folga px da guia), recuar mais de
// `recuoMaximo` px ou soltar o botão zera o traço daquele tentáculo. No fim
// do tempo, cada tentáculo que sobrou bate na torre uma vez; todos queimados
// antes, o ataque termina na hora. Nenhum monstro nasce durante o ataque.
//
// A Fase2Stage repassa o botão em pixels do mundo: consomeBotao(x, y) diz
// se o aperto é do ataque (aí o facho não dispara), e depois apertarPonteiro,
// moverPonteiro e soltarPonteiro. O facho segue o cursor como sempre.
//
// Desenho: série de quadradinhos (desenho.js), como os anéis: a faixa
// translúcida da folga, o corpo com contorno, o trecho já traçado em brasa,
// as setinhas do sentido e o círculo de partida pulsando.
//
// Estados de cada tentáculo: "surgindo", "vivo", "tracando", "queimando",
// "queimado" (fim da queima), "batendo" (tempo esgotado) e "fim".

const GRAUS = Math.PI / 180;
const VOLTA = Math.PI * 2;
// amostras da curva (pontos da polilinha)
const AMOSTRAS = 32;
// passo dos quadradinhos do corpo e da faixa (px de curva)
const PASSO_CORPO = 3;
const PASSO_FAIXA = 7;
// opacidade de cada quadradinho da faixa: uns quatro se sobrepõem em cada
// ponto, o que soma cerca de 0,18 no meio da faixa
const ALFA_FAIXA = 0.05;
// passo máximo ao seguir o cursor entre duas leituras (px): um movimento
// rápido em linha reta não pula a faixa
const PASSO_TRACO = 4;
// intervalo entre dois chiados do traço (s) e entre duas faíscas (s)
const INTERVALO_DO_SOM = 0.25;
const INTERVALO_DA_FAISCA = 1 / 3;
// tentáculo que sobrou batendo na torre: duração do sumiço (s) e tremor
const BATER = 0.3;
const TREMOR = 4;
const TREMOR_MS = 260;
// inclinação máxima da linha de base em relação à horizontal (graus)
const INCLINACAO = 20;
// vezes que o conjunto inteiro é sorteado de novo quando um tentáculo não cabe
const RODADAS = 200;
// direções do meio do tentáculo em volta do farol (graus): fora da cunha de
// baixo, que a vista do Kraken corta
const DIRECOES = [-205, 25];

// Área em que o tentáculo cabe inteiro: a vista do Kraken com margem de
// 8 px, abaixo do corpo dele (20 px de folga sob o quadro).
const AREA = {
    x0: 8,
    x1: CONFIG.largura - 8,
    y0: KRAKEN.y + KRAKEN.quadroAltura + 28,
    y1: CAMERA.yKraken + CONFIG.altura - 8,
};

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

// Projeção de (x, y) na guia reta do tentáculo (da partida à ponta): `u` é a
// posição ao longo dela (px a partir da partida, de 0 a `t.reto`) e
// `distancia` a distância até ela.
export function projetar(t, x, y) {
    const ax = t.partida.x;
    const ay = t.partida.y;
    const k = Math.max(0, Math.min(t.reto, (x - ax) * t.guiaX + (y - ay) * t.guiaY));
    const qx = ax + t.guiaX * k - x;
    const qy = ay + t.guiaY * k - y;
    return { u: k, distancia: Math.hypot(qx, qy) };
}

// Quanto do traço (px na guia reta) já foi feito, convertido em px da curva
// desenhada: a brasa percorre a curva na mesma proporção (com amplitude 0 a
// curva é a própria guia e o fator é 1).
function progressoNaCurva(t) {
    return t.reto > 0 ? (t.progresso / t.reto) * t.comprimento : 0;
}

// Ponto e direção da curva na posição `u` (px a partir da partida).
function pontoEm(t, u) {
    const a = t.acumulados;
    const p = t.pontos;
    let i = 0;
    while (i < a.length - 2 && a[i + 1] < u) {
        i++;
    }
    const trecho = a[i + 1] - a[i];
    const k = trecho > 0 ? Math.max(0, Math.min(1, (u - a[i]) / trecho)) : 0;
    const dx = p[i + 1].x - p[i].x;
    const dy = p[i + 1].y - p[i].y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p[i].x + dx * k, y: p[i].y + dy * k, dx: dx / d, dy: dy / d };
}

// Sorteia uma curva: o meio num ângulo e raio em volta do farol, a linha de
// base quase deitada, a senoide por cima e o sentido da queima.
function sortearCurva() {
    const c = KRAKEN.tentaculos;
    const direcao = sortear(DIRECOES[0], DIRECOES[1]) * GRAUS;
    const raio = sortear(c.raioMinimo, c.raioMaximo);
    const cx = FAROL.x + Math.cos(direcao) * raio;
    const cy = FAROL.y + Math.sin(direcao) * raio;
    const inclinacao = sortear(-INCLINACAO, INCLINACAO) * GRAUS;
    const comprimento = sortear(c.comprimento[0], c.comprimento[1]);
    const ondas = Math.random() < 0.5 ? c.curvas[0] : c.curvas[1];
    const amplitude = sortear(c.amplitude[0], c.amplitude[1]) * (Math.random() < 0.5 ? 1 : -1);
    const ux = Math.cos(inclinacao);
    const uy = Math.sin(inclinacao);
    const pontos = [];
    for (let k = 0; k < AMOSTRAS; k++) {
        const s = k / (AMOSTRAS - 1);
        const base = (s - 0.5) * comprimento;
        const desvio = amplitude * Math.sin(VOLTA * ondas * s);
        pontos.push({ x: cx + ux * base - uy * desvio, y: cy + uy * base + ux * desvio });
    }
    if (Math.random() < 0.5) {
        pontos.reverse();
    }
    return { pontos, centro: { x: cx, y: cy } };
}

// Monta o tentáculo a partir dos pontos: comprimentos acumulados, partida,
// fim, as amostras do desenho e as setinhas.
function montarTentaculo({ pontos, centro }) {
    const c = KRAKEN.tentaculos;
    const acumulados = [0];
    for (let i = 1; i < pontos.length; i++) {
        acumulados.push(acumulados[i - 1] + Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y));
    }
    const partida = pontos[0];
    const fim = pontos[pontos.length - 1];
    const reto = Math.hypot(fim.x - partida.x, fim.y - partida.y) || 1;
    const t = {
        pontos,
        acumulados,
        // comprimento da curva desenhada e da guia reta (partida → ponta)
        comprimento: acumulados[acumulados.length - 1],
        reto,
        guiaX: (fim.x - partida.x) / reto,
        guiaY: (fim.y - partida.y) / reto,
        partida,
        fim,
        centro,
        progresso: 0,
        estado: "surgindo",
        t: 0,
        proximaFaisca: 0,
        amostras: [],
        setas: [],
    };
    for (let u = 0; u <= t.comprimento; u += PASSO_CORPO) {
        const p = pontoEm(t, u);
        t.amostras.push({ x: p.x, y: p.y, u });
    }
    for (let u = c.partidaRaio + c.seta / 2; u < t.comprimento - c.seta / 2; u += c.seta) {
        const p = pontoEm(t, u);
        t.setas.push({ x: p.x, y: p.y, dx: p.dx, dy: p.dy, u });
    }
    return t;
}

// true se a curva cabe: dentro da vista, longe do farol e dos outros.
function cabe(t, existentes) {
    const c = KRAKEN.tentaculos;
    const perto = TORRE.raio + 20;
    for (const p of t.pontos) {
        if (p.x < AREA.x0 || p.x > AREA.x1 || p.y < AREA.y0 || p.y > AREA.y1) {
            return false;
        }
        if (Math.hypot(p.x - FAROL.x, p.y - FAROL.y) < perto) {
            return false;
        }
        for (const outro of existentes) {
            if (projetar(outro, p.x, p.y).distancia < 2 * c.folga) {
                return false;
            }
        }
    }
    // e a curva dos outros também não pode encostar na faixa deste
    for (const outro of existentes) {
        for (const p of outro.pontos) {
            if (projetar(t, p.x, p.y).distancia < 2 * c.folga) {
                return false;
            }
        }
    }
    return true;
}

// Sorteia um tentáculo que caiba (até KRAKEN.tentaculos.tentativas vezes);
// null se nenhum coube.
function tentar(existentes) {
    for (let i = 0; i < KRAKEN.tentaculos.tentativas; i++) {
        const t = montarTentaculo(sortearCurva());
        if (cabe(t, existentes)) {
            return t;
        }
    }
    return null;
}

// Sorteia um tentáculo que caiba (até KRAKEN.tentaculos.tentativas vezes;
// depois aceita o último sorteado).
export function gerarTentaculo(existentes) {
    return (
        tentar(existentes) ??
        montarTentaculo(sortearCurva())
    );
}

// Sorteia `quantidade` tentáculos que caibam juntos na vista. Com tentáculos
// grandes o último às vezes não acha lugar: aí o conjunto todo é sorteado de
// novo (até RODADAS vezes). Se nenhum conjunto coube, cada tentáculo aceita o
// último sorteado, como antes.
export function gerarConjunto(quantidade) {
    for (let r = 0; r < RODADAS; r++) {
        const lista = [];
        for (let i = 0; i < quantidade; i++) {
            const t = tentar(lista);
            if (t === null) {
                break;
            }
            lista.push(t);
        }
        if (lista.length === quantidade) {
            return lista;
        }
    }
    const lista = [];
    for (let i = 0; i < quantidade; i++) {
        lista.push(gerarTentaculo(lista));
    }
    return lista;
}

export class Tentaculos {
    // kraken: o Kraken (fase, fúria)
    constructor(kraken) {
        this.kraken = kraken;
        this.fase = kraken.fase;
        const c = KRAKEN.tentaculos;
        const f = kraken.furia;
        this.duracao = c.tempo[f];
        this.lista = gerarConjunto(c.quantidade[f]);
        // tentáculo sendo traçado, a última posição do cursor e o relógio
        this.tracado = null;
        this.ultimo = { x: 0, y: 0 };
        this.ultimoSom = -Infinity;
        this.t = 0;
        this.esgotou = false;
        for (const t of this.lista) {
            this.fase.diretor?.respingo(t.centro.x, t.centro.y, 1.2);
        }
        efeito("respingo");
    }

    // segundos até o fim do ataque
    get restante() {
        return Math.max(0, this.duracao - this.t);
    }

    get terminou() {
        return this.lista.every((t) => t.estado === "fim" || t.estado === "queimado");
    }

    atualizar(dt) {
        const c = KRAKEN.tentaculos;
        this.t += dt;
        for (const t of this.lista) {
            t.t += dt;
            if (t.estado === "surgindo" && t.t >= c.surgir) {
                t.estado = "vivo";
                t.t = 0;
            } else if (t.estado === "queimando" && t.t >= c.queimar) {
                t.estado = "queimado";
            } else if (t.estado === "batendo" && t.t >= BATER) {
                t.estado = "fim";
            } else if (t.estado === "tracando") {
                // faíscas na ponta do traço
                t.proximaFaisca -= dt;
                if (t.proximaFaisca <= 0) {
                    t.proximaFaisca += INTERVALO_DA_FAISCA;
                    const p = pontoEm(t, progressoNaCurva(t));
                    emitirFaiscas(p.x, p.y, 1);
                }
            }
        }
        if (!this.esgotou && this.restante <= 0) {
            this.esgotar();
        }
    }

    // Tempo esgotado: cada tentáculo que sobrou bate na torre uma vez.
    esgotar() {
        const c = KRAKEN.tentaculos;
        this.esgotou = true;
        this.tracado = null;
        let bateram = 0;
        for (const t of this.lista) {
            if (t.estado === "surgindo" || t.estado === "vivo" || t.estado === "tracando") {
                t.estado = "batendo";
                t.t = 0;
                bateram++;
                this.fase.danificarTorre(c.dano);
                this.espalhar(t, 6);
            }
        }
        if (bateram > 0) {
            this.fase.tremer(TREMOR, TREMOR_MS);
        }
    }

    // ---- traço --------------------------------------------------------------

    // tentáculo vivo com o círculo de partida em (x, y), ou null
    partidaEm(x, y) {
        const raio = KRAKEN.tentaculos.partidaRaio;
        let achado = null;
        let melhor = Infinity;
        for (const t of this.lista) {
            if (t.estado !== "vivo") {
                continue;
            }
            const d = Math.hypot(x - t.partida.x, y - t.partida.y);
            if (d <= raio && d < melhor) {
                melhor = d;
                achado = t;
            }
        }
        return achado;
    }

    // true se o botão em (x, y), em pixels do mundo, é do ataque: já traçando
    // ou com o cursor num círculo de partida
    consomeBotao(x, y) {
        return this.tracado !== null || this.partidaEm(x, y) !== null;
    }

    apertarPonteiro(x, y) {
        if (this.tracado !== null || this.esgotou) {
            return;
        }
        const t = this.partidaEm(x, y);
        if (t === null) {
            return;
        }
        t.estado = "tracando";
        t.progresso = 0;
        t.proximaFaisca = 0;
        this.tracado = t;
        this.ultimo.x = x;
        this.ultimo.y = y;
    }

    // O cursor foi a (x, y): segue a curva em passos curtos desde a última
    // posição; sair da faixa ou recuar demais zera o traço.
    moverPonteiro(x, y) {
        const t = this.tracado;
        if (t === null) {
            return;
        }
        const c = KRAKEN.tentaculos;
        const antes = t.progresso;
        const dx = x - this.ultimo.x;
        const dy = y - this.ultimo.y;
        const passos = Math.max(1, Math.ceil(Math.hypot(dx, dy) / PASSO_TRACO));
        for (let i = 1; i <= passos; i++) {
            const p = projetar(t, this.ultimo.x + (dx * i) / passos, this.ultimo.y + (dy * i) / passos);
            if (p.distancia > c.folga || p.u < t.progresso - c.recuoMaximo) {
                this.falhar(t);
                return;
            }
            t.progresso = Math.max(t.progresso, p.u);
        }
        this.ultimo.x = x;
        this.ultimo.y = y;
        if (t.progresso >= t.reto - 4) {
            this.queimar(t);
            return;
        }
        if (t.progresso > antes && this.t - this.ultimoSom >= INTERVALO_DO_SOM) {
            this.ultimoSom = this.t;
            efeito("traco");
        }
    }

    // botão solto (em qualquer lugar) ou cursor fora da tela
    soltarPonteiro() {
        if (this.tracado !== null) {
            this.falhar(this.tracado);
        }
    }

    falhar(t) {
        t.estado = "vivo";
        t.progresso = 0;
        this.tracado = null;
        efeito("traco-falha");
    }

    queimar(t) {
        t.estado = "queimando";
        t.progresso = t.reto;
        t.t = 0;
        this.tracado = null;
        efeito("tentaculo-queima");
        this.espalhar(t, 2);
    }

    // faíscas ao longo do corpo
    espalhar(t, quantidade) {
        for (let i = 0; i < t.amostras.length; i += 8) {
            emitirFaiscas(t.amostras[i].x, t.amostras[i].y, quantidade);
        }
    }

    // O Kraken morreu: os tentáculos somem.
    encerrar() {
        this.esgotou = true;
        this.tracado = null;
        for (const t of this.lista) {
            t.estado = "fim";
        }
    }

    // ---- desenho ------------------------------------------------------------

    desenhar(renderer, _vista) {
        const c = KRAKEN.tentaculos;
        const cores = coresDoKraken();
        for (const t of this.lista) {
            if (t.estado === "fim" || t.estado === "queimado") {
                continue;
            }
            let alfa = 1;
            let escala = 1;
            if (t.estado === "surgindo") {
                // respingo: cresce do meio, saindo rápido e assentando
                const k = Math.min(1, t.t / c.surgir);
                escala = 1 - (1 - k) * (1 - k);
            } else if (t.estado === "queimando") {
                alfa = 1 - Math.min(1, t.t / c.queimar);
            } else if (t.estado === "batendo") {
                alfa = 1 - Math.min(1, t.t / BATER);
            }
            if (alfa <= 0 || escala <= 0.02) {
                continue;
            }
            const escalado = escala < 1;
            if (escalado) {
                renderer.save();
                renderer.translate(t.centro.x, t.centro.y);
                renderer.scale(escala, escala);
                renderer.translate(-t.centro.x, -t.centro.y);
            }
            this.desenharTentaculo(renderer, t, cores, alfa);
            if (escalado) {
                renderer.restore();
            }
        }
    }

    desenharTentaculo(renderer, t, cores, alfa) {
        const c = KRAKEN.tentaculos;
        const esp = c.espessura;
        const ativo = t.estado === "surgindo" || t.estado === "vivo" || t.estado === "tracando";
        const corpo = t.estado === "batendo" ? cores.alerta : cores.tentaculo;
        const amostras = t.amostras;
        // quanto da curva já foi traçado
        const feito = progressoNaCurva(t);

        // faixa da folga: em volta da guia reta, que é por onde se arrasta
        if (ativo) {
            comecarPontos(renderer, cores.faixa, ALFA_FAIXA * alfa);
            for (let u = 0; u <= t.reto; u += PASSO_FAIXA) {
+                ponto(renderer, t.partida.x + t.guiaX * u, t.partida.y + t.guiaY * u, 2 * c.folga);
            }
            renderer.restore();
        }

        // contorno escuro em todo o corpo
        comecarPontos(renderer, cores.anelEscuro, 0.9 * alfa);
        for (const a of amostras) {
            ponto(renderer, a.x, a.y, esp + 2);
        }
        renderer.restore();

        // corpo que falta traçar, com as contas claras
        comecarPontos(renderer, corpo, alfa);
        for (const a of amostras) {
            if (a.u > feito) {
                ponto(renderer, a.x, a.y, esp);
            }
        }
        renderer.restore();
        comecarPontos(renderer, cores.anelClaro, 0.7 * alfa);
        for (let i = 0; i < amostras.length; i += 4) {
            if (amostras[i].u > feito) {
                ponto(renderer, amostras[i].x, amostras[i].y - 1, 2);
            }
        }
        renderer.restore();

        // trecho traçado (ou queimando): brasa com pontos escuros
        if (t.progresso > 0) {
            comecarPontos(renderer, cores.brasa, 0.9 * alfa);
            for (const a of amostras) {
                if (a.u <= feito) {
                    ponto(renderer, a.x, a.y, esp - 2);
                }
            }
            renderer.restore();
            comecarPontos(renderer, cores.anelEscuro, 0.8 * alfa);
            for (let i = 1; i < amostras.length; i += 3) {
                const a = amostras[i];
                if (a.u <= feito && Math.sin(this.t * 17 + i * 1.7) > 0) {
                    ponto(renderer, a.x, a.y, 2);
                }
            }
            renderer.restore();
        }

        if (!ativo) {
            return;
        }

        // setinhas do sentido: um V de dois traços de 4 px
        comecarPontos(renderer, cores.partida, 0.85 * alfa);
        for (const s of t.setas) {
            if (s.u <= feito) {
                continue;
            }
            ponto(renderer, s.x, s.y, 2);
            for (let k = 2; k <= 4; k += 2) {
                const bx = s.x - s.dx * k * 0.7;
                const by = s.y - s.dy * k * 0.7;
                ponto(renderer, bx - s.dy * k * 0.7, by + s.dx * k * 0.7, 2);
                ponto(renderer, bx + s.dy * k * 0.7, by - s.dx * k * 0.7, 2);
            }
        }
        renderer.restore();

        // círculo de partida pulsando (aceso enquanto traça)
        const pulso = t.estado === "tracando" ? 1 : 0.75 + 0.25 * Math.sin(this.t * 7);
        const raio = c.partidaRaio * (0.9 + 0.1 * pulso);
        comecarPontos(renderer, cores.partida, pulso * alfa);
        for (let k = 0; k < 16; k++) {
            const ang = (k / 16) * VOLTA;
            ponto(renderer, t.partida.x + Math.cos(ang) * raio, t.partida.y + Math.sin(ang) * raio, 2);
        }
        ponto(renderer, t.partida.x, t.partida.y, 4);
        renderer.restore();
        brilhoRedondo(renderer, cores.partida, t.partida.x, t.partida.y, raio + 4, 0.12 * pulso * alfa);

        // brilho na ponta do traço
        if (t.estado === "tracando") {
            const p = pontoEm(t, feito);
            brilhoRedondo(renderer, cores.brasa, p.x, p.y, 9, 0.3);
        }
    }
}
