import { efeito } from "../../systems/som.js";
import { FAROL, TORRE } from "../config.js";
import { coresDaFase2 } from "../cores.js";
import { pontoDaCosta } from "../ilha.js";
import { comecarPontos, ponto } from "../kraken/desenho.js";
import { Monstro } from "./Monstro.js";

// Piranha: surge do mar com um respingo, nada até a costa, circula por ela
// por alguns segundos, para na areia avisando (o corpo pulsa e um anel de
// alerta pisca) e salta em arco até o farol. Vem em grupos (o diretor cria
// vários juntos). A comum se joga na torre; a mini-chefe para ao pé dela e
// morde, se debatendo.
//
// Etapas: "esperando" (atraso dentro do grupo), "surgindo" (respingo),
// "nadando", "circulando", "avisando" e "saltando".

const ALVO = { x: 0, y: 0 };
const VOLTA = Math.PI * 2;
// período do pulso do aviso (s)
const PERIODO_DO_PULSO = 0.3;
// parte do aviso gasta subindo do mar para a areia
const SUBIDA = 0.25;

export class Piranha extends Monstro {
    constructor(opcoes, atraso = 0) {
        super("piranha", opcoes);
        this.etapa = "esperando";
        this.tempoDaEtapa = -atraso;
        this.atingivel = false;
        this.alfa = 0;
        // ponto da areia onde vai saltar e o ponto onde cai
        this.praiaX = 0;
        this.praiaY = 0;
        this.quedaX = 0;
        this.quedaY = 0;
        // onde estava ao parar de circular
        this.circuloX = 0;
        this.circuloY = 0;
        // direção (rad) da costa onde está, o sentido de circular (±1) e
        // quanto tempo ainda circula
        this.direcao = 0;
        this.sentido = 1;
        this.duracaoDeCircular = 0;
        // de 0 a 1 durante o aviso, para o desenho
        this.pulso = 0;
        // o cardume do Kraken desliga o circular (só avisa e salta)
        this.circula = true;
        this.fase = Math.random() * Math.PI * 2;
    }

    colocar(x, y, angulo) {
        super.colocar(x, y, angulo);
        this.direcao = Math.atan2(y - FAROL.y, x - FAROL.x);
        this.apontarParaCosta();
    }

    // Recalcula o ponto da areia onde salta e o ponto onde cai, a partir da
    // direção atual.
    apontarParaCosta() {
        pontoDaCosta(this.direcao, -2, ALVO);
        this.praiaX = ALVO.x;
        this.praiaY = ALVO.y;
        const r = this.chefe ? TORRE.raioDeAtaque + 10 : TORRE.raio;
        this.quedaX = FAROL.x + Math.cos(this.direcao) * r;
        this.quedaY = FAROL.y + Math.sin(this.direcao) * r;
    }

    // ponto da faixa de água por onde circula, na direção `direcao`
    pontoDeCircular(direcao, saida) {
        return pontoDaCosta(direcao, -2 + this.dados.circular.raioExtra, saida);
    }

    mover(dt, diretor) {
        this.tempoDaEtapa += dt;
        const dados = this.dados;
        switch (this.etapa) {
            case "esperando":
                if (this.tempoDaEtapa >= 0) {
                    this.etapa = "surgindo";
                    this.tempoDaEtapa = 0;
                    diretor.respingo(this.x, this.y, this.escala);
                }
                break;
            case "surgindo":
                this.alfa = Math.min(1, this.tempoDaEtapa / dados.surgir);
                if (this.tempoDaEtapa >= dados.surgir) {
                    this.etapa = "nadando";
                    this.tempoDaEtapa = 0;
                    this.atingivel = true;
                }
                break;
            case "nadando":
                this.nadar(dt, diretor);
                break;
            case "circulando":
                this.circular(dt);
                break;
            case "avisando":
                this.avisar(diretor);
                break;
            case "saltando":
                this.saltar(diretor);
                break;
            default:
                break;
        }
    }

