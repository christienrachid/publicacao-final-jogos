import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo } from "../systems/estilo.js";
import { emitirFaiscas, emitirPoeira } from "../systems/particulas.js";
import { relogio } from "../systems/relogio.js";
import { efeito } from "../systems/som.js";
import { Rotulo } from "../ui/texto.js";
import { focarCamera, voltarCameraAoJogador } from "./camera.js";
import { CENA } from "./config.js";
import { LuzRedonda } from "./escuridao.js";

// Cena do conserto da torre: faixas pretas
// entram, a câmera vai até a torre com zoom 1, três marteladas ritmadas com
// faíscas, poeira e um tremor leve, a torre troca de estágio na última, um
// texto ("Torre 2/4") e a câmera volta ao jogador. ~3,5 s.
//
// Enquanto a cena roda (cena.ativa), a fase não atualiza monstros nem
// itens; o relógio para (relogio.parar) e volta no fim, e o jogador fica
// travado. Tudo anda pelo dt da fase: a pausa (Esc) congela a cena junto.
//
// Uso (a fase muda partida antes, a cena só mostra a troca):
//   const antes = torre.estagio;
//   partida.pecas += 1;                        (ou partida.lente = true)
//   await cena.iniciar({ estagioAntes: antes, texto: "Torre 2/4" });
// A torre mostra `estagioAntes` até a última martelada e então volta ao
// estágio automático (o da partida).

export class CenaDaTorre {
    // fase: a Fase1Stage (torre, jogador, escuridao, mapa, app)
    constructor(fase) {
        this.fase = fase;
        this.ativa = false;
        // ms desde o começo
        this.tempo = 0;
        this.duracao = CENA.voltar + CENA.volta + CENA.faixaEntrada;
        // 0 a 1: faixas pretas entrando
        this.faixas = 0;
        this.texto = new Rotulo("", 2);
        this.tempoDoTexto = Infinity;
        this.proximaMartelada = 0;
        this.voltou = false;
        this.relogioRodava = false;
        this.resolver = null;
        this.luz = new LuzRedonda(fase.mapa, 0, 0, CENA.luz);
        this.luz.forca = 0;
        fase.escuridao.adicionar(this.luz);
    }

    // Começa a cena; devolve uma Promise que resolve no fim dela.
    iniciar({ estagioAntes, texto = "" }) {
        if (this.ativa) {
            return Promise.resolve();
        }
        const { torre, jogador } = this.fase;
        this.ativa = true;
        this.tempo = 0;
        this.proximaMartelada = 0;
        this.voltou = false;
        this.texto.texto = texto;
        this.tempoDoTexto = Infinity;
        this.relogioRodava = relogio.estaRodando();
        relogio.parar();
        jogador.travado = true;
        torre.estagioForcado = estagioAntes;
        const c = torre.centro();
        this.luz.x = c.x;
        this.luz.y = c.y;
        focarCamera(c.x, c.y, CENA.zoom, CENA.ida);
        return new Promise((resolver) => {
            this.resolver = resolver;
        });
    }

    // dtMs: ms do quadro (já fora da pausa)
    atualizar(dtMs) {
        this.tempoDoTexto += dtMs;
        if (!this.ativa) {
            this.faixas = Math.max(0, this.faixas - dtMs / CENA.faixaEntrada);
            this.luz.forca = Math.max(0, this.luz.forca - dtMs / 400);
            return;
        }
        this.tempo += dtMs;
        const t = this.tempo;
        const saindo = t >= CENA.voltar + CENA.volta;
        this.faixas = saindo ? Math.max(0, this.faixas - dtMs / CENA.faixaEntrada) : Math.min(1, this.faixas + dtMs / CENA.faixaEntrada);
        this.luz.forca = t < CENA.voltar ? Math.min(1, t / CENA.ida) : Math.max(0, 1 - (t - CENA.voltar) / CENA.volta);

        const marteladas = CENA.marteladas;
        while (this.proximaMartelada < marteladas.length && t >= marteladas[this.proximaMartelada]) {
            this.martelar(this.proximaMartelada === marteladas.length - 1);
            this.proximaMartelada++;
        }
        if (!this.voltou && t >= CENA.voltar) {
            this.voltou = true;
            voltarCameraAoJogador(CENA.volta);
        }
        if (t >= this.duracao) {
            this.terminar();
        }
    }

    martelar(ultima) {
        const torre = this.fase.torre;
        efeito("conserto");
        const c = torre.centro();
        // faíscas num ponto da torre, poeira na base
        const x = c.x + (Math.random() - 0.5) * 30;
        const y = c.y + (Math.random() - 0.3) * 70;
        emitirFaiscas(x, y, ultima ? CENA.faiscas * 2 : CENA.faiscas);
        emitirPoeira(torre.base.x - 14, torre.base.y);
        emitirPoeira(torre.base.x + 14, torre.base.y);
        this.fase.app.viewport.shake(CENA.tremor * (ultima ? 1.6 : 1), CENA.tremorMs);
        if (ultima) {
            torre.estagioForcado = null;
            emitirFaiscas(c.x, c.y - 30, CENA.faiscas);
            emitirPoeira(torre.base.x, torre.base.y);
            if (this.texto.texto !== "") {
                this.tempoDoTexto = 0;
            }
        }
    }

    terminar() {
        this.ativa = false;
        const { torre, jogador } = this.fase;
        torre.estagioForcado = null;
        jogador.travado = false;
        // o clique que estava apertado não liga a lanterna sozinho
        jogador.botaoTravado = true;
        if (this.relogioRodava) {
            relogio.retomar();
        }
        const resolver = this.resolver;
        this.resolver = null;
        resolver?.();
    }

    // Na tela (px da tela): faixas pretas e o texto.
    desenhar(renderer) {
        const { jogo } = dadosDoEstilo();
        if (this.faixas > 0) {
            const s = this.faixas * this.faixas * (3 - 2 * this.faixas);
            const h = Math.round(CENA.faixaAltura * s);
            pintar(renderer, "#000000", 0, 0, CONFIG.largura, h);
            pintar(renderer, "#000000", 0, CONFIG.altura - h, CONFIG.largura, h);
        }
        if (this.tempoDoTexto < CENA.textoDuracao) {
            const p = this.tempoDoTexto / CENA.textoDuracao;
            const opacidade = Math.min(1, p * 6, (1 - p) * 4);
            const y = CONFIG.altura - CENA.faixaAltura - this.texto.altura - 10 - (1 - Math.min(1, p * 6)) * 4;
            this.texto.desenhar(renderer, CONFIG.largura / 2, y, { cor: jogo.destaque, opacidade, alinhamento: "centro" });
        }
    }

    // Fim da fase no meio da cena: solta tudo sem esperar.
    destroy() {
        if (this.ativa) {
            this.ativa = false;
            const resolver = this.resolver;
            this.resolver = null;
            resolver?.();
        }
        this.fase.escuridao?.remover(this.luz);
        this.luz.destroy();
        this.texto.destroy();
    }
}
