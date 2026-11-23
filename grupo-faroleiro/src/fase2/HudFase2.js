import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo } from "../systems/estilo.js";
import { partida } from "../systems/partida.js";
import { BarraDeVida } from "../ui/barra.js";
import { Hud, ICONE, desenharIcone } from "../ui/Hud.js";
import { Rotulo } from "../ui/texto.js";
import { AVISO, NIVEL_MAXIMO, TORRE } from "./config.js";
import { coresDaFase2 } from "./cores.js";
import { MELHORIAS, nivelDe } from "./melhorias.js";
import { desenharIconeDaMelhoria } from "./PainelMelhorias.js";

// HUD da Fase 2, em pixels da tela: a vida do farol, a energia do farol e
// as melhorias pegas com o nível (alto à esquerda), as engrenagens da
// lanterna e a recarga do facho (alto à direita), o flash vermelho do dano
// e os avisos no meio da tela ("Lanterna melhorou!"). O relógio e as teclas
// de teste vêm de src/ui/Hud.js.

const MARGEM = 8;
const ICONE_ENGRENAGEM = 4;
const VAO_ICONES = 2;
const BARRA_TORRE = 120;
const BARRA_FACHO = 4 * ICONE + 3 * VAO_ICONES;
const BARRA_ENERGIA_ALTURA = 4;
// largura de um ícone de melhoria com o número do nível
const PASSO_DA_MELHORIA = ICONE + 9;
const AVISO_Y = 74;
// com o Kraken em cena o aviso desce para não cobrir os olhos dele
const AVISO_Y_KRAKEN = 214;

export class HudFase2 extends Hud {
    // fase: a Fase2Stage (lê o facho)
    constructor(fase) {
        super();
        this.fase = fase;
        this.vida = new BarraDeVida({ largura: BARRA_TORRE, rotulo: "Farol" });
        this.textoEnergia = new Rotulo("Energia");
        this.niveis = new Map(MELHORIAS.map((m) => [m.id, new Rotulo("")]));
        // melhoria que acabou de ser pega (pulsa um instante)
        this.ultimaMelhoria = null;
        this.brilhoDaMelhoria = 0;
        this.lanterna = new Rotulo("Lanterna");
        this.textoFacho = new Rotulo("Facho");
        this.aviso = new Rotulo("", 2);
        this.tempoDoAviso = Infinity;
        this.duracaoDoAviso = AVISO.duracao;
        this.flash = 0;
        this.tempo = 0;
        // engrenagem que acabou de acender (pulsa um instante)
        this.brilhoDaEngrenagem = 0;
    }

    // Mostra um aviso grande no meio da tela por AVISO.duracao segundos (ou
    // por `duracao` segundos, nos lembretes). Um aviso novo substitui o atual
    // e volta à duração padrão.
    avisar(texto, duracao = AVISO.duracao) {
        this.aviso.texto = texto;
        this.duracaoDoAviso = duracao;
        this.tempoDoAviso = 0;
    }

    // Flash vermelho do dano na torre.
    piscarDano() {
        this.flash = 1;
    }

    acenderEngrenagem() {
        this.brilhoDaEngrenagem = 1;
    }

    acenderMelhoria(id) {
        this.ultimaMelhoria = id;
        this.brilhoDaMelhoria = 1;
    }

    atualizar(dt) {
        const s = dt / 1000;
        this.tempo += s;
        this.tempoDoAviso += s;
        this.flash = Math.max(0, this.flash - s / TORRE.flashDuracao);
        this.brilhoDaEngrenagem = Math.max(0, this.brilhoDaEngrenagem - s / 1.2);
        this.brilhoDaMelhoria = Math.max(0, this.brilhoDaMelhoria - s / 1.2);
        const maximo = Math.max(1, partida.vidaTorreMax);
        this.vida.definir(partida.vidaTorre / maximo);
        this.vida.atualizar(dt);
    }

    desenharFase(renderer) {
        const cores = coresDaFase2();
        if (this.flash > 0) {
            pintar(renderer, cores.dano, 0, 0, CONFIG.largura, CONFIG.altura, TORRE.flashOpacidade * this.flash);
        }
        this.desenharTorre(renderer, cores);
        const y = this.desenharEnergia(renderer, cores);
        this.desenharMelhorias(renderer, cores, y);
        this.desenharLanterna(renderer, cores);
        this.desenharAviso(renderer);
    }

    desenharTorre(renderer, cores) {
        this.vida.rotulo.texto = `Farol ${Math.max(0, Math.ceil(partida.vidaTorre))}/${partida.vidaTorreMax}`;
        this.vida.desenhar(renderer, MARGEM, MARGEM - 2, { cor: cores.vidaTorre });
    }

    // Energia do farol: rótulo e barra fina embaixo da vida; devolve o y
    // logo abaixo dela.
    desenharEnergia(renderer, cores) {
        const energia = this.fase.energia;
        if (energia === null) {
            return MARGEM + 22;
        }
        const { jogo } = dadosDoEstilo();
        const yTexto = MARGEM - 2 + this.vida.rotulo.altura + 2 + this.vida.altura + 4;
        this.textoEnergia.desenhar(renderer, MARGEM, yTexto, { cor: jogo.textoFraco });
        const yBarra = yTexto + this.textoEnergia.altura + 1;
        const h = BARRA_ENERGIA_ALTURA;
        pintar(renderer, jogo.escuridao, MARGEM - 1, yBarra - 1, BARRA_TORRE + 2, h + 2, 0.9);
        pintar(renderer, cores.arcoVazio, MARGEM, yBarra, BARRA_TORRE, h, 0.8);
        const fracao = energia.fracao;
        const cheio = Math.round(BARRA_TORRE * fracao);
        if (cheio > 0) {
            // perto de encher, a barra pulsa; uma faísca chegando clareia
            const pulso = fracao >= 0.8 ? 0.8 + 0.2 * Math.sin(this.tempo * 8) : 1;
            pintar(renderer, cores.arcoPronto, MARGEM, yBarra, cheio, h, pulso);
            pintar(renderer, jogo.texto, MARGEM, yBarra, cheio, 1, 0.3 + 0.4 * energia.chegada);
        }
        return yBarra + h + 4;
    }

