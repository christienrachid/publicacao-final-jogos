import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo } from "../systems/estilo.js";
import { partida } from "../systems/partida.js";
import { desenharIcone, Hud, ICONE } from "../ui/Hud.js";
import { Rotulo } from "../ui/texto.js";
import { AVISO, PECAS as CONFIG_PECAS } from "./config.js";
import { coresDoJogoFase1 } from "./cores.js";
import { desenharSeta } from "./itens/Itens.js";
import { Minimapa } from "./Minimapa.js";
import { lerVista } from "./vista.js";

// HUD da Fase 1, em pixels da tela: o relógio no alto (da base), os 5
// corações e a bateria da lanterna à esquerda, e as 4 peças da torre à
// direita (apagadas até serem pegas), os avisos no meio da tela com fade
// ("Um caranguejo gigante surgiu!"), os indicadores das peças fora da vista,
// a setinha cinza das lápides fora da vista e o minimapa (Minimapa.js)
// abaixo das peças (fora dele enquanto o Holandês está no ar).

// ícones de itens-<estilo>.png
const ICONE_CORACAO = 8;
const ICONE_CORACAO_VAZIO = 9;
const ICONE_BATERIA = 10;
const PECAS = [0, 1, 2, 3];

const MARGEM = 6;
const CORACAO_PASSO = 15;
const BATERIA_Y = MARGEM + ICONE + 3;
const BARRA_LARGURA = 44;
const BARRA_ALTURA = 6;
const PECA_PASSO = 18;
const PECA_APAGADA = 0.3;
// a bateria pisca quando falta pouco
const POUCA_BATERIA = 0.25;
// altura dos avisos no meio da tela
const AVISO_Y = 70;

export class HudFase1 extends Hud {
    constructor(fase) {
        super();
        this.fase = fase;
        this.tempo = 0;
        this.textoPecas = new Rotulo("0/4");
        this.aviso = new Rotulo("", 2);
        this.tempoDoAviso = Infinity;
        this.duracaoDoAviso = AVISO.duracao;
        this.minimapa = new Minimapa(fase);
    }

    // Mostra um aviso grande no meio da tela por AVISO.duracao segundos (ou
    // por `duracao` segundos, nos lembretes). Um aviso novo substitui o atual
    // e volta à duração padrão.
    avisar(texto, duracao = AVISO.duracao) {
        this.aviso.texto = texto;
        this.duracaoDoAviso = duracao;
        this.tempoDoAviso = 0;
    }

    atualizar(dt) {
        this.tempo += dt;
        this.tempoDoAviso += dt / 1000;
    }

