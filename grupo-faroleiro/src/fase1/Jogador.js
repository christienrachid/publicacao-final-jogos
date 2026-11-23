import { FadeEffect, input, loader, Renderable, Vector2d } from "melonjs";
import { pintar } from "../entities/folha.js";
import { registrarBrilho, removerBrilho } from "../systems/brilhos.js";
import { dadosDoEstilo, imagem } from "../systems/estilo.js";
import { emitirPoeira } from "../systems/particulas.js";
import { partida } from "../systems/partida.js";
import { efeito } from "../systems/som.js";
import { ponteiro } from "../ui/entrada.js";
import { Rotulo } from "../ui/texto.js";
import { FASE1 } from "./config.js";
import { criarCorpo, moverCorpo } from "./fisica.js";
import { Lanterna } from "./lanterna.js";

// O faroleiro: plataforma com aceleração,
// pulo variável, coyote time e buffer de pulo, descida dos andaimes com ↓,
// mira com o mouse (olha para o lado do mouse e anda de costas mais devagar),
// lanterna na mão (lanterna.js), recarga na porta da casa, 5 corações,
// dano com empurrão e invencibilidade piscando, morte definitiva (a derrota
// vem da Fase1Stage depois da animação e da escuridão).
//
// Desenho: jogador-<estilo>.png (quadros de 24×24) e o braço
// jogador-braco-<estilo>.png girando no ombro, espelhado para a esquerda.
//
// API para os monstros e as cenas (tarefas 7 e 9):
//   jogador.levarDano(qtd, origem)   origem = { x, y } (empurrão para longe dela)
//   jogador.centro()                 { x, y } do meio do corpo
//   jogador.caixa()                  { x, y, largura, altura } de colisão
//   jogador.vivo, jogador.vida, jogador.vidaMaxima
//   jogador.travado = true           ignora teclas e mouse (cenas); a física segue
//   jogador.lanterna                 a Lanterna (lanterna.js)
//   jogador.morteAdiada              a morte acabou: a stage abre a derrota

const QUADRO = 24;
const COLUNAS = 8;
// ombro (onde o ponto (2, 3) do braço fica preso) em cada quadro: a tabela
// OMBRO_POR_QUADRO de tools/gerar-personagens.mjs (o jogo não importa os
// geradores, então ela está copiada aqui)
const OMBRO = [
    [11, 15], [11, 16], [11, 15], [11, 16], [11, 15], [11, 15], [11, 16], [11, 15],
    [11, 14], [11, 15], [10, 15], [11, 17], [11, 18], [11, 19], [11, 19], [11, 15],
];
// braço: 16×8, ombro em (2, 3), boca da lanterna em (15, 3); giramos em
// volta do meio do pixel
const BRACO_OMBRO_X = 2.5;
const BRACO_OMBRO_Y = 3.5;
const BRACO_COMPRIMENTO = 13;

// animações: quadros e ms por quadro
const ANIMACOES = {
    parado: { quadros: [0, 1], ms: 520 },
    andar: { quadros: [2, 3, 4, 5, 6, 7], ms: 95 },
    subir: { quadros: [8], ms: 1000 },
    cair: { quadros: [9], ms: 1000 },
    dano: { quadros: [10], ms: 1000 },
    morte: { quadros: [11, 12, 13, 14], ms: 170, umaVez: true },
};

// teclas de jogo: [código, ação]
const K = input.KEY;
const TECLAS = [
    [K.A, "esquerda"],
    [K.LEFT, "esquerda"],
    [K.D, "direita"],
    [K.RIGHT, "direita"],
    [K.W, "pular"],
    [K.UP, "pular"],
    [K.SPACE, "pular"],
    [K.S, "descer"],
    [K.DOWN, "descer"],
    [K.E, "recarregar"],
];

export function ligarTeclasDoJogador() {
    for (const [codigo, acao] of TECLAS) {
        input.bindKey(codigo, acao, false, true);
    }
}

export function desligarTeclasDoJogador() {
    for (const [codigo] of TECLAS) {
        input.unbindKey(codigo);
    }
}