    nadar(dt, _diretor) {
        const alvo = this.pontoDeCircular(this.direcao, ALVO);
        const dx = alvo.x - this.x;
        const dy = alvo.y - this.y;
        const d = Math.hypot(dx, dy);
        const passo = this.velocidade * dt;
        if (d <= passo) {
            this.x = alvo.x;
            this.y = alvo.y;
            const c = this.dados.circular;
            this.etapa = "circulando";
            this.tempoDaEtapa = 0;
            this.sentido = Math.random() < 0.5 ? -1 : 1;
            this.duracaoDeCircular = this.circula
                ? c.duracao[0] + Math.random() * (c.duracao[1] - c.duracao[0])
                : 0;
            return;
        }
        // ondulação de lado, como um peixe nadando
        const nx = dx / d;
        const ny = dy / d;
        const onda = Math.cos(this.anim * this.dados.nadoFrequencia + this.fase) * this.dados.nadoAmplitude * dt * 6;
        this.x += nx * passo - ny * onda;
        this.y += ny * passo + nx * onda;
    }

    // Anda pela costa, em volta da ilha, no sentido sorteado.
    circular(dt) {
        const c = this.dados.circular;
        this.direcao = (this.direcao + this.sentido * c.velocidade * dt) % VOLTA;
        this.pontoDeCircular(this.direcao, ALVO);
        this.x = ALVO.x;
        this.y = ALVO.y;
        if (this.tempoDaEtapa >= this.duracaoDeCircular) {
            this.etapa = "avisando";
            this.tempoDaEtapa = 0;
            this.pulso = 0;
            this.apontarParaCosta();
            this.circuloX = this.x;
            this.circuloY = this.y;
            efeito("piranha-salto");
        }
    }

    // Parada na areia: sobe da água, o corpo pulsa e o anel de alerta pisca.
    avisar(diretor) {
        const aviso = this.dados.aviso;
        const t = this.tempoDaEtapa;
        const sobe = Math.min(1, t / (aviso.duracao * SUBIDA));
        this.x = this.circuloX + (this.praiaX - this.circuloX) * sobe;
        this.y = this.circuloY + (this.praiaY - this.circuloY) * sobe;
        this.pulso = 0.5 - 0.5 * Math.cos((t * VOLTA) / PERIODO_DO_PULSO);
        this.escalaExtra = this.pulso * 0.15;
        if (t >= aviso.duracao) {
            this.x = this.praiaX;
            this.y = this.praiaY;
            this.escalaExtra = 0;
            this.pulso = 0;
            this.etapa = "saltando";
            this.tempoDaEtapa = 0;
            this.sombra = true;
            this.voando = true;
            diretor.respingo(this.x, this.y, this.escala * 0.8);
        }
    }

    saltar(diretor) {
        const dados = this.dados;
        const duracao = dados.saltoDuracao * (this.chefe ? 1.4 : 1);
        const t = Math.min(1, this.tempoDaEtapa / duracao);
        const arco = 4 * t * (1 - t);
        this.x = this.praiaX + (this.quedaX - this.praiaX) * t;
        this.y = this.praiaY + (this.quedaY - this.praiaY) * t;
        this.altura = arco * dados.saltoAltura * this.escala;
        this.escalaExtra = arco * dados.saltoEscala;
        if (t >= 1) {
            this.altura = 0;
            this.escalaExtra = 0;
            this.voando = false;
            this.sombra = false;
            if (this.chefe) {
                this.comecarAtaque();
            } else {
                diretor.chegouNaTorre(this);
            }
        }
    }

    // a mini-chefe se debate ao pé da torre
    morder(dt, diretor) {
        this.angulo += Math.sin(this.anim * 14) * dt * 2;
        super.morder(dt, diretor);
    }

    virar(dt) {
        // mordendo, o balanço do morder manda no ângulo
        if (!this.atacando) {
            super.virar(dt);
        }
    }

    desenhar(renderer, img) {
        // ainda embaixo d'água: só o respingo (o diretor desenha)
        if (this.etapa === "esperando") {
            return;
        }
        if (this.etapa === "avisando" && !this.morrendo) {
            this.desenharAlerta(renderer);
        }
        super.desenhar(renderer, img);
    }

    // Anel de alerta no chão, na cor `alerta`, piscando com o pulso.
    desenharAlerta(renderer) {
        const aviso = this.dados.aviso;
        const raio = aviso.raio * this.escala + this.pulso * aviso.pulso;
        const n = Math.max(12, Math.round(raio * 1.4));
        comecarPontos(renderer, coresDaFase2().alerta, 0.35 + 0.65 * this.pulso);
        for (let i = 0; i < n; i++) {
            const a = (i / n) * VOLTA;
            ponto(renderer, this.x + Math.cos(a) * raio, this.y + Math.sin(a) * raio * 0.7, 3);
        }
        renderer.restore();
    }
}
