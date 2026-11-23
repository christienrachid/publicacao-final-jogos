import { partida } from "../systems/partida.js";
import { efeito } from "../systems/som.js";
import { FASE1 } from "./config.js";
import { LuzCone } from "./escuridao.js";

// Lanterna do faroleiro: enquanto o botão
// esquerdo fica apertado sai um cone de luz da boca da lanterna, que para
// no terreno, gasta a bateria e dá dano por segundo nos alvos dentro dele.
// Vazia, não liga. Recarrega segurando E na porta da casa (o jogador cuida
// da recarga e chama recarregar()).
//
// API para os monstros e chefes (tarefas 7 e 9):
//   registrarAlvoDaLuz(alvo) → função que cancela o registro
//   removerAlvoDaLuz(alvo)
//   alvo.pontoParaLuz()      { x, y } (px do mundo) ou null se não pode levar luz agora
//   alvo.levarLuz(dano, lanterna)   dano = danoPorSegundo × dt × (alvo.multiplicadorDaLuz ?? 1)
//   alvo.chefe = true        usa o alcance de chefe (alcanceChefe)
//   alvo.alcanceDaLuz        (opcional) alcance próprio, em px
// E na lanterna (lanternaAtual()):
//   lanterna.modoChefe = true      cone desenhado e alcance de chefe para todos
//   lanterna.multiplicadorGasto    1 normal; a névoa do Holandês põe 2
//   lanterna.encher()              bateria cheia (mini-chefe derrotado)
//   lanterna.ligada, lanterna.bateria (s), lanterna.fracao (0 a 1)
//   lanterna.bateriaMaxima (s), lanterna.danoPorSegundo: os da config mais
//   as cartas do baú (partida.bateriaExtra, partida.danoExtra)

const alvos = new Set();
let atual = null;

export function registrarAlvoDaLuz(alvo) {
    alvos.add(alvo);
    return () => alvos.delete(alvo);
}

export function removerAlvoDaLuz(alvo) {
    alvos.delete(alvo);
}

export function limparAlvosDaLuz() {
    alvos.clear();
}

// A lanterna da fase em andamento (ou null fora da Fase 1).
export function lanternaAtual() {
    return atual;
}

const RAD = Math.PI / 180;

export class Lanterna {
    constructor(mapa) {
        const c = FASE1.lanterna;
        this.mapa = mapa;
        this.bateria = this.bateriaMaxima;
        this.ligada = false;
        this.modoChefe = false;
        this.multiplicadorGasto = 1;
        this.abertura = c.abertura * RAD;
        // boca da lanterna e direção, postas pelo jogador a cada quadro
        this.x = 0;
        this.y = 0;
        this.angulo = 0;
        this.cone = new LuzCone(mapa, { cor: c.cor, intensidade: c.intensidade });
        this.tempo = 0;
        atual = this;
    }

    // bateria máxima (s), com a Bateria maior do baú
    get bateriaMaxima() {
        return FASE1.lanterna.bateria + partida.bateriaExtra;
    }

    // dano por segundo nos alvos do cone, com a Luz forte do baú
    get danoPorSegundo() {
        return FASE1.lanterna.danoPorSegundo * (1 + partida.danoExtra);
    }

    get fracao() {
        return this.bateria / this.bateriaMaxima;
    }

    get vazia() {
        return this.bateria <= 0;
    }

    // alcance do cone desenhado e o padrão para os alvos
    get alcance() {
        return this.modoChefe ? FASE1.lanterna.alcanceChefe : FASE1.lanterna.alcance;
    }

    encher() {
        this.bateria = this.bateriaMaxima;
    }

    // Boca da lanterna e direção (radianos) neste quadro.
    apontar(x, y, angulo) {
        this.x = x;
        this.y = y;
        this.angulo = angulo;
    }

    // querLigar: o botão está apertado e o jogador pode usar a lanterna.
    // novoClique: o botão acabou de ser apertado (para o som de vazia).
    atualizar(dt, querLigar, novoClique) {
        this.tempo += dt;
        if (querLigar && this.vazia) {
            if (novoClique) {
                efeito("bateriaVazia");
            }
            querLigar = false;
        }
        if (querLigar !== this.ligada) {
            this.ligada = querLigar;
            efeito(querLigar ? "lanternaLiga" : "lanternaDesliga");
        }
        if (this.ligada) {
            this.bateria = Math.max(0, this.bateria - dt * this.multiplicadorGasto);
            if (this.bateria <= 0) {
                this.ligada = false;
                efeito("bateriaVazia");
            }
        }

        // cone desenhado (com um tremido de leve)
        const tremor = Math.sin(this.tempo * 31) * FASE1.lanterna.tremor * 0.5 + Math.sin(this.tempo * 13) * FASE1.lanterna.tremor * 0.5;
        this.cone.forca = this.ligada ? 1 : 0;
        this.cone.apontar(this.x, this.y, this.angulo, this.abertura * (1 + tremor), this.alcance);

        if (this.ligada) {
            this.iluminarAlvos(dt);
        }
    }

    // true se o ponto (x, y) está dentro do cone, até `alcance`, sem
    // terreno no caminho
    dentroDoCone(x, y, alcance = this.alcance) {
        const dx = x - this.x;
        const dy = y - this.y;
        const distancia = Math.hypot(dx, dy);
        if (distancia > alcance) {
            return false;
        }
        if (distancia > 1) {
            let diferenca = Math.atan2(dy, dx) - this.angulo;
            diferenca = Math.atan2(Math.sin(diferenca), Math.cos(diferenca));
            if (Math.abs(diferenca) > this.abertura / 2) {
                return false;
            }
        }
        return this.mapa.fracaoAteSolido(this.x, this.y, x, y) === Infinity;
    }

    iluminarAlvos(dt) {
        const c = FASE1.lanterna;
        for (const alvo of [...alvos]) {
            const ponto = alvo.pontoParaLuz?.();
            if (!ponto) {
                continue;
            }
            const alcance = alvo.alcanceDaLuz ?? (alvo.chefe || this.modoChefe ? c.alcanceChefe : c.alcance);
            if (this.dentroDoCone(ponto.x, ponto.y, alcance)) {
                alvo.levarLuz?.(this.danoPorSegundo * dt * (alvo.multiplicadorDaLuz ?? 1), this);
            }
        }
    }

    destroy() {
        if (atual === this) {
            atual = null;
        }
        this.cone.destroy();
    }
}