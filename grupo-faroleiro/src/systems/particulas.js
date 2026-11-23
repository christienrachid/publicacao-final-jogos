import { loader, Renderable } from "melonjs";
import { CONFIG } from "../config.js";
import { registrarBrilho, removerBrilho } from "./brilhos.js";
import { imagem } from "./estilo.js";

// Partículas da fase, desenhadas com recortes da folha fx-<estilo>.png
// (quadros de 8×8, índices nas constantes abaixo). Um sistema próprio em vez do
// ParticleEmitter do MelonJS: parte das partículas precisa sair por cima da
// escuridão (brasas, faíscas, vaga-lumes, chuva), o que só o registro
// de brilhos (brilhos.js) consegue, e um Renderable só com uma lista de
// partículas reaproveitadas desenha tudo sem um Container por efeito.
//
// Só desenho: nada aqui mexe na jogabilidade. A camada vive no mundo e some
// com o level.load do reinício; as entidades pedem efeitos pelas funções
// emitir* abaixo, que não fazem nada se não houver camada ativa.

const LADO = 8;
// teto de partículas vivas, somando as passageiras e as de ambiente
const LIMITE = 200;

// quadros da folha fx
const POEIRA = 0;
const POEIRA_MENOR = 1;
const BRASA = 2;
const VAGALUME = 3;
const FAISCA = 4;
const ESTRELINHA = 5;
const GOTA = 7;

// ids de tile de grama no tileset (tools/arte/tiles.mjs): vaga-lumes nascem neles
const GRAMA = new Set([21, 22, 23]);
const VAGALUMES = 8;
// quanto um vaga-lume se afasta do tile de origem, em px
const VAGALUME_ALCANCE = 10;

// chuva: poucas gotas na diagonal da folha (de cima à
// direita para baixo à esquerda)
const GOTAS = 22;
const GOTA_VX = -0.07;
const GOTA_VY = 0.17;
const GOTA_OPACIDADE = 0.3;

// camada ativa da fase atual (uma por vez)
let ativa = null;

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

// Camada de partículas da fase: um Renderable do tamanho do mapa.
export class Particulas extends Renderable {
    constructor(largura, altura) {
        super(0, 0, largura, altura);
        this.anchorPoint.set(0, 0);
        this.alwaysUpdate = true;
        this.imagem = loader.getImage(imagem("fx"));
        // partículas passageiras: as `vivas` primeiras do array estão em uso
        this.lista = [];
        this.vivas = 0;
        this.vagalumes = [];
        // chuva, em pixels de tela (segue a câmera)
        this.ambiente = [];
        this.quadroDoAmbiente = GOTA;
        this.tempo = 0;
        this.prepararAmbiente();
    }

    onActivateEvent() {
        ativa = this;
        registrarBrilho(this);
    }

    onDeactivateEvent() {
        if (ativa === this) {
            ativa = null;
        }
        removerBrilho(this);
    }

    // quantas passageiras ainda cabem sob o LIMITE
    get vagas() {
        return LIMITE - this.vagalumes.length - this.ambiente.length - this.vivas;
    }

    // Espalha vaga-lumes sobre tiles de grama da camada "chao" do mapa.
    prepararVagalumes(mapa) {
        const chao = mapa.getLayers().find((camada) => camada.name === "chao");
        if (!chao) {
            return;
        }
        const gramas = [];
        for (let y = 0; y < chao.rows; y++) {
            for (let x = 0; x < chao.cols; x++) {
                const tile = chao.cellAt(x, y);
                if (tile && GRAMA.has((tile.tileId & 0x1fffffff) - tile.tileset.firstgid)) {
                    gramas.push([x, y]);
                }
            }
        }
        // sorteio sem repetir tile (Fisher-Yates parcial)
        const total = Math.min(VAGALUMES, gramas.length);
        for (let i = 0; i < total; i++) {
            const j = i + Math.floor(Math.random() * (gramas.length - i));
            [gramas[i], gramas[j]] = [gramas[j], gramas[i]];
            const [tx, ty] = gramas[i];
            this.vagalumes.push({
                cx: tx * CONFIG.tile + CONFIG.tile / 2,
                cy: ty * CONFIG.tile + CONFIG.tile / 2,
                fases: [0, 1, 2, 3, 4].map(() => Math.random() * Math.PI * 2),
            });
        }
    }