function aproximar(atual, alvo, passo) {
    if (atual < alvo) {
        return Math.min(alvo, atual + passo);
    }
    return Math.max(alvo, atual - passo);
}

export class Jogador extends Renderable {
    // mapa: MapaDaIlha; inicio: { x, y } dos pés; porta: { x, y } da porta
    constructor(mapa, inicio, porta) {
        const c = FASE1.jogador;
        super(0, 0, QUADRO, QUADRO);
        this.anchorPoint.set(0, 0);
        this.alwaysUpdate = true;
        this.mapa = mapa;
        this.porta = porta;
        this.corpo = criarCorpo(inicio.x - c.largura / 2, inicio.y - c.altura, c.largura, c.altura);
        this.limites = { esquerdo: mapa.limiteEsquerdo, direito: mapa.limiteDireito };
        this.lanterna = new Lanterna(mapa);

        this.vidaMaxima = FASE1.vida.coracoes;
        this.vida = this.vidaMaxima;
        this.vivo = true;
        this.travado = false;
        // olhando para a direita (1) ou para a esquerda (-1)
        this.olhando = 1;
        this.anguloDaMira = 0;
        this.mira = new Vector2d();

        // tempos (s)
        this.coyote = 0;
        this.bufferDoPulo = 0;
        this.subindoComPulo = false;
        this.invencivel = 0;
        this.tempoDeDano = 0;
        this.tempoMorto = 0;
        // true quando a morte já acabou (animação e escuridão) e falta só a
        // Fase1Stage abrir a derrota, o que ela faz com o jogo rodando
        this.morteAdiada = false;
        this.recarga = 0;

        // teclas do quadro anterior (para "acabou de apertar")
        this.pularAntes = false;
        this.botaoAntes = false;
        // o botão do mouse precisa ser solto antes de valer (pausa, início)
        this.botaoTravado = true;

        // animação
        this.animacao = "parado";
        this.tempoDaAnimacao = 0;
        this.quadro = 0;
        this.deCostas = false;
        this.andado = 0;
        this.quedaAntes = 0;
        this.noChaoAntes = true;
        this.cortina = null;
        this.dica = new Rotulo("E");
        this.atualizarPosicao();
    }

    onActivateEvent() {
        registrarBrilho(this);
    }

    onDeactivateEvent() {
        removerBrilho(this);
    }

    // ---- consultas --------------------------------------------------------

    centro() {
        const c = this.corpo;
        return { x: c.x + c.largura / 2, y: c.y + c.altura / 2 };
    }

    pes() {
        const c = this.corpo;
        return { x: c.x + c.largura / 2, y: c.y + c.altura };
    }

    caixa() {
        const c = this.corpo;
        return { x: c.x, y: c.y, largura: c.largura, altura: c.altura };
    }

    get noChao() {
        return this.corpo.noChao;
    }

    // perto da porta da casa e no chão dela
    pertoDaPorta() {
        const p = this.pes();
        return Math.abs(p.x - this.porta.x) <= FASE1.lanterna.distanciaDaPorta && Math.abs(p.y - this.porta.y) < 2 && this.corpo.noChao;
    }

    // ---- vida ---------------------------------------------------------------

    levarDano(quantidade = 1, origem = null) {
        if (!this.vivo || this.invencivel > 0 || partida.invencivel) {
            return false;
        }
        const v = FASE1.vida;
        this.vida = Math.max(0, this.vida - quantidade);
        const meio = this.centro();
        const lado = origem ? Math.sign(meio.x - origem.x) || -this.olhando : -this.olhando;
        this.corpo.vx = lado * v.empurraoX;
        this.corpo.vy = -v.empurraoY;
        this.subindoComPulo = false;
        this.tempoDeDano = v.tempoDeDano;
        this.invencivel = v.invencivel;
        this.recarga = 0;
        this.parentApp?.viewport.shake(2, 160);
        if (this.vida <= 0) {
            this.morrer();
        } else {
            efeito("dano");
        }
        return true;
    }

    morrer() {
        this.vivo = false;
        this.tempoMorto = 0;
        this.corpo.vx = 0;
        partida.estatisticas.quedas += 1;
        efeito("morte");
        this.trocarAnimacao("morte");
    }

