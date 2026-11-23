import { loader } from "melonjs";
import { CONFIG } from "../config.js";
import { DICA_DEPURACAO } from "../systems/depuracao.js";
import { dadosDoEstilo, imagem } from "../systems/estilo.js";
import { partida } from "../systems/partida.js";
import { ehHoraDeChefe, relogio } from "../systems/relogio.js";
import { Rotulo } from "./texto.js";

// HUD comum das fases, em pixels da tela: o relógio no alto (ícone e HH:MM,
// na cor de destaque na hora dos chefes) e, no modo de teste, as teclas de
// teste e o aviso de invencível.
//
// Cada fase estende esta classe (src/fase1/Hud.js, src/fase2/Hud.js) e
// acrescenta o que é dela em desenharFase(renderer): corações, bateria,
// vida da torre, barra do chefe. FaseBase cria o HUD por criarHud().

// ícones de itens-<estilo>.png (16×16, 8 colunas)
export const ICONE = 16;
const COLUNAS_ITENS = 8;
const ICONE_RELOGIO = 11;

const RELOGIO_Y = 6;
const RELOGIO_VAO = 3;
const DEPURACAO_MARGEM = 4;

// Desenha o ícone `id` da folha de itens com o canto em (x, y).
export function desenharIcone(renderer, id, x, y) {
    renderer.drawImage(
        loader.getImage(imagem("itens")),
        (id % COLUNAS_ITENS) * ICONE,
        Math.floor(id / COLUNAS_ITENS) * ICONE,
        ICONE,
        ICONE,
        Math.round(x),
        Math.round(y),
        ICONE,
        ICONE,
    );
}

export class Hud {
    constructor() {
        this.hora = new Rotulo("18:00");
        this.dica = CONFIG.debug ? new Rotulo(DICA_DEPURACAO) : null;
        this.invencivel = CONFIG.debug ? new Rotulo("INVENCÍVEL") : null;
    }

    // Chamado todo quadro fora da pausa (animações do HUD).
    atualizar(_dt) {}

    desenhar(renderer) {
        this.desenharFase(renderer);
        this.desenharRelogio(renderer);
        this.desenharDepuracao(renderer);
    }

    // Gancho das fases: o que é de cada uma (corações, bateria, torre...).
    desenharFase(_renderer) {}

    desenharRelogio(renderer) {
        const { jogo } = dadosDoEstilo();
        this.hora.texto = relogio.formatar();
        const largura = ICONE + RELOGIO_VAO + this.hora.largura;
        const x = Math.round((CONFIG.largura - largura) / 2);
        desenharIcone(renderer, ICONE_RELOGIO, x, RELOGIO_Y);
        const textoY = RELOGIO_Y + Math.round((ICONE - this.hora.altura) / 2) + 1;
        this.hora.desenhar(renderer, x + ICONE + RELOGIO_VAO, textoY, {
            cor: ehHoraDeChefe() ? jogo.destaque : jogo.texto,
        });
    }

    desenharDepuracao(renderer) {
        if (this.dica === null) {
            return;
        }
        const { jogo } = dadosDoEstilo();
        const y = CONFIG.altura - DEPURACAO_MARGEM - this.dica.altura;
        this.dica.desenhar(renderer, CONFIG.largura / 2, y, { cor: jogo.textoFraco, alinhamento: "centro" });
        if (partida.invencivel) {
            this.invencivel.desenhar(renderer, CONFIG.largura - DEPURACAO_MARGEM, y - this.invencivel.altura - 2, {
                cor: jogo.destaque,
                alinhamento: "direita",
            });
        }
    }

    destroy() {
        this.hora.destroy();
        this.dica?.destroy();
        this.invencivel?.destroy();
    }
}