    // Chuva de ambiente.
    prepararAmbiente() {
        const { largura, altura } = CONFIG;
        for (let i = 0; i < GOTAS; i++) {
            this.ambiente.push({
                x: sortear(0, largura + altura * 0.4),
                y: sortear(0, altura),
                vx: GOTA_VX,
                vy: GOTA_VY * sortear(0.85, 1.15),
                escala: 1,
                alfa: GOTA_OPACIDADE,
            });
        }
    }

    // Uma partícula passageira nova (ou null se o limite foi atingido).
    nova(x, y, quadros, duracao, acima) {
        if (this.vagas <= 0) {
            return null;
        }
        let p = this.lista[this.vivas];
        if (p === undefined) {
            p = {};
            this.lista.push(p);
        }
        this.vivas++;
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.ay = 0;
        p.vida = 0;
        p.duracao = duracao;
        p.quadros = quadros;
        p.alfa = 1;
        p.acima = acima;
        return p;
    }

    update(dt) {
        this.tempo += dt;

        // passageiras: anda, envelhece e tira as que acabaram (troca com a última)
        let i = 0;
        while (i < this.vivas) {
            const p = this.lista[i];
            p.vida += dt;
            if (p.vida >= p.duracao) {
                this.vivas--;
                this.lista[i] = this.lista[this.vivas];
                this.lista[this.vivas] = p;
                continue;
            }
            p.vy += p.ay * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            i++;
        }

        // ambiente: atravessa a tela e volta pelo outro lado
        const { largura, altura } = CONFIG;
        for (const a of this.ambiente) {
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            const margem = (LADO * a.escala) / 2;
            if (a.x > largura + margem) {
                a.x = -margem;
                a.y = sortear(0, altura);
            } else if (a.x < -margem) {
                a.x = largura + margem;
            }
            if (a.y > altura + margem) {
                a.y = -margem;
                a.x = sortear(0, largura + altura * 0.4);
            }
        }
        return true;
    }

    // Recorte do quadro da folha centrado em (x, y), em pixel inteiro.
    desenharQuadro(renderer, quadro, x, y, escala, alfa) {
        if (alfa <= 0) {
            return;
        }
        const lado = LADO * escala;
        renderer.setGlobalAlpha(alfa);
        renderer.drawImage(
            this.imagem,
            quadro * LADO,
            0,
            LADO,
            LADO,
            Math.round(x - lado / 2),
            Math.round(y - lado / 2),
            lado,
            lado,
        );
    }

    // Passageiras de uma camada: quadro pela idade, opacidade caindo no fim.
    desenharPassageiras(renderer, acima) {
        for (let i = 0; i < this.vivas; i++) {
            const p = this.lista[i];
            if (p.acima !== acima) {
                continue;
            }
            const t = p.vida / p.duracao;
            const quadro = p.quadros[Math.min(p.quadros.length - 1, Math.floor(t * p.quadros.length))];
            this.desenharQuadro(renderer, quadro, p.x, p.y, 1, p.alfa * (1 - t * t));
        }
    }

    // Embaixo da escuridão: poeira (só aparece onde há luz).
    draw(renderer) {
        renderer.save();
        this.desenharPassageiras(renderer, false);
        renderer.restore();
    }

    // Por cima da escuridão: brasas, faíscas, estrelinhas, vaga-lumes e o
    // ambiente do estilo. Chamado pela PlayStage em pixels do mundo.
    desenharBrilho(renderer) {
        this.desenharPassageiras(renderer, true);

        const t = this.tempo;
        for (const v of this.vagalumes) {
            const [a, b, c, d, pisca] = v.fases;
            const x = v.cx + Math.sin(t * 0.0007 + a) * VAGALUME_ALCANCE * 0.7 + Math.sin(t * 0.0017 + b) * 3;
            const y = v.cy + Math.cos(t * 0.0005 + c) * VAGALUME_ALCANCE * 0.5 + Math.sin(t * 0.0013 + d) * 3;
            // aceso a maior parte do tempo, apagando de leve de vez em quando
            const brilho = Math.min(1, Math.max(0, 0.45 + 0.75 * Math.sin(t * 0.0025 + pisca)));
            this.desenharQuadro(renderer, VAGALUME, x, y, 1, brilho);
        }

        if (this.ambiente.length > 0) {
            // em pixels de tela: soma a posição da câmera (com o tremor)
            const camera = this.parentApp.viewport;
            const cx = camera.pos.x + camera.offset.x;
            const cy = camera.pos.y + camera.offset.y;
            for (const a of this.ambiente) {
                this.desenharQuadro(renderer, this.quadroDoAmbiente, cx + a.x, cy + a.y, a.escala, a.alfa);
            }
        }
    }
}

// Nuvenzinha de poeira nos pés (x, y) do jogador.
export function emitirPoeira(x, y) {
    if (ativa === null) {
        return;
    }
    for (let i = 0; i < 2; i++) {
        const p = ativa.nova(x + sortear(-3, 3), y - 1, [POEIRA, POEIRA_MENOR], sortear(350, 450), false);
        if (p !== null) {
            p.vx = sortear(-0.012, 0.012);
            p.vy = sortear(-0.012, -0.004);
            p.alfa = 0.8;
        }
    }
}

// Uma brasa subindo da chama em (x, y) e apagando em ~0,8 s.
export function emitirBrasa(x, y) {
    if (ativa === null) {
        return;
    }
    const p = ativa.nova(x, y, [BRASA], sortear(700, 900), true);
    if (p !== null) {
        p.vx = sortear(-0.006, 0.006);
        p.vy = sortear(-0.024, -0.016);
    }
}

// Explosão de faíscas em (x, y), para todos os lados, caindo de leve.
export function emitirFaiscas(x, y, quantidade = 10) {
    if (ativa === null) {
        return;
    }
    for (let i = 0; i < quantidade; i++) {
        const p = ativa.nova(x, y, [FAISCA], sortear(350, 550), true);
        if (p !== null) {
            const angulo = (i / quantidade) * Math.PI * 2 + sortear(-0.3, 0.3);
            const velocidade = sortear(0.03, 0.07);
            p.vx = Math.cos(angulo) * velocidade;
            p.vy = Math.sin(angulo) * velocidade - 0.02;
            p.ay = 0.00012;
        }
    }
}

// Estrelinhas subindo de (x, y) (lata de óleo pega).
export function emitirEstrelinhas(x, y, quantidade = 6) {
    if (ativa === null) {
        return;
    }
    for (let i = 0; i < quantidade; i++) {
        const p = ativa.nova(x + sortear(-4, 4), y + sortear(-3, 3), [ESTRELINHA], sortear(500, 700), true);
        if (p !== null) {
            p.vx = sortear(-0.02, 0.02);
            p.vy = sortear(-0.04, -0.015);
        }
    }
}

// Fumaça subindo de (x, y) num raio de `raio` px (monstro sumindo). `acima`:
// por cima da escuridão (a limpeza das 22h, que acontece no escuro).
export function emitirFumaca(x, y, quantidade = 8, raio = 6, acima = false) {
    if (ativa === null) {
        return;
    }
    for (let i = 0; i < quantidade; i++) {
        const p = ativa.nova(x + sortear(-raio, raio), y + sortear(-raio, raio) * 0.6, [POEIRA, POEIRA_MENOR], sortear(600, 900), acima);
        if (p !== null) {
            p.vx = sortear(-0.012, 0.012);
            p.vy = sortear(-0.03, -0.012);
            p.alfa = 0.85;
        }
    }
}
