import { partida } from "../systems/partida.js";
import { efeito } from "../systems/som.js";
import { FACHO, FAROL, MELHORIA, NIVEL_MAXIMO } from "./config.js";
import { aberturaExtra, duracaoExtra, fatorDaEspera, temFachoDuplo } from "./melhorias.js";

// Facho do farol: gira até o mouse a no
// máximo FACHO.velocidadeMaxima graus por segundo, pelo caminho mais curto, e
// dá disparos de luz com espera entre eles. Só regra: o desenho fica em
// src/fase2/noite.js, que lê o ângulo, o estado e a carga daqui.
//
// API para quem vier depois (Kraken, tarefa 8):
//   facho.angulo          ângulo atual, em radianos (0 = direita, π/2 = baixo)
//   facho.alvo            ângulo do mouse, para onde ele está girando
//   facho.disparando      true durante um disparo
//   facho.pronto          true se pode disparar agora
//   facho.carga           0 a 1: quanto da espera já passou (1 = pronto)
//   facho.abertura        abertura total do cone, em radianos
//   facho.alcance         alcance do cone, em px
//   facho.dano            dano de um disparo no nível atual da lanterna
//   facho.disparoId       número do disparo atual (sobe a cada disparo): um
//                         alvo guarda o último que o atingiu para levar dano
//                         uma vez só por disparo
//   facho.contem(x, y, r) true se um círculo de raio r em (x, y) toca o cone
//                         (qualquer um dos dois, com o Facho duplo)
//   facho.forcaEm(x, y, r)  1 se o facho principal toca o círculo, a força
//                         do oposto (MELHORIA.duplo) se só ele toca, 0 se
//                         nenhum: o dano de um acerto é dano × força
//   facho.distanciaAngular(a)  quanto o facho mais perto está do ângulo a (rad)
//   facho.duplo           true com o Facho duplo (melhoria): um segundo cone
//                         no lado oposto, em facho.anguloOposto
//   facho.aoDisparar      função chamada a cada disparo (ou null)
//
// Engrenagens (partida.nivelLanterna) e melhorias (src/fase2/melhorias.js)
// se somam: abertura, duração e espera leem as duas.

const GRAUS = Math.PI / 180;
const VOLTA = Math.PI * 2;

// diferença a − b no intervalo (−π, π]: o caminho mais curto entre ângulos
export function diferencaDeAngulo(a, b) {
    let d = (a - b) % VOLTA;
    if (d > Math.PI) {
        d -= VOLTA;
    } else if (d <= -Math.PI) {
        d += VOLTA;
    }
    return d;
}

export class Facho {
    constructor() {
        this.angulo = FACHO.anguloInicial * GRAUS;
        this.alvo = this.angulo;
        // "pronto", "disparando" ou "esperando"
        this.estado = "pronto";
        // segundos no estado atual
        this.tempo = 0;
        this.disparoId = 0;
        // segundos desde o fim do último disparo (quadro aceso do farol)
        this.desdeODisparo = Infinity;
        // 1 logo depois de a lanterna melhorar, caindo até 0 (só desenho)
        this.realce = 0;
        this.aoDisparar = null;
    }

    get nivel() {
        return Math.min(NIVEL_MAXIMO, Math.max(0, partida.nivelLanterna));
    }

    // duração de um disparo e espera até o próximo, em segundos
    get duracao() {
        return FACHO.duracaoBase + FACHO.duracaoPorNivel * this.nivel + duracaoExtra();
    }

    get espera() {
        return (FACHO.esperaBase - FACHO.esperaPorNivel * this.nivel) * fatorDaEspera();
    }

    get dano() {
        return FACHO.danoBase + FACHO.danoPorNivel * this.nivel;
    }

    get abertura() {
        return (FACHO.abertura + aberturaExtra()) * GRAUS;
    }

    get duplo() {
        return temFachoDuplo();
    }

    // direção do facho oposto (Facho duplo)
    get anguloOposto() {
        return diferencaDeAngulo(this.angulo + Math.PI, 0);
    }

