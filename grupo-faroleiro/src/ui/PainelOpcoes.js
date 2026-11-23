import { dadosDoEstilo } from "../systems/estilo.js";
import { volumeEfeitos, volumeMusica } from "../systems/opcoes.js";
import { definirVolumeEfeitos, definirVolumeMusica, efeito } from "../systems/som.js";
import { Botao, Slider } from "./controles.js";
import { Lista } from "./lista.js";
import { Painel } from "./painel.js";
import { Rotulo } from "./texto.js";

// Painel de opções, o mesmo no menu e na pausa: volume da música, volume dos
// efeitos e Voltar. Quem mostra o painel repassa a entrada para
// `painel.lista` e chama abrir() ao mostrar.

const LARGURA = 288;
const ALTURA = 142;
const TITULO_Y = 18;
const PRIMEIRA_LINHA_Y = 48;
const ESPACO = 26;
const BOTAO_Y = 102;

export class PainelOpcoes {
    // app: a Application; aoVoltar: fecha o painel
    constructor(app, { aoVoltar }) {
        this.app = app;
        this.painel = new Painel();
        this.titulo = new Rotulo("Opções");
        const musica = new Slider("Música", volumeMusica, definirVolumeMusica);
        // ao mexer nos efeitos, uma amostra para ouvir o volume
        const efeitos = new Slider("Efeitos", volumeEfeitos, definirVolumeEfeitos, () => efeito("coleta"));
        const voltar = new Botao("Voltar", aoVoltar);
        this.lista = new Lista([musica, efeitos, voltar], { aoVoltar });
        this.x = 0;
        this.y = 0;
        this.posicionar(320, 180);
    }

    // Centra o painel em (cx, cy) na tela.
    posicionar(cx, cy) {
        this.x = Math.round(cx - LARGURA / 2);
        this.y = Math.round(cy - ALTURA / 2);
        this.lista.posicionar(cx, this.y + PRIMEIRA_LINHA_Y, ESPACO);
        const voltar = this.lista.controles[2];
        voltar.y = this.y + BOTAO_Y;
    }

    // Ao mostrar o painel: foco na primeira linha.
    abrir() {
        this.lista.focar();
    }

    desenhar(renderer, opacidade = 0.94) {
        this.painel.desenhar(renderer, this.x, this.y, LARGURA, ALTURA, opacidade);
        this.titulo.desenhar(renderer, this.x + LARGURA / 2, this.y + TITULO_Y, { cor: dadosDoEstilo().jogo.destaque, alinhamento: "centro" });
        this.lista.desenhar(renderer);
    }

    destroy() {
        this.painel.destroy();
        this.titulo.destroy();
        this.lista.destroy();
    }
}