    // Cura (coração solto por monstro), sem passar da vida máxima.
    curar(quantidade = 1) {
        if (!this.vivo) {
            return;
        }
        this.vida = Math.min(this.vidaMaxima, this.vida + quantidade);
        efeito("coleta");
    }

    // cortina preta da morte (persistente: segura a tela até a derrota; a
    // stage a tira ao sair da fase)
    escurecer(camera) {
        if (this.cortina !== null) {
            return;
        }
        this.cortina = new FadeEffect(camera, { color: "#000000", duration: FASE1.vida.escurecer * 1000, direction: "in" });
        this.cortina.isPersistent = true;
        camera.addCameraEffect(this.cortina);
    }

    // ---- quadro a quadro (chamado pela Fase1Stage fora da pausa) -----------

    atualizar(dtMs) {
        const dt = Math.min(dtMs, 50) / 1000;
        const c = FASE1.jogador;
        const camera = this.parentApp.viewport;
        this.invencivel = Math.max(0, this.invencivel - dt);
        this.tempoDeDano = Math.max(0, this.tempoDeDano - dt);

        const controla = this.vivo && !this.travado;
        const esquerda = controla && input.isKeyPressed("esquerda");
        const direita = controla && input.isKeyPressed("direita");
        const pular = controla && input.isKeyPressed("pular");
        const descer = controla && input.isKeyPressed("descer");
        const recarregar = controla && input.isKeyPressed("recarregar");
        if (!ponteiro.apertado) {
            this.botaoTravado = false;
        }
        const botao = controla && ponteiro.apertado && !this.botaoTravado;

        // mira: o mouse em pixels do mundo
        this.atualizarMira(camera, controla);

        // andar (de costas mais devagar)
        const corpo = this.corpo;
        const direcao = (direita ? 1 : 0) - (esquerda ? 1 : 0);
        this.deCostas = direcao !== 0 && direcao !== this.olhando;
        const alvo = direcao * c.velocidade * (this.deCostas ? c.fatorDeCostas : 1);
        let aceleracao;
        if (corpo.noChao) {
            aceleracao = direcao !== 0 ? c.aceleracaoChao : c.freioChao;
        } else {
            aceleracao = direcao !== 0 ? c.aceleracaoAr : c.freioAr;
        }
        // durante o empurrão do dano o controle volta aos poucos
        if (this.tempoDeDano > 0) {
            aceleracao *= 0.25;
        }
        corpo.vx = aproximar(corpo.vx, alvo, aceleracao * dt);

        // pulo: coyote time, buffer e pulo variável
        this.coyote = corpo.noChao ? c.coyote : Math.max(0, this.coyote - dt);
        if (pular && !this.pularAntes) {
            this.bufferDoPulo = c.bufferDoPulo;
        } else {
            this.bufferDoPulo = Math.max(0, this.bufferDoPulo - dt);
        }
        if (this.bufferDoPulo > 0 && this.coyote > 0) {
            corpo.vy = -c.pulo;
            this.bufferDoPulo = 0;
            this.coyote = 0;
            this.subindoComPulo = true;
            efeito("pulo");
        }
        if (this.subindoComPulo && (!pular || corpo.vy >= 0)) {
            if (corpo.vy < 0) {
                corpo.vy *= c.corteDoPulo;
            }
            this.subindoComPulo = false;
        }
        this.pularAntes = pular;

        // descer do andaime
        if (descer && corpo.noChao && corpo.naTabua) {
            corpo.atravessar = c.descerDoAndaime;
            corpo.noChao = false;
            this.coyote = 0;
        }

        // gravidade e movimento
        corpo.vy = Math.min(c.quedaMaxima, corpo.vy + (corpo.vy < 0 ? c.gravidade : c.gravidadeCaindo) * dt);
        const xAntes = corpo.x;
        const vyAntes = corpo.vy;
        moverCorpo(corpo, dt, this.mapa, this.limites);

        // poeira e passos
        const pes = this.pes();
        if (corpo.noChao && !this.noChaoAntes && vyAntes > c.quedaComPoeira) {
            emitirPoeira(pes.x - 3, pes.y);
            emitirPoeira(pes.x + 3, pes.y);
            efeito("passo");
        }
        if (corpo.noChao && Math.abs(corpo.vx) > 20) {
            this.andado += Math.abs(corpo.x - xAntes);
            if (this.andado >= c.passoPoeira) {
                this.andado = 0;
                emitirPoeira(pes.x - Math.sign(corpo.vx) * 4, pes.y);
                efeito("passo");
            }
        } else {
            this.andado = c.passoPoeira * 0.6;
        }
        this.noChaoAntes = corpo.noChao;

        // recarga na porta da casa
        this.atualizarRecarga(dt, recarregar);

        // lanterna
        const querLigar = botao && this.recarga <= 0;
        this.lanterna.atualizar(dt, querLigar, botao && !this.botaoAntes);
        this.botaoAntes = botao;

        // morte: a tela escurece e, no fim, a morte fica pronta para a stage
        // mostrar a derrota (quando o jogo estiver rodando de novo)
        if (!this.vivo) {
            this.tempoMorto += dt;
            const v = FASE1.vida;
            if (this.tempoMorto >= v.tempoDaMorte) {
                this.escurecer(camera);
            }
            if (this.tempoMorto >= v.tempoAteDerrota) {
                this.morteAdiada = true;
            }
        }

        this.escolherAnimacao();
        this.avancarAnimacao(dtMs);
        this.atualizarPosicao();
    }

    atualizarMira(camera, controla) {
        const ombro = this.ombro();
        if (controla && ponteiro.x >= 0) {
            camera.localToWorld(ponteiro.x, ponteiro.y, this.mira);
            const dx = this.mira.x - ombro.x;
            if (Math.abs(dx) > 1) {
                this.olhando = dx < 0 ? -1 : 1;
            }
            this.anguloDaMira = Math.atan2(this.mira.y - ombro.y, this.mira.x - ombro.x);
        } else if (!controla && this.vivo) {
            // parado nas cenas: aponta para a frente
            this.anguloDaMira = this.olhando > 0 ? 0 : Math.PI;
        }
        const boca = this.boca();
        this.lanterna.apontar(boca.x, boca.y, this.anguloDaMira);
    }

    // Segurando E na porta, a bateria enche aos poucos (cheia em
    // tempoDeRecarga s). Soltar no meio guarda o que já carregou, para dar
    // para fugir de um monstro e voltar depois. this.recarga é a fração da
    // bateria enquanto carrega (barra sobre a cabeça); 0 quando não carrega.
    atualizarRecarga(dt, segurandoE) {
        const lanterna = this.lanterna;
        if (segurandoE && this.pertoDaPorta() && lanterna.bateria < lanterna.bateriaMaxima) {
            lanterna.bateria = Math.min(
                lanterna.bateriaMaxima,
                lanterna.bateria + (lanterna.bateriaMaxima * dt) / FASE1.lanterna.tempoDeRecarga,
            );
            this.recarga = lanterna.bateria / lanterna.bateriaMaxima;
            if (lanterna.bateria >= lanterna.bateriaMaxima) {
                efeito("recarga");
            }
        } else {
            this.recarga = 0;
        }
    }

    // ---- animação -----------------------------------------------------------

    trocarAnimacao(nome) {
        if (this.animacao !== nome) {
            this.animacao = nome;
            this.tempoDaAnimacao = 0;
        }
    }

    escolherAnimacao() {
        if (!this.vivo) {
            this.trocarAnimacao("morte");
            return;
        }
        const corpo = this.corpo;
        if (this.tempoDeDano > 0) {
            this.trocarAnimacao("dano");
        } else if (!corpo.noChao) {
            this.trocarAnimacao(corpo.vy < 0 ? "subir" : "cair");
        } else if (Math.abs(corpo.vx) > 12) {
            this.trocarAnimacao("andar");
        } else {
            this.trocarAnimacao("parado");
        }
    }

    avancarAnimacao(dtMs) {
        const anim = ANIMACOES[this.animacao];
        // andando, a animação acompanha a velocidade
        const ritmo = this.animacao === "andar" ? Math.min(1.2, Math.abs(this.corpo.vx) / FASE1.jogador.velocidade + 0.15) : 1;
        this.tempoDaAnimacao += dtMs * ritmo;
        let i = Math.floor(this.tempoDaAnimacao / anim.ms);
        if (anim.umaVez) {
            i = Math.min(i, anim.quadros.length - 1);
        } else {
            i %= anim.quadros.length;
        }
        // de costas, a passada vai ao contrário
        if (this.animacao === "andar" && this.deCostas) {
            i = anim.quadros.length - 1 - i;
        }
        this.quadro = anim.quadros[i];
    }

    // ---- desenho ------------------------------------------------------------

    // canto do quadro de 24×24 (pés na linha 23, centrado no corpo)
    cantoDoQuadro() {
        const p = this.pes();
        return { x: Math.round(p.x - QUADRO / 2), y: Math.round(p.y - QUADRO) };
    }

    atualizarPosicao() {
        const canto = this.cantoDoQuadro();
        this.pos.set(canto.x, canto.y, this.pos.z);
    }

    // ombro em pixels do mundo (meio do pixel), espelhado para a esquerda
    ombro() {
        const canto = this.cantoDoQuadro();
        const [ox, oy] = OMBRO[this.quadro] ?? OMBRO[0];
        const x = this.olhando > 0 ? ox + 0.5 : QUADRO - ox - 0.5;
        return { x: canto.x + x, y: canto.y + oy + 0.5 };
    }

    // boca da lanterna em pixels do mundo
    boca() {
        const o = this.ombro();
        return {
            x: o.x + Math.cos(this.anguloDaMira) * BRACO_COMPRIMENTO,
            y: o.y + Math.sin(this.anguloDaMira) * BRACO_COMPRIMENTO,
        };
    }

    update() {
        return true;
    }

    draw(renderer) {
        // piscando enquanto invencível
        if (this.vivo && this.invencivel > 0 && Math.floor(this.invencivel / FASE1.vida.piscar) % 2 === 1) {
            return;
        }
        const canto = this.cantoDoQuadro();
        const corpo = loader.getImage(imagem("jogador"));
        const sx = (this.quadro % COLUNAS) * QUADRO;
        const sy = Math.floor(this.quadro / COLUNAS) * QUADRO;
        renderer.save();
        if (this.olhando < 0) {
            renderer.translate(canto.x + QUADRO, canto.y);
            renderer.scale(-1, 1);
            renderer.drawImage(corpo, sx, sy, QUADRO, QUADRO, 0, 0, QUADRO, QUADRO);
        } else {
            renderer.drawImage(corpo, sx, sy, QUADRO, QUADRO, canto.x, canto.y, QUADRO, QUADRO);
        }
        renderer.restore();

        // braço com a lanterna (não na morte)
        if (this.animacao !== "morte") {
            const o = this.ombro();
            renderer.save();
            renderer.translate(o.x, o.y);
            renderer.rotate(this.anguloDaMira);
            if (this.olhando < 0) {
                renderer.scale(1, -1);
            }
            renderer.drawImage(loader.getImage(imagem("jogador-braco")), -BRACO_OMBRO_X, -BRACO_OMBRO_Y);
            renderer.restore();
        }
    }

    // por cima da escuridão: a barra da recarga e a dica da tecla E
    desenharBrilho(renderer) {
        if (!this.vivo) {
            return;
        }
        const { jogo } = dadosDoEstilo();
        const canto = this.cantoDoQuadro();
        const x = canto.x + 2;
        const y = canto.y - 6;
        if (this.recarga > 0) {
            pintar(renderer, jogo.escuridao, x - 1, y - 1, 22, 5, 0.8);
            pintar(renderer, jogo.textoFraco, x, y, 20, 3, 0.5);
            pintar(renderer, jogo.destaque, x, y, Math.round(20 * this.recarga), 3);
        } else if (!this.travado && this.pertoDaPorta() && this.lanterna.bateria < this.lanterna.bateriaMaxima) {
            this.dica.desenhar(renderer, canto.x + QUADRO / 2, canto.y - 12, { cor: jogo.destaque, alinhamento: "centro" });
        }
    }

    destroy() {
        this.lanterna.destroy();
        this.dica.destroy();
        super.destroy();
    }
}