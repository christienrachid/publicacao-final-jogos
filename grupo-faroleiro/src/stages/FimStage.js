import { loader, Renderable, Stage } from "melonjs";
import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo, estiloAtual, imagem } from "../systems/estilo.js";
import { partida, voltarAoMenu, voltarAoPonto } from "../systems/partida.js";
import { aplicarPosEfeitos } from "../systems/posEfeitos.js";
import { relogio } from "../systems/relogio.js";
import { tocarMusica } from "../systems/som.js";
import { Botao } from "../ui/controles.js";
import { empilhar, remover } from "../ui/entrada.js";
import { desenharIcone, ICONE } from "../ui/Hud.js";
import { Lista } from "../ui/lista.js";
import { Painel } from "../ui/painel.js";
import { desenharNaTela } from "../ui/tela.js";
import { Rotulo } from "../ui/texto.js";

// Fim da partida (state.GAMEOVER). Recebe { tipo: "vitoria" } ou
// { tipo: "derrota", motivo } de partida.vencer / partida.perder.
//
// Vitória: amanhecer com o sol subindo e o farol aceso, "O farol voltou a
// brilhar", o resumo da partida e o botão Menu.
// Derrota: noite fechada sobre o fundo do menu, o motivo, a hora em que
// aconteceu e os botões Tentar de novo (volta ao começo da etapa) e Menu.

// céu do amanhecer de cima para baixo, por estilo (cores de tempo de execução)
const AMANHECER = {
    mare: ["#141c36", "#2e2f55", "#6b4468", "#c0607a", "#f2a541"],
};
// mar: cor do fundo e do brilho de cada estilo
const MAR = {
    mare: ["#0e1830", "#ffcf8a"],
};

const HORIZONTE = 236;
const FAIXA_CEU = 4;
// sol (sol-<tema>.png, 48×48) subindo do horizonte à esquerda
const SOL_X = 128;
const SOL_SUBIDA = 34;
const SOL_DURACAO = 7000;
// farol pronto (quadro 5 de torre-<tema>.png, 48×128) numa pedra à direita
const TORRE_QUADRO = 5;
const TORRE_LARGURA = 48;
const TORRE_ALTURA = 128;
const TORRE_X = 520;
const TORRE_BASE = HORIZONTE + 14;
const LANTERNA = { x: 24, y: 14 };
const HALO_RAIO = 10;
// brilhos no mar: [x, y, fase]
const BRILHOS = [
    [96, 246, 0],
    [150, 252, 1.3],
    [120, 262, 2.1],
    [182, 244, 3.4],
    [70, 270, 4.2],
    [140, 284, 5.1],
    [460, 258, 0.7],
    [560, 272, 2.8],
];

// derrota: véu escuro sobre o fundo do menu
const VEU_DERROTA = 0.78;

