import { Stage, state } from "melonjs";
import { ETAPAS, partida, salvarPontoDeRetorno } from "../systems/partida.js";
import { Depuracao } from "../systems/depuracao.js";
import { aplicarPosEfeitos } from "../systems/posEfeitos.js";
import { relogio } from "../systems/relogio.js";
import { modoPausa, tocarMusica } from "../systems/som.js";
import { Hud } from "../ui/Hud.js";
import { Pausa } from "../ui/Pausa.js";
import { desenharNaTela } from "../ui/tela.js";

// Base das duas fases: o que toda fase tem em comum (relógio, pausa, HUD,
// modo de teste, música da etapa, ponto de retorno, estatística de tempo) e
// os ganchos para cada fase preencher. Fase1Stage e Fase2Stage estendem.
//
// Ciclo de uma fase:
//   onResetEvent(app, { etapa, inicio })   ← vem de partida.irParaEtapa
//     relógio começa em `inicio`, ponto de retorno salvo, pausa e modo de
//     teste ligados, HUD criado (criarHud), música tocando (musicaDaEtapa),
//     e então montar(app) ← a fase monta o mundo aqui
//   update(dt)
//     pausa.atualizar → se pausado, para aqui
//     tempo de jogo, relogio.atualizar (avisa aoMudarHora/aoMeiaHora),
//     hud.atualizar, atualizarFase(dt) ← a lógica da fase
//   draw(renderer, world)
//     mundo (super.draw, com o drawLighting da fase) e por cima, em pixels
//     da tela: desenharHud(renderer) e a pausa
//   onDestroyEvent(app)
//     desmontar(app) ← a fase desfaz o que fez; depois a base desliga o
//     resto (ouvintes do relógio, pausa, modo de teste, HUD)
//
// Uma fase não chama state.change direto: usa partida.irParaEtapa,
// partida.vencer, partida.perder ou partida.voltarAoMenu.
export class FaseBase extends Stage {
    constructor() {
        super();
        this.app = null;
        this.etapa = null;
        this.hud = null;
        this.pausa = null;
        this.depuracao = null;
        this.cancelarOuvintes = [];
    }

    // ---- ganchos para as fases --------------------------------------------

    // Estado desta fase para o modo de teste: "fase1" ou "fase2".
    get estadoDaFase() {
        return "fase1";
    }

    // Nome da música de cada etapa (src/systems/musicas.js).
    musicaDaEtapa(etapa) {
        return etapa;
    }

    // HUD da fase (uma subclasse de src/ui/Hud.js).
    criarHud() {
        return new Hud();
    }

    // Monta o mundo da fase (mapa, entidades, luzes) e liga as teclas.
    montar(_app) {}

    // Desfaz o que montar fez: teclas, eventos, sons em loop.
    desmontar(_app) {}

    // Lógica de cada quadro fora da pausa.
    atualizarFase(_dt) {}

    // Hora cheia e meia hora do relógio: { minutos, hora, minuto }.
    aoMudarHora(_instante) {}
    aoMeiaHora(_instante) {}

    // O modo de teste pulou o relógio (relogio.definir ou avancar).
    aoPularTempo() {}

    // HUD por cima de tudo, em pixels da tela.
    desenharHud(renderer) {
        this.hud.desenhar(renderer);
    }

    // ---- base ---------------------------------------------------------------

    // Troca a etapa sem trocar de stage (22h → Holandês, 5h → Kraken):
    // salva o ponto de retorno e troca a música.
    entrarNaEtapa(etapa) {
        this.etapa = etapa;
        salvarPontoDeRetorno(etapa);
        tocarMusica(this.musicaDaEtapa(etapa));
    }

    onResetEvent(app, opcoes = {}) {
        this.app = app;
        const etapa = opcoes.etapa ?? this.estadoDaFase;
        relogio.iniciar(opcoes.inicio ?? ETAPAS[etapa].inicio);
        aplicarPosEfeitos(app);

        this.cancelarOuvintes = [
            relogio.ouvir("hora", (instante) => this.aoMudarHora(instante)),
            relogio.ouvir("meiaHora", (instante) => this.aoMeiaHora(instante)),
        ];
        this.pausa = new Pausa(app);
        this.pausa.ligar();
        this.depuracao = new Depuracao(this, this.estadoDaFase);
        this.depuracao.ligar();
        this.hud = this.criarHud();

        this.entrarNaEtapa(etapa);
        this.montar(app);
    }

    onDestroyEvent(app) {
        this.desmontar(app);
        for (const cancelar of this.cancelarOuvintes) {
            cancelar();
        }
        this.cancelarOuvintes = [];
        relogio.parar();
        this.depuracao?.desligar();
        this.depuracao = null;
        this.pausa?.desligar();
        this.pausa?.destroy();
        this.pausa = null;
        this.hud?.destroy();
        this.hud = null;
        modoPausa(false);
    }

    update(dt) {
        super.update(dt);
        this.pausa.atualizar(dt);
        // a Stage não para sozinha com state.pause(): só o mundo para; e
        // saindo da pausa para o menu, a fase espera o fade parada
        if (state.isPaused() || this.pausa.saindo) {
            return true;
        }
        partida.estatisticas.tempoMs += dt;
        relogio.atualizar(dt);
        this.hud.atualizar(dt);
        this.atualizarFase(dt);
        return true;
    }

    draw(renderer, world) {
        super.draw(renderer, world);
        if (this.hud === null) {
            return;
        }
        desenharNaTela(this, renderer, (r) => {
            this.desenharHud(r);
            this.pausa.desenhar(r);
        });
    }
}