    // Ícones das melhorias pegas, com o nível (ou as vezes, no Reparo).
    desenharMelhorias(renderer, cores, y) {
        const { jogo } = dadosDoEstilo();
        let x = MARGEM;
        for (const m of MELHORIAS) {
            const nivel = nivelDe(m.id);
            if (nivel <= 0) {
                continue;
            }
            // o ícone dobrado ocupa uns pixels a mais dos dois lados
            if (m.dobrado) {
                x += 3;
            }
            if (m.id === this.ultimaMelhoria && this.brilhoDaMelhoria > 0) {
                pintar(renderer, cores.engrenagem, x - 2, y - 2, ICONE + 4, ICONE + 4, 0.5 * this.brilhoDaMelhoria);
            }
            desenharIconeDaMelhoria(renderer, m, x, y);
            const rotulo = this.niveis.get(m.id);
            rotulo.texto = String(nivel);
            rotulo.desenhar(renderer, x + ICONE + 1, y + ICONE - rotulo.altura + 1, {
                cor: nivel >= m.maximo ? jogo.destaque : jogo.texto,
            });
            x += PASSO_DA_MELHORIA + (m.dobrado ? 3 : 0);
        }
    }

    desenharLanterna(renderer, cores) {
        const { jogo } = dadosDoEstilo();
        const direita = CONFIG.largura - MARGEM;
        const esquerda = direita - BARRA_FACHO;
        // rótulo e as 4 engrenagens (apagadas ou acesas)
        this.lanterna.desenhar(renderer, direita, MARGEM - 2, { cor: jogo.texto, alinhamento: "direita" });
        const y = MARGEM - 2 + this.lanterna.altura + 2;
        const nivel = Math.min(NIVEL_MAXIMO, partida.nivelLanterna);
        for (let i = 0; i < NIVEL_MAXIMO; i++) {
            const x = esquerda + i * (ICONE + VAO_ICONES);
            const acesa = i < nivel;
            if (acesa && i === nivel - 1 && this.brilhoDaEngrenagem > 0) {
                pintar(renderer, cores.engrenagem, x - 2, y - 2, ICONE + 4, ICONE + 4, 0.5 * this.brilhoDaEngrenagem);
            }
            renderer.save();
            renderer.setGlobalAlpha(acesa ? 1 : 0.28);
            desenharIcone(renderer, ICONE_ENGRENAGEM, x, y);
            renderer.restore();
        }

        // recarga do facho: rótulo e barra que se enche
        const facho = this.fase.facho;
        if (facho === null) {
            return;
        }
        const yTexto = y + ICONE + 3;
        this.textoFacho.desenhar(renderer, esquerda, yTexto, { cor: jogo.textoFraco });
        const yBarra = yTexto + this.textoFacho.altura + 1;
        const altura = 4;
        pintar(renderer, jogo.escuridao, esquerda - 1, yBarra - 1, BARRA_FACHO + 2, altura + 2, 0.9);
        pintar(renderer, cores.arcoVazio, esquerda, yBarra, BARRA_FACHO, altura, 0.8);
        let cheio = Math.round(BARRA_FACHO * facho.carga);
        let corDaBarra = cores.arcoCheio;
        let alfa = 1;
        if (facho.disparando) {
            cheio = BARRA_FACHO;
            corDaBarra = cores.fachoMiolo;
        } else if (facho.pronto) {
            corDaBarra = cores.arcoPronto;
            alfa = 0.75 + 0.25 * Math.sin(this.tempo * 6);
        }
        if (cheio > 0) {
            pintar(renderer, corDaBarra, esquerda, yBarra, cheio, altura, alfa);
            pintar(renderer, jogo.texto, esquerda, yBarra, cheio, 1, 0.3 * alfa);
        }
    }

    desenharAviso(renderer) {
        const t = this.tempoDoAviso;
        if (t >= this.duracaoDoAviso) {
            return;
        }
        const entrada = Math.min(1, t / AVISO.entrada);
        const saida = Math.min(1, (this.duracaoDoAviso - t) / AVISO.saida);
        const opacidade = Math.min(entrada, saida);
        const subida = (1 - entrada) * 6;
        const { jogo } = dadosDoEstilo();
        this.aviso.desenhar(renderer, CONFIG.largura / 2, (this.avisoNoKraken ? AVISO_Y_KRAKEN : AVISO_Y) + subida, {
            cor: jogo.destaque,
            opacidade,
            alinhamento: "centro",
        });
    }

    destroy() {
        super.destroy();
        this.vida.destroy();
        this.textoEnergia.destroy();
        for (const r of this.niveis.values()) {
            r.destroy();
        }
        this.lanterna.destroy();
        this.textoFacho.destroy();
        this.aviso.destroy();
    }
}