// "#rrggbb" → [r, g, b]
function rgb(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Céu em faixas de 4 px, misturando as cores do tema de cima para baixo
// (faixas visíveis, como pixel art, em vez de um degradê liso).
const faixasDoCeu = new Map();
function coresDasFaixas(cores) {
    let lista = faixasDoCeu.get(cores);
    if (lista === undefined) {
        const paleta = cores.map(rgb);
        const faixas = Math.ceil(HORIZONTE / FAIXA_CEU);
        lista = [];
        for (let i = 0; i < faixas; i++) {
            const t = (i / (faixas - 1)) * (paleta.length - 1);
            const a = paleta[Math.floor(t)];
            const b = paleta[Math.min(paleta.length - 1, Math.floor(t) + 1)];
            const f = t - Math.floor(t);
            lista.push(`rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`);
        }
        faixasDoCeu.set(cores, lista);
    }
    return lista;
}

function desenharCeu(renderer, cores) {
    coresDasFaixas(cores).forEach((cor, i) => {
        pintar(renderer, cor, 0, i * FAIXA_CEU, CONFIG.largura, FAIXA_CEU);
    });
}

class CenaDoFim extends Renderable {
    constructor(vitoria) {
        super(0, 0, CONFIG.largura, CONFIG.altura);
        this.anchorPoint.set(0, 0);
        this.floating = true;
        this.alwaysUpdate = true;
        this.vitoria = vitoria;
        this.tempo = 0;
    }

    update(dt) {
        this.tempo += dt;
        return true;
    }

    draw(renderer) {
        renderer.setGlobalAlpha(1);
        if (this.vitoria) {
            this.desenharAmanhecer(renderer);
        } else {
            const { jogo } = dadosDoEstilo();
            renderer.drawImage(loader.getImage(imagem("menu-fundo")), 0, 0);
            pintar(renderer, jogo.escuridao, 0, 0, CONFIG.largura, CONFIG.altura, VEU_DERROTA);
        }
    }

    desenharAmanhecer(renderer) {
        const tema = estiloAtual();
        const { jogo } = dadosDoEstilo();
        const t = this.tempo;
        desenharCeu(renderer, AMANHECER[tema]);

        // o sol nasce devagar; o mar cobre a parte de baixo dele
        const subida = Math.min(1, t / SOL_DURACAO);
        const facil = 1 - Math.pow(1 - subida, 3);
        const sol = loader.getImage(imagem("sol"));
        renderer.drawImage(sol, SOL_X - 24, Math.round(HORIZONTE - 24 - facil * SOL_SUBIDA));

        const [corMar, corBrilho] = MAR[tema];
        pintar(renderer, corMar, 0, HORIZONTE, CONFIG.largura, CONFIG.altura - HORIZONTE);
        pintar(renderer, corBrilho, 0, HORIZONTE, CONFIG.largura, 1, 0.35);
        // reflexo do sol: traços na água abaixo dele
        for (let i = 0; i < 6; i++) {
            const largura = 30 - i * 4;
            const y = HORIZONTE + 4 + i * 6;
            const onda = Math.round(Math.sin(t / 700 + i) * 2);
            pintar(renderer, corBrilho, SOL_X - largura / 2 + onda, y, largura, 1, 0.45 - i * 0.05);
        }
        for (const [x, y, fase] of BRILHOS) {
            const brilho = Math.max(0, Math.sin(t / 600 + fase * 2));
            if (brilho > 0.2) {
                pintar(renderer, corBrilho, x, y, 2, 1, brilho * 0.8);
            }
        }

        // pedra e farol aceso, com o halo da lanterna pulsando
        pintar(renderer, jogo.escuridao, TORRE_X - 34, TORRE_BASE - 6, 68, 10);
        pintar(renderer, jogo.escuridao, TORRE_X - 24, TORRE_BASE - 10, 48, 6);
        const torre = loader.getImage(imagem("torre"));
        const tx = TORRE_X - TORRE_LARGURA / 2;
        const ty = TORRE_BASE - TORRE_ALTURA - 6;
        renderer.drawImage(
            torre,
            TORRE_QUADRO * TORRE_LARGURA,
            0,
            TORRE_LARGURA,
            TORRE_ALTURA,
            tx,
            ty,
            TORRE_LARGURA,
            TORRE_ALTURA,
        );
        const pulso = 0.25 + 0.1 * Math.sin(t / 400);
        renderer.save();
        renderer.setBlendMode("additive");
        renderer.setGlobalAlpha(pulso);
        renderer.setColor(jogo.luz);
        renderer.fillEllipse(tx + LANTERNA.x, ty + LANTERNA.y, HALO_RAIO, HALO_RAIO);
        renderer.setBlendMode("normal");
        renderer.restore();
    }
}

// interface (pixels da tela)
const TITULO_Y = 34;
const SUBTITULO_Y = 62;
const RESUMO_LARGURA = 248;
const RESUMO_ALTURA = 132;
const RESUMO_Y = 96;
const RESUMO_TOPO = 16;
const RESUMO_LINHA = 16;
const BOTOES_Y_VITORIA = 252;
const RECORDE_Y_VITORIA = 78;
const CAVEIRA_Y = 52;
const MOTIVO_Y = 76;
const HORA_Y = 100;
const DADOS_Y = 128;
const DADOS_LINHA = 16;
const BOTOES_Y_DERROTA = 216;
const BOTOES_ESPACO = 32;
// nome de cada carta do baú, pelo id guardado em partida.estatisticas.cartas
const NOMES_DAS_CARTAS = { bateria: "Bateria maior", dano: "Luz forte" };

function formatarTempo(ms) {
    const segundos = Math.floor(ms / 1000);
    return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

// Linhas do resumo da vitória. Sem "quedas": desde a v3, morrer na Fase 1
// acaba a run, então uma vitória sempre teria 0.
function linhasDoResumo() {
    const e = partida.estatisticas;
    return [
        `Peças da torre: ${partida.pecas} de 4`,
        `Engrenagens: ${partida.nivelLanterna} de 4`,
        `Monstros derrotados: ${e.monstros}`,
        `Tentativas: ${e.tentativas + 1}`,
        `Tempo de jogo: ${formatarTempo(e.tempoMs)}`,
    ];
}

// Linhas do resumo da derrota: monstros, peças e as cartas do baú que tem
// ("Bateria maior ×2, Luz forte ×1"; sem carta, a linha não aparece).
function linhasDaDerrota() {
    const e = partida.estatisticas;
    const linhas = [`Monstros vencidos: ${e.monstros}`, `Peças: ${partida.pecas}/4`];
    const contagem = new Map();
    for (const id of e.cartas) {
        contagem.set(id, (contagem.get(id) ?? 0) + 1);
    }
    if (contagem.size > 0) {
        const cartas = [...contagem].map(([id, n]) => `${NOMES_DAS_CARTAS[id] ?? id} ×${n}`);
        linhas.push(`Cartas: ${cartas.join(", ")}`);
    }
    return linhas;
}

export class FimStage extends Stage {
    constructor() {
        super();
        this.vitoria = false;
        this.lista = null;
        this.rotulos = [];
        this.painel = null;
        this.recorde = null;
    }

    onResetEvent(app, { tipo = "derrota", motivo = "A noite venceu" } = {}) {
        this.vitoria = tipo === "vitoria";
        aplicarPosEfeitos(app);
        app.world.addChild(new CenaDoFim(this.vitoria), 1);
        this.painel = new Painel();

        if (this.vitoria) {
            this.titulo = new Rotulo("O farol voltou a brilhar", 2);
            this.subtitulo = new Rotulo("Amanheceu. São 06:00.");
            this.resumo = linhasDoResumo().map((linha) => new Rotulo(linha));
            this.recorde = partida.novoRecorde ? new Rotulo("Novo recorde! Vitória mais rápida") : null;
            this.lista = new Lista([new Botao("Menu", () => voltarAoMenu())]);
            this.lista.posicionar(CONFIG.largura / 2, BOTOES_Y_VITORIA, 0);
            tocarMusica("vitoria");
        } else {
            this.titulo = new Rotulo(motivo, 2);
            this.subtitulo = new Rotulo(`Às ${relogio.formatar(partida.horaDaDerrota ?? relogio.minutos())}`);
            this.resumo = linhasDaDerrota().map((linha) => new Rotulo(linha));
            this.recorde = partida.novoRecorde ? new Rotulo("Novo recorde! Noite mais longa") : null;
            this.lista = new Lista([
                new Botao("Tentar de novo", () => voltarAoPonto()),
                new Botao("Menu", () => voltarAoMenu()),
            ]);
            this.lista.posicionar(CONFIG.largura / 2, BOTOES_Y_DERROTA, BOTOES_ESPACO);
            tocarMusica("derrota");
        }
        empilhar(this.lista);
    }

    onDestroyEvent() {
        remover(this.lista);
        this.lista.destroy();
        this.titulo.destroy();
        this.subtitulo.destroy();
        for (const r of this.resumo) {
            r.destroy();
        }
        this.recorde?.destroy();
        this.recorde = null;
        this.painel.destroy();
        this.lista = null;
    }

    draw(renderer, world) {
        super.draw(renderer, world);
        if (this.lista === null) {
            return;
        }
        desenharNaTela(this, renderer, (r) => (this.vitoria ? this.desenharVitoria(r) : this.desenharDerrota(r)));
    }

    desenharVitoria(renderer) {
        const { jogo } = dadosDoEstilo();
        const meio = CONFIG.largura / 2;
        this.titulo.desenhar(renderer, meio, TITULO_Y, { cor: jogo.destaque, alinhamento: "centro" });
        this.subtitulo.desenhar(renderer, meio, SUBTITULO_Y, { alinhamento: "centro" });
        this.recorde?.desenhar(renderer, meio, RECORDE_Y_VITORIA, { cor: jogo.destaque, alinhamento: "centro" });
        const x =Math.round(meio - RESUMO_LARGURA / 2);
        this.painel.desenhar(renderer, x, RESUMO_Y, RESUMO_LARGURA, RESUMO_ALTURA, 0.9);
        this.resumo.forEach((rotulo, i) => {
            rotulo.desenhar(renderer, meio, RESUMO_Y + RESUMO_TOPO + i * RESUMO_LINHA, { alinhamento: "centro" });
        });
        this.lista.desenhar(renderer);
    }

    desenharDerrota(renderer) {
        const { jogo } = dadosDoEstilo();
        const meio = CONFIG.largura / 2;
        // caveira (ícone 15 de itens-<tema>.png)
        desenharIcone(renderer, 15, meio - ICONE / 2, CAVEIRA_Y);
        this.titulo.desenhar(renderer, meio, MOTIVO_Y, { cor: jogo.destaque, alinhamento: "centro" });
        this.subtitulo.desenhar(renderer, meio, HORA_Y, { cor: jogo.textoFraco, alinhamento: "centro" });
        this.resumo.forEach((rotulo, i) => {
            rotulo.desenhar(renderer, meio, DADOS_Y + i * DADOS_LINHA, { alinhamento: "centro" });
        });
        this.recorde?.desenhar(renderer, meio, DADOS_Y + this.resumo.length * DADOS_LINHA + 6, {
            cor: jogo.destaque,
            alinhamento: "centro",
        });
        this.lista.desenhar(renderer);
    }
}
