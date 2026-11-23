import { loader, Renderable, Stage } from "melonjs";
import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { dadosDoEstilo, imagem } from "../systems/estilo.js";
import { irParaEtapa, novaPartida } from "../systems/partida.js";
import { aplicarPosEfeitos } from "../systems/posEfeitos.js";
import { tocarMusica } from "../systems/som.js";
import { Botao } from "../ui/controles.js";
import { empilhar, remover } from "../ui/entrada.js";
import { Lista } from "../ui/lista.js";
import { PainelOpcoes } from "../ui/PainelOpcoes.js";
import { Painel } from "../ui/painel.js";
import { desenharNaTela } from "../ui/tela.js";
import { Rotulo } from "../ui/texto.js";

// Menu (state.MENU): o pôr do sol de menu-fundo-<tema>.png com o logo
// flutuando no alto e quatro telas internas sobre o mesmo fundo: o menu
// (Jogar, Como jogar, Opções, Créditos), as opções, os créditos e o Como jogar.

// Créditos, na ordem da tela. `titulo: true` sai grande e em destaque.
export const CREDITOS = [
    { texto: "Faroleiro", titulo: true },
    { texto: "Base, gestão e interface: Pedro" },
    { texto: "Fase 1: Caio" },
    { texto: "Fase 2: Bernardo" },
    { texto: "Arte e som: Rafael" },
    { texto: "Feito com MelonJS, 2026" },
];

// Como jogar: as linhas de cada fase, nas duas colunas da tela
export const COMO_JOGAR = [
    {
        titulo: "Fase 1: a ilha",
        linhas: [
            "A / D andam · W ou Espaço pula · S desce",
            "Mouse mira · clique liga a lanterna",
            "Segure E na porta da casa para recarregar",
            "Morrer acaba a noite: corra para a casa com 1 coração",
            "Peças e baús dão cartas de melhoria",
        ],
    },
    {
        titulo: "Fase 2: o farol",
        linhas: [
            "Mouse aponta o facho",
            "Clique ou Espaço dispara a luz",
            "Monstros mortos enchem a energia: escolha melhorias",
            "Kraken: arraste reto de uma ponta à outra do tentáculo",
            "Esc pausa",
        ],
    },
];

// logo-<tema>.png centrado no alto, subindo e descendo devagar
const LOGO_Y = 24;
const LOGO_PERIODO = 3600;
const LOGO_AMPLITUDE = 2;

// botões do menu, no miolo calmo do fundo (x 220 a 420, y 150 a 330)
const MENU_Y = 182;
const MENU_ESPACO = 30;
// centro dos painéis de opções e créditos
const PAINEL_Y = 226;

// créditos: tamanho do painel e espaçamento das linhas
const CREDITOS_LARGURA = 336;
const CREDITOS_ALTURA = 193;
const CREDITOS_TOPO = 16;
const CREDITOS_LINHA = 17;
const CREDITOS_DEPOIS_DO_TITULO = 30;
const CREDITOS_BOTAO_Y = 157;

// Como jogar: painel, colunas (largura do texto e distância entre elas),
// alturas dentro do painel e espaçamento das linhas
const COMO_LARGURA = 592;
const COMO_ALTURA = 206;
const COMO_TOPO = 100;
const COMO_TITULO_Y = 12;
const COMO_SUBTITULO_Y = 38;
const COMO_LINHAS_Y = 58;
const COMO_COLUNA_MARGEM = 22;
const COMO_COLUNA_LARGURA = 262;
const COMO_COLUNA_PASSO = 286;
const COMO_LINHA = 13;
const COMO_ENTRE_ITENS = 5;
const COMO_BOTAO_Y = 166;

// Gaivotas atravessando o céu devagar, em silhueta: [y, velocidade px/s,
// fase inicial (0 a 1 da travessia), ritmo da batida de asa em ms]
const GAIVOTAS = [
    [118, 9, 0.1, 420],
    [134, 7, 0.55, 520],
    [104, 11, 0.8, 380],
];
// margem fora da tela antes de a gaivota reaparecer do outro lado
const GAIVOTA_MARGEM = 12;

// Cintilado no reflexo do sol: pontinhos que acendem e apagam na coluna de
// luz da água (o sol de menu-fundo fica em x 150 e o horizonte em y 212).
const REFLEXO_X = 150;
const REFLEXO_TOPO = 218;
const REFLEXO_FUNDO = 330;
const CINTILADOS = 14;
// pseudoaleatório fixo: o mesmo desenho a cada vez
function sortear(i, k) {
    const h = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return h - Math.floor(h);
}

// Gaivota de 7×3 px: asas abertas ("v" raso) ou fechadas (traço).
function desenharGaivota(renderer, cor, x, y, asasAbertas) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (asasAbertas) {
        pintar(renderer, cor, px, py, 2, 1);
        pintar(renderer, cor, px + 2, py + 1, 1, 1);
        pintar(renderer, cor, px + 3, py + 2, 1, 1);
        pintar(renderer, cor, px + 4, py + 1, 1, 1);
        pintar(renderer, cor, px + 5, py, 2, 1);
    } else {
        pintar(renderer, cor, px, py + 2, 3, 1);
        pintar(renderer, cor, px + 3, py + 2, 1, 1);
        pintar(renderer, cor, px + 4, py + 2, 3, 1);
        pintar(renderer, cor, px + 3, py + 1, 1, 1);
    }
}

// Fundo do menu (no mundo, então os pós-efeitos passam por ele): a imagem,
// as gaivotas e o logo flutuando.
class FundoMenu extends Renderable {
    constructor() {
        super(0, 0, CONFIG.largura, CONFIG.altura);
        this.anchorPoint.set(0, 0);
        this.floating = true;
        this.alwaysUpdate = true;
        this.tempo = 0;
    }

    update(dt) {
        this.tempo += dt;
        return true;
    }

    draw(renderer) {
        const { jogo } = dadosDoEstilo();
        const t = this.tempo;
        renderer.setGlobalAlpha(1);
        renderer.drawImage(loader.getImage(imagem("menu-fundo")), 0, 0);

        const percurso = CONFIG.largura + GAIVOTA_MARGEM * 2;
        for (const [y, velocidade, fase, ritmo] of GAIVOTAS) {
            const x = ((fase * percurso + (t / 1000) * velocidade) % percurso) - GAIVOTA_MARGEM;
            const balanco = Math.sin(t / 900 + fase * 6) * 1.5;
            desenharGaivota(renderer, jogo.escuridao, x, y + balanco, Math.floor(t / ritmo) % 2 === 0);
        }

        // a coluna de luz alarga para baixo, como o reflexo da imagem
        for (let i = 0; i < CINTILADOS; i++) {
            const fundo = sortear(i, 1);
            const y = REFLEXO_TOPO + fundo * (REFLEXO_FUNDO - REFLEXO_TOPO);
            const meiaLargura = 8 + fundo * 22;
            const x = REFLEXO_X + (sortear(i, 2) * 2 - 1) * meiaLargura;
            const brilho = Math.sin(t / (380 + sortear(i, 3) * 400) + sortear(i, 4) * 6.28);
            if (brilho > 0.55) {
                pintar(renderer, jogo.chama, x, y, 2, 1, (brilho - 0.55) * 2);
            }
        }

        const logo = loader.getImage(imagem("logo"));
        const flutua = Math.round(Math.sin((t / LOGO_PERIODO) * Math.PI * 2) * LOGO_AMPLITUDE);
        renderer.drawImage(logo, Math.round((CONFIG.largura - logo.width) / 2), LOGO_Y + flutua);
    }
}

// Tela dos créditos: painel com as linhas de CREDITOS e o botão Voltar.
class Creditos {
    constructor(aoVoltar) {
        this.painel = new Painel();
        this.linhas = CREDITOS.map((c) => ({ ...c, rotulo: new Rotulo(c.texto, c.titulo ? 2 : 1) }));
        this.lista = new Lista([new Botao("Voltar", aoVoltar)], { aoVoltar });
        this.x = Math.round((CONFIG.largura - CREDITOS_LARGURA) / 2);
        this.y = Math.round(PAINEL_Y - CREDITOS_ALTURA / 2);
        this.lista.posicionar(CONFIG.largura / 2, this.y + CREDITOS_BOTAO_Y, 0);
    }

    desenhar(renderer) {
        const { jogo } = dadosDoEstilo();
        this.painel.desenhar(renderer, this.x, this.y, CREDITOS_LARGURA, CREDITOS_ALTURA, 0.94);
        let y = this.y + CREDITOS_TOPO;
        for (const linha of this.linhas) {
            linha.rotulo.desenhar(renderer, CONFIG.largura / 2, y, {
                cor: linha.titulo ? jogo.destaque : jogo.texto,
                alinhamento: "centro",
            });
            y += linha.titulo ? CREDITOS_DEPOIS_DO_TITULO : CREDITOS_LINHA;
        }
        this.lista.desenhar(renderer);
    }

    destroy() {
        this.painel.destroy();
        for (const linha of this.linhas) {
            linha.rotulo.destroy();
        }
        this.lista.destroy();
    }
}

// Quebra o texto em linhas que cabem em `largura` px, medindo com o próprio
// Rotulo da fonte do jogo (uma palavra maior que a largura fica sozinha).
function quebrarEmLinhas(medidor, texto, largura) {
    const linhas = [];
    let atual = "";
    for (const palavra of texto.split(" ")) {
        const tentativa = atual === "" ? palavra : `${atual} ${palavra}`;
        medidor.texto = tentativa;
        if (atual !== "" && medidor.largura > largura) {
            linhas.push(atual);
            atual = palavra;
        } else {
            atual = tentativa;
        }
    }
    linhas.push(atual);
    return linhas;
}

// Tela do Como jogar: painel com o título, duas colunas (uma por fase, com
// subtítulo e as linhas alinhadas à esquerda) e o botão Voltar.
class ComoJogar {
    constructor(aoVoltar) {
        this.painel = new Painel();
        this.titulo = new Rotulo("Como jogar");
        this.lista = new Lista([new Botao("Voltar", aoVoltar)], { aoVoltar });
        this.x = Math.round((CONFIG.largura - COMO_LARGURA) / 2);
        this.y = COMO_TOPO;
        this.lista.posicionar(CONFIG.largura / 2, this.y + COMO_BOTAO_Y, 0);
        const medidor = new Rotulo("");
        this.colunas = COMO_JOGAR.map((coluna) => ({
            subtitulo: new Rotulo(coluna.titulo),
            itens: coluna.linhas.map((texto) =>
                quebrarEmLinhas(medidor, texto, COMO_COLUNA_LARGURA).map((linha) => new Rotulo(linha)),
            ),
        }));
        medidor.destroy();
    }

    desenhar(renderer) {
        const { jogo } = dadosDoEstilo();
        this.painel.desenhar(renderer, this.x, this.y, COMO_LARGURA, COMO_ALTURA, 0.94);
        this.titulo.desenhar(renderer, CONFIG.largura / 2, this.y + COMO_TITULO_Y, {
            cor: jogo.destaque,
            alinhamento: "centro",
        });
        this.colunas.forEach((coluna, i) => {
            const x = this.x + COMO_COLUNA_MARGEM + i * COMO_COLUNA_PASSO;
            coluna.subtitulo.desenhar(renderer, x, this.y + COMO_SUBTITULO_Y, { cor: jogo.destaque });
            let y = this.y + COMO_LINHAS_Y;
            for (const item of coluna.itens) {
                for (const linha of item) {
                    linha.desenhar(renderer, x, y, { cor: jogo.texto });
                    y += COMO_LINHA;
                }
                y += COMO_ENTRE_ITENS;
            }
        });
        this.lista.desenhar(renderer);
    }

    destroy() {
        this.painel.destroy();
        this.titulo.destroy();
        for (const coluna of this.colunas) {
            coluna.subtitulo.destroy();
            for (const linha of coluna.itens.flat()) {
                linha.destroy();
            }
        }
        this.lista.destroy();
    }
}

export class MenuStage extends Stage {
    constructor() {
        super();
        this.app = null;
        // "menu", "comoJogar", "opcoes" ou "creditos"
        this.tela = "menu";
        this.saindo = false;
        this.menu = null;
        this.opcoes = null;
        this.creditos = null;
        this.comoJogar = null;
    }

    onResetEvent(app) {
        this.app = app;
        this.tela = "menu";
        this.saindo = false;
        aplicarPosEfeitos(app);
        app.world.addChild(new FundoMenu(), 1);

        this.menu = new Lista([
            new Botao("Jogar", () => this.jogar()),
            new Botao("Como jogar", () => this.mostrar("comoJogar")),
            new Botao("Opções", () => this.mostrar("opcoes")),
            new Botao("Créditos", () => this.mostrar("creditos")),
        ]);
        this.menu.posicionar(CONFIG.largura / 2, MENU_Y, MENU_ESPACO);
        this.opcoes = new PainelOpcoes(app, { aoVoltar: () => this.mostrar("menu", 2) });
        this.opcoes.posicionar(CONFIG.largura / 2, PAINEL_Y);
        this.creditos = new Creditos(() => this.mostrar("menu", 3));
        this.comoJogar = new ComoJogar(() => this.mostrar("menu", 1));

        empilhar(this);
        tocarMusica("menu");
    }

    onDestroyEvent() {
        remover(this);
        this.menu?.destroy();
        this.opcoes?.destroy();
        this.creditos?.destroy();
        this.comoJogar?.destroy();
        this.comoJogar = null;
        this.menu = null;
        this.opcoes = null;
        this.creditos = null;
    }

    jogar() {
        // durante o fade de saída o menu não responde mais
        this.saindo = true;
        novaPartida();
        irParaEtapa("fase1");
    }

    // Troca a tela interna; `foco` é o botão do menu que fica selecionado
    // ao voltar (o da tela de onde se veio).
    mostrar(tela, foco = 0) {
        this.tela = tela;
        if (tela === "menu") {
            this.menu.focar(foco);
        } else if (tela === "opcoes") {
            this.opcoes.abrir();
        }
    }

    // receptor de src/ui/entrada.js: repassa para a tela atual
    receptor() {
        if (this.tela === "opcoes") {
            return this.opcoes.lista;
        }
        if (this.tela === "creditos") {
            return this.creditos.lista;
        }
        if (this.tela === "comoJogar") {
            return this.comoJogar.lista;
        }
        return this.menu;
    }

    teclar(codigo, repeticao) {
        if (!this.saindo) {
            this.receptor().teclar(codigo, repeticao);
        }
    }

    moverPonteiro(x, y) {
        if (!this.saindo) {
            this.receptor().moverPonteiro(x, y);
        }
    }

    apertarPonteiro(x, y) {
        if (!this.saindo) {
            this.receptor().apertarPonteiro(x, y);
        }
    }

    soltarPonteiro(x, y) {
        if (!this.saindo) {
            this.receptor().soltarPonteiro(x, y);
        }
    }

    draw(renderer, world) {
        super.draw(renderer, world);
        if (this.menu === null) {
            return;
        }
        desenharNaTela(this, renderer, (r) => {
            if (this.tela === "opcoes") {
                this.opcoes.desenhar(r);
            } else if (this.tela === "creditos") {
                this.creditos.desenhar(r);
            } else if (this.tela === "comoJogar") {
                this.comoJogar.desenhar(r);
            } else {
                this.menu.desenhar(r);
            }
        });
    }
}