    desenharFase(renderer) {
        const jogador = this.fase.jogador;
        if (!jogador) {
            return;
        }
        const { jogo } = dadosDoEstilo();

        // peças fora da vista (embaixo do resto do HUD), fora das cenas
        if (this.fase.itens && !this.fase.cena?.ativa) {
            this.fase.itens.desenharIndicadores(renderer, this.fase.app.viewport);
        }
        if (this.fase.diretor && !this.fase.cena?.ativa) {
            this.desenharLapidesForaDaVista(renderer);
        }

        // corações
        for (let i = 0; i < jogador.vidaMaxima; i++) {
            const cheio = i < jogador.vida;
            desenharIcone(renderer, cheio ? ICONE_CORACAO : ICONE_CORACAO_VAZIO, MARGEM + i * CORACAO_PASSO, MARGEM);
        }

        // bateria: ícone e barra
        const lanterna = jogador.lanterna;
        desenharIcone(renderer, ICONE_BATERIA, MARGEM, BATERIA_Y);
        const bx = MARGEM + ICONE + 3;
        const by = BATERIA_Y + Math.round((ICONE - BARRA_ALTURA) / 2);
        pintar(renderer, jogo.escuridao, bx - 1, by - 1, BARRA_LARGURA + 2, BARRA_ALTURA + 2, 0.85);
        pintar(renderer, jogo.textoFraco, bx, by, BARRA_LARGURA, BARRA_ALTURA, 0.35);
        const fracao = lanterna.fracao;
        const piscando = fracao < POUCA_BATERIA && Math.floor(this.tempo / 250) % 2 === 0;
        if (fracao > 0) {
            pintar(renderer, piscando ? jogo.texto : jogo.destaque, bx, by, Math.max(1, Math.round(BARRA_LARGURA * fracao)), BARRA_ALTURA);
        }
        // recarga em andamento: a parte que vai encher
        if (jogador.recarga > 0) {
            const alvo = Math.round(BARRA_LARGURA * Math.min(1, fracao + (1 - fracao) * jogador.recarga));
            pintar(renderer, jogo.texto, bx, by, alvo, BARRA_ALTURA, 0.5);
        }

        // peças da torre, à direita
        const pecas = Math.min(4, partida.pecas);
        this.textoPecas.texto = `${pecas}/4`;
        const direita = CONFIG.largura - MARGEM;
        const inicio = direita - PECAS.length * PECA_PASSO - this.textoPecas.largura - 4;
        PECAS.forEach((id, i) => {
            renderer.save();
            renderer.setGlobalAlpha(i < pecas ? 1 : PECA_APAGADA);
            desenharIcone(renderer, id, inicio + i * PECA_PASSO, MARGEM);
            renderer.restore();
        });
        this.textoPecas.desenhar(renderer, direita, MARGEM + Math.round((ICONE - this.textoPecas.altura) / 2) + 1, {
            cor: jogo.texto,
            alinhamento: "direita",
        });

        // com o Holandês no ar o minimapa sai: o navio sobre o morro passa
        // no canto de cima à direita e as lanternas ficariam embaixo dele
        const holandes = this.fase.holandes;
        if (!holandes || holandes.estado === "vencido") {
            this.minimapa.desenhar(renderer);
        }
        this.desenharAviso(renderer, jogo);
    }

    // Setinha na borda da tela para cada lápide viva fora da vista, na cor
    // da lápide no minimapa (como a das peças, sem o ícone).
    desenharLapidesForaDaVista(renderer) {
        const lapides = this.fase.diretor.lapides;
        if (lapides.length === 0) {
            return;
        }
        const v = lerVista(this.fase.app.viewport);
        const cor = coresDoJogoFase1().minimapa.lapide;
        const m = CONFIG_PECAS.indicadorMargem;
        const largura = CONFIG.largura;
        const altura = CONFIG.altura;
        const pulso = 0.75 + Math.sin((this.tempo / 1000) * 5) * 0.25;
        for (const lapide of lapides) {
            if (!lapide.vivo) {
                continue;
            }
            const c = lapide.centro();
            const sx = (c.x - v.x) * v.zoom;
            const sy = (c.y - v.y) * v.zoom;
            if (sx >= 0 && sx <= largura && sy >= 0 && sy <= altura) {
                continue;
            }
            const ix = Math.min(largura - m, Math.max(m, sx));
            const iy = Math.min(altura - m, Math.max(m + 24, sy));
            // para que lado a seta aponta: o eixo em que a lápide saiu mais
            const foraX = sx < 0 ? sx : sx > largura ? sx - largura : 0;
            const foraY = sy < 0 ? sy : sy > altura ? sy - altura : 0;
            let dx = 0;
            let dy = 0;
            if (Math.abs(foraX) >= Math.abs(foraY)) {
                dx = Math.sign(foraX);
            } else {
                dy = Math.sign(foraY);
            }
            desenharSeta(renderer, cor, ix, iy, dx, dy, pulso);
        }
    }

    desenharAviso(renderer, jogo) {
        const t = this.tempoDoAviso;
        if (t >= this.duracaoDoAviso) {
            return;
        }
        const entrada = Math.min(1, t / AVISO.entrada);
        const saida = Math.min(1, (this.duracaoDoAviso - t) / AVISO.saida);
        const subida = (1 - entrada) * 6;
        this.aviso.desenhar(renderer, CONFIG.largura / 2, AVISO_Y + subida, {
            cor: jogo.destaque,
            opacidade: Math.min(entrada, saida),
            alinhamento: "centro",
        });
    }

    destroy() {
        this.textoPecas.destroy();
        this.aviso.destroy();
        super.destroy();
    }
}