    get alcance() {
        return FACHO.alcance;
    }

    get disparando() {
        return this.estado === "disparando";
    }

    get pronto() {
        return this.estado === "pronto";
    }

    // 0 a 1: o quanto da espera passou (1 = pronto; 0 logo no disparo)
    get carga() {
        if (this.estado === "pronto") {
            return 1;
        }
        if (this.estado === "disparando") {
            return 0;
        }
        return Math.min(1, this.tempo / this.espera);
    }

    // true enquanto o farol mostra o quadro aceso
    get aceso() {
        return this.disparando || this.desdeODisparo < FACHO.acesoDepois;
    }

    // Aponta o alvo para um ponto do mundo.
    mirar(x, y) {
        const dx = x - FAROL.x;
        const dy = y - FAROL.y;
        if (dx * dx + dy * dy > 1) {
            this.alvo = Math.atan2(dy, dx);
        }
    }

    // Dispara se estiver pronto; devolve true se disparou.
    disparar() {
        if (this.estado !== "pronto") {
            return false;
        }
        this.estado = "disparando";
        this.tempo = 0;
        this.disparoId++;
        efeito("disparo");
        this.aoDisparar?.();
        return true;
    }

    // A lanterna melhorou: o facho brilha mais por um instante.
    realcar() {
        this.realce = 1;
    }

    // dt em segundos; querDisparar = botão ou Espaço seguro.
    atualizar(dt, querDisparar) {
        // giro: rápido longe do alvo, freando perto, sem passar do máximo
        const diferenca = diferencaDeAngulo(this.alvo, this.angulo);
        const maximo = FACHO.velocidadeMaxima * GRAUS;
        const velocidade = Math.max(-maximo, Math.min(maximo, diferenca * FACHO.suavidade));
        let passo = velocidade * dt;
        if (Math.abs(passo) > Math.abs(diferenca)) {
            passo = diferenca;
        }
        this.angulo = diferencaDeAngulo(this.angulo + passo, 0);

        this.tempo += dt;
        this.desdeODisparo += dt;
        this.realce = Math.max(0, this.realce - dt / 1.2);
        if (this.estado === "disparando" && this.tempo >= this.duracao) {
            this.estado = "esperando";
            this.tempo = 0;
            this.desdeODisparo = 0;
        } else if (this.estado === "esperando" && this.tempo >= this.espera) {
            this.estado = "pronto";
            this.tempo = 0;
        }
        if (querDisparar) {
            this.disparar();
        }
    }

    // Quanto o facho mais perto está do ângulo a, em radianos (0 a π).
    distanciaAngular(a) {
        const principal = Math.abs(diferencaDeAngulo(a, this.angulo));
        if (!this.duplo) {
            return principal;
        }
        return Math.min(principal, Math.abs(diferencaDeAngulo(a, this.anguloOposto)));
    }

    // true se o círculo (x, y, raio) toca o cone de algum facho.
    contem(x, y, raio = 0) {
        return this.forcaEm(x, y, raio) > 0;
    }

    // Força do acerto no círculo (x, y, raio): 1 no facho principal, a do
    // oposto (Facho duplo) se só ele toca, 0 fora dos dois.
    forcaEm(x, y, raio = 0) {
        const dx = x - FAROL.x;
        const dy = y - FAROL.y;
        const d = Math.hypot(dx, dy);
        if (d - raio > this.alcance) {
            return 0;
        }
        if (d <= raio) {
            return 1;
        }
        const limite = this.abertura / 2 + Math.asin(Math.min(1, raio / d));
        const direcao = Math.atan2(dy, dx);
        if (Math.abs(diferencaDeAngulo(direcao, this.angulo)) <= limite) {
            return 1;
        }
        if (this.duplo && Math.abs(diferencaDeAngulo(direcao, this.anguloOposto)) <= limite) {
            return MELHORIA.duplo;
        }
        return 0;
    }
}
