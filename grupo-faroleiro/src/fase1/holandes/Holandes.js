import { Renderable } from "melonjs";
import { CONFIG } from "../../config.js";
import { pintar } from "../../entities/folha.js";
import { registrarBrilho, removerBrilho } from "../../systems/brilhos.js";
import { dadosDoEstilo } from "../../systems/estilo.js";
import { emitirEstrelinhas } from "../../systems/particulas.js";
import { partida } from "../../systems/partida.js";
import { relogio } from "../../systems/relogio.js";
import { efeito } from "../../systems/som.js";
import { BarraDeVida } from "../../ui/barra.js";
import { desenharIcone, ICONE } from "../../ui/Hud.js";
import { seguirNaArea } from "../camera.js";
import { FASE1, HOLANDES } from "../config.js";
import { coresDoJogoFase1 } from "../cores.js";
import { desenharSeta } from "../itens/Itens.js";
import { lanternaAtual, registrarAlvoDaLuz } from "../lanterna.js";
import { lerVista } from "../vista.js";
import { Balas } from "./Balas.js";
import { coresDoHolandes } from "./cores.js";
import { brilho, Efeitos, retangulo } from "./efeitos.js";
import { Navio } from "./Navio.js";
import { chaoDoTerreno, Nevoa } from "./Nevoa.js";
import { Pirata } from "./Pirata.js";

// O Holandês Voador, chefe da Fase 1 das 22h às 23h (valores em HOLANDES de
// src/fase1/config.js).
//
// O "morro" é o topo da ilha com a casa e a torre: x do ponto Torre do mapa
// e y do chão ali (morro()). A luta é no morro e nas encostas.
//
// Entrada ("chegando"): aviso e rugido, a câmera se afasta (zoom 1) para a
// área fixa do morro (HOLANDES.area), a névoa verde sobe e o navio sai do
// mar ao fundo, no horizonte, pequeno e translúcido, e sobe em arco,
// crescendo, até a ponta esquerda do vaivém, no ar sobre o morro.
//
// Luta ("lutando"): o navio flutua sobre o morro, com a quilha rente ao alto
// da torre (alturaSobreATorre), indo e voltando (vaivém senoidal em volta
// do x do morro) e balançando, com uma sombra fraca no chão. Os pontos
// fracos são as 3 lanternas verdes dos mastros (alvos da lanterna com
// chefe = true, alcance 260): cada uma apagada sobe a etapa e avaria o navio.
//   etapa 1  rajadas de 3 balas (Balas.js), com o X no chão 1 s antes
//   etapa 2  + ondas de 2 ou 3 piratas pela prancha de luz (Pirata.js)
//   etapa 3  rajadas de 5, piratas e a névoa densa, que gasta a bateria 2×
// Balas e piratas ficam em volta do morro (alvoMinimoX a alvoMaximoX): com
// o jogador longe (nas praias), a vista segue ele, a seta da borda aponta o
// navio e nada o fere de longe.
//
// Fim ("afundando" → "vencido"): o navio inclina, perde altura e cai no mar
// ao fundo (encolhe e some atrás do horizonte), com explosões, espuma e
// bolhas, o relógio para e a lente é lançada ao chão perto da torre
// (itens.surgirPecaEm). Pegar a lente é com a fase (Fase1Stage.coletarLente).
// Se der 23h com o navio inteiro, a fase chama a derrota "O Holandês escapou".
//
// A Fase1Stage cria um Holandês novo em iniciarHolandes() (o "Tentar de
// novo" volta às 22h com tudo zerado), põe a camada no mundo e chama
// atualizar(s) fora da pausa e das cenas, e desenharHud na tela.

const ICONE_LENTE = HOLANDES.lente.icone;

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

function suave(t) {
    return t * t * (3 - 2 * t);
}

// Uma lanterna verde do mastro: alvo da lanterna do jogador.
class LanternaVerde {
    constructor(holandes, indice, ponto) {
        this.holandes = holandes;
        this.indice = indice;
        this.fx = ponto.x;
        this.fy = ponto.y;
        this.x = 0;
        this.y = 0;
        this.vidaMaxima = HOLANDES.vidaDaLanterna;
        this.vida = this.vidaMaxima;
        this.apagada = false;
        // > 0 enquanto leva luz (pisca e solta faíscas)
        this.iluminado = 0;
        this.proximaFaisca = 0;
        // alcance de chefe (FASE1.lanterna.alcanceChefe)
        this.chefe = true;
    }

    pontoParaLuz() {
        return !this.apagada && this.holandes.estado === "lutando" ? this : null;
    }

    // Com mais de uma no cone, só a mais perto do meio dele leva luz: cada
    // lanterna apagada é uma etapa, sem pular etapas de uma vez.
    levarLuz(dano, lanterna) {
        if (this.apagada || this.holandes.estado !== "lutando" || (lanterna && this.holandes.lanternaNaMira(lanterna) !== this)) {
            return;
        }
        this.vida = Math.max(0, this.vida - dano);
        this.iluminado = 0.12;
        if (this.vida <= 0) {
            this.holandes.apagar(this);
        }
    }
}

export class Holandes {
    // fase: a Fase1Stage (mapa, jogador, diretor, itens, avisar, app)
    constructor(fase) {
        this.fase = fase;
        this.mapa = fase.mapa;
        const torre = this.mapa.ponto("Torre");
        if (torre === null) {
            throw new Error('Holandês: o mapa não tem o ponto "Torre"');
        }
        // o morro: x da torre (no meio dele) e o chão onde ela fica
        this.torreX = torre.x;
        this.morroX = torre.x;
        this.morroY = torre.y;
        this.amplitude = HOLANDES.vaivem.amplitude;
        // y do apoio do navio (a quilha) no ar, sem o balanço
        this.alturaDeVoo = torre.y - HOLANDES.alturaDaTorre - HOLANDES.alturaSobreATorre;
        // área fixa da câmera (px do mundo), centrada no morro
        const a = HOLANDES.area;
        this.area = { x: this.morroX - a.largura / 2, y: this.morroY - a.acimaDoMorro, largura: a.largura, altura: a.altura };
        // faixa de x das balas e dos piratas
        this.alvoMinimoX = this.morroX + HOLANDES.alvoMinimoX;
        this.alvoMaximoX = this.morroX + HOLANDES.alvoMaximoX;

        // "chegando", "lutando", "afundando" ou "vencido"
        this.estado = "chegando";
        this.etapa = 1;
        this.t = 0;
        this.tempo = 0;
        // fase do vaivém (rad): começa na ponta esquerda, onde a chegada para
        this.vaivem = -Math.PI / 2;
        this.proximaRajada = HOLANDES.esperaInicial;
        this.proximaOnda = Infinity;
        this.avisoDasLanternas = Infinity;
        this.prancha = null;
        this.lente = null;
        this.lenteLancada = false;
        this.claroes = [];
        this.proximaExplosao = 0;
        this.proximaBolha = 0;
        this.inicioDoNaufragio = { angulo: 0, x: 0, y: 0, xFim: 0 };

        this.navio = new Navio();
        this.navio.x = this.morroX - this.amplitude - HOLANDES.chegadaDeLado;
        this.navio.y = this.alturaDeVoo;
        this.navio.naAgua = true;
        this.lanternas = HOLANDES.lanternas.map((p, i) => new LanternaVerde(this, i, p));
        this.cancelarAlvos = this.lanternas.map((l) => registrarAlvoDaLuz(l));
        this.balas = new Balas(this);
        this.nevoa = new Nevoa(this.mapa, this.morroX);
        this.efeitos = new Efeitos();
        this.barra = new BarraDeVida({ largura: HOLANDES.barraLargura, altura: HOLANDES.barraAltura, rotulo: "Holandês Voador" });
        this.barra.definir(0);
        this.barra.rastro = 0;
        this.camada = new CamadaHolandes(this);
    }

    get derrotado() {
        return this.estado === "afundando" || this.estado === "vencido";
    }

    get apagadas() {
        return this.lanternas.filter((l) => l.apagada).length;
    }

    // Começa a entrada: aviso, rugido, câmera, névoa e a bateria cheia.
    iniciar() {
        this.fase.avisar(HOLANDES.avisos.entrada);
        efeito("rugido");
        this.fase.app.viewport.shake(2, 600);
        this.nevoa.alvo = 1;
        // o cone desenhado acompanha o alcance de chefe: o jogador vê até onde acerta
        this.fase.jogador.lanterna.modoChefe = true;
        this.fase.jogador.lanterna.encher();
        seguirNaArea(
            {
                zoom: 1,
                suavizar: HOLANDES.suavizarCamera,
                alvo: (jogador) => this.alvoDaCamera(jogador),
                // a área sobe além do alto do mapa
                topo: this.area.y,
            },
            HOLANDES.camera,
        );
    }

    // x do centro do morro e y do chão ali (px do mundo): onde a prancha de
    // luz chega e de onde o jogador mira as lanternas.
    morro() {
        return { x: this.morroX, y: this.morroY };
    }

    // Centro da vista no zoom 1 (a câmera ainda limita ao mapa, ao fundo do
    // mar e ao topo da área, ver camera.js). Na chegada, a vista vai para a
    // área do morro, onde quer que o jogador esteja. Na luta, a vista fica
    // parada na área e só sai dela para manter o jogador a cameraMargem px
    // das bordas: nas praias e no pé das encostas ela segue o jogador, e a
    // seta da borda (desenharSetaDoNavio) mostra o navio.
    alvoDaCamera(jogador) {
        const a = this.area;
        const cx = a.x + a.largura / 2;
        const cy = a.y + a.altura / 2;
        if (this.estado === "chegando") {
            return { x: cx, y: cy };
        }
        const p = jogador.pes();
        const m = HOLANDES.cameraMargem;
        const meiaLargura = CONFIG.largura / 2;
        const meiaAltura = CONFIG.altura / 2;
        const x = Math.min(p.x + meiaLargura - m.lados, Math.max(p.x - meiaLargura + m.lados, cx));
        const cabeca = p.y - FASE1.jogador.altura;
        const y = Math.min(cabeca + meiaAltura - m.cima, Math.max(p.y - meiaAltura + m.baixo, cy));
        return { x, y };
    }

    // y do horizonte (px do mundo) na vista atual, como o céu (ceu.js)
    horizonte() {
        const v = lerVista(this.fase.app.viewport);
        return FASE1.ceu.horizonteBase + FASE1.ceu.horizonteFator * (v.y + v.altura / 2);
    }

    // ---- quadro -------------------------------------------------------------

    // dt em segundos (só fora da pausa e das cenas)
    atualizar(dt) {
        this.tempo += dt;
        this.t += dt;
        this.navio.tempo = this.tempo;
        if (this.estado === "chegando") {
            this.atualizarChegada();
        } else if (this.estado === "lutando") {
            this.atualizarLuta(dt);
        } else if (this.estado === "afundando") {
            this.atualizarNaufragio(dt);
        }
        this.atualizarLanternas(dt);
        this.balas.atualizar(dt);
        this.nevoa.atualizar(dt);
        this.efeitos.atualizar(dt);
        this.atualizarLente(dt);
        for (const c of this.claroes) {
            c.t += dt;
        }
        this.claroes = this.claroes.filter((c) => c.t < 0.6);

        if (this.estado === "chegando") {
            this.barra.definir(Math.min(1, this.t / HOLANDES.chegada));
        } else {
            const total = this.lanternas.reduce((s, l) => s + l.vida, 0);
            this.barra.definir(total / (HOLANDES.vidaDaLanterna * this.lanternas.length));
        }
        this.barra.atualizar(dt * 1000);
    }

    // Sai do mar ao fundo (cortado no horizonte) e sobe em arco, crescendo:
    // de lado no começo, subindo no fim, até a ponta esquerda do vaivém,
    // longe da torre (nada fica atrás dela quando o corte da água sai).
    atualizarChegada() {
        const k = Math.min(1, this.t / HOLANDES.chegada);
        const e = 1 - (1 - k) * (1 - k);
        const navio = this.navio;
        const horizonte = this.horizonte();
        const xFim = this.morroX - this.amplitude;
        const xInicio = xFim - HOLANDES.chegadaDeLado;
        // a quilha começa um pouco abaixo do horizonte
        const yInicio = horizonte + 4;
        navio.escala = HOLANDES.escalaNoHorizonte + (1 - HOLANDES.escalaNoHorizonte) * e;
        navio.x = xInicio + (xFim - xInicio) * e;
        navio.y = yInicio + (this.alturaDeVoo - yInicio) * suave(k);
        navio.naAgua = true;
        navio.agua = horizonte;
        navio.angulo = 0;
        navio.alfa = HOLANDES.opacidade * Math.min(1, k * 1.6);
        navio.espuma = 1;
        if (k >= 1) {
            this.chegar();
        }
    }

    chegar() {
        this.estado = "lutando";
        this.t = 0;
        const navio = this.navio;
        navio.escala = 1;
        navio.alfa = HOLANDES.opacidade;
        navio.naAgua = false;
        efeito("respingo");
        this.fase.app.viewport.shake(2, 300);
        // gotas fantasmas caindo da quilha
        for (let i = 0; i < 6; i++) {
            this.efeitos.faiscas(sortear(navio.esquerda + 28, navio.direita - 28), navio.y - 2, 2, "fantasmaClaro");
        }
        this.avisoDasLanternas = HOLANDES.avisoDasLanternas;
    }

    // vai e vem sobre o morro (parado com a prancha aberta) e balança
    navegar(dt) {
        const navio = this.navio;
        if (this.prancha === null) {
            this.vaivem += dt * Math.PI * 2 * HOLANDES.vaivem.ciclo;
        }
        navio.x = this.morroX + this.amplitude * Math.sin(this.vaivem);
        navio.y = this.alturaDeVoo + Math.round(Math.sin(this.tempo * HOLANDES.ritmoDoBalanco) * HOLANDES.balanco);
        navio.angulo = Math.sin(this.tempo * HOLANDES.ritmoDoBalanco * 0.8 + 1) * HOLANDES.inclinacao;
    }

    atualizarLuta(dt) {
        this.navegar(dt);
        this.avisoDasLanternas -= dt;
        if (this.avisoDasLanternas <= 0) {
            this.avisoDasLanternas = Infinity;
            this.fase.avisar(HOLANDES.avisos.lanternas);
        }
        // rajadas de canhão
        this.proximaRajada -= dt;
        if (this.proximaRajada <= 0) {
            const r = HOLANDES.rajadas[this.etapa - 1];
            this.balas.rajada(r.balas);
            this.proximaRajada = sortear(r.intervalo[0], r.intervalo[1]) + (r.balas - 1) * HOLANDES.entreBalas + HOLANDES.aviso;
        }
        // piratas pela prancha
        if (this.etapa >= 2) {
            if (this.prancha === null) {
                this.proximaOnda -= dt;
                if (this.proximaOnda <= 0) {
                    this.abrirPrancha();
                }
            } else {
                this.atualizarPrancha(dt);
            }
        }
    }

    atualizarLanternas(dt) {
        for (const l of this.lanternas) {
            this.navio.pontoDoQuadro(l.fx, l.fy, l);
            l.iluminado = Math.max(0, l.iluminado - dt);
            if (l.iluminado > 0 && !l.apagada) {
                l.proximaFaisca -= dt;
                if (l.proximaFaisca <= 0) {
                    l.proximaFaisca = HOLANDES.faiscasNaLuz;
                    this.efeitos.faiscas(l.x, l.y, 3, Math.random() < 0.5 ? "fantasmaClaro" : "fogoClaro");
                }
            }
        }
    }

    // Lanterna apagada: fogo-fátuo, explosão, avaria e a próxima etapa.
    apagar(l) {
        l.apagada = true;
        l.iluminado = 0;
        this.navio.apagadas[l.indice] = true;
        efeito("explosao");
        this.fase.app.viewport.shake(HOLANDES.tremorAoApagar, HOLANDES.tremorAoApagarMs);
        this.efeitos.explodir(l.x, l.y, HOLANDES.fogoFatuo, ["fantasmaClaro", "fantasma"], { velocidade: [20, 75], duracao: [0.6, 1.1], subida: -25, lado: [1, 2] });
        this.claroes.push({ x: l.x, y: l.y, t: 0 });
        if (HOLANDES.encherBateriaAoApagar) {
            this.fase.jogador.lanterna.encher();
        }
        const apagadas = this.apagadas;
        if (apagadas >= this.lanternas.length) {
            this.afundar();
            return;
        }
        this.etapa = apagadas + 1;
        this.navio.quadro = Math.min(2, apagadas);
        if (this.etapa === 2) {
            this.fase.avisar(HOLANDES.avisos.etapa2);
            this.proximaOnda = HOLANDES.piratas.primeira;
        } else if (this.etapa === 3) {
            this.fase.avisar(HOLANDES.avisos.etapa3);
            this.nevoa.alvo = 2;
            const lanterna = lanternaAtual();
            if (lanterna !== null) {
                lanterna.multiplicadorGasto = HOLANDES.gastoNaNevoa;
            }
        }
    }

    // A lanterna acesa mais perto do meio do cone do jogador (ou null).
    lanternaNaMira(lanterna) {
        let melhor = null;
        let menor = Infinity;
        for (const l of this.lanternas) {
            if (l.apagada || !lanterna.dentroDoCone(l.x, l.y, FASE1.lanterna.alcanceChefe)) {
                continue;
            }
            let d = Math.atan2(l.y - lanterna.y, l.x - lanterna.x) - lanterna.angulo;
            d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
            if (d < menor) {
                menor = d;
                melhor = l;
            }
        }
        return melhor;
    }

    // ---- piratas e a prancha de luz ---------------------------------------

    conves() {
        const p = HOLANDES.prancha;
        return this.navio.pontoDoQuadro(p.convesX, p.convesY);
    }

    abrirPrancha() {
        const diretor = this.fase.diretor;
        const p = HOLANDES.piratas;
        const vagas = p.maximo - diretor.vivos("pirata");
        if (vagas <= 0) {
            // muitos vivos: tenta de novo daqui a pouco
            this.proximaOnda = 2;
            return;
        }
        const quantos = Math.min(vagas, p.porOnda[0] + Math.floor(Math.random() * (p.porOnda[1] - p.porOnda[0] + 1)));
        this.prancha = { estado: "abrindo", t: 0, abertura: 0, restantes: quantos, proximo: 0, descendo: [] };
        efeito("lanternaLiga");
    }

    atualizarPrancha(dt) {
        const pr = this.prancha;
        const c = HOLANDES.prancha;
        pr.t += dt;
        const de = this.conves();
        for (const pirata of pr.descendo) {
            pirata.moverConves(de.x, de.y);
        }
        if (pr.estado === "abrindo") {
            pr.abertura = Math.min(1, pr.t / c.abrir);
            if (pr.abertura >= 1) {
                pr.estado = "aberta";
                pr.t = 0;
            }
        } else if (pr.estado === "aberta") {
            pr.proximo -= dt;
            if (pr.restantes > 0 && pr.proximo <= 0) {
                const pirata = new Pirata(this.mapa, de, this.morro(), { esquerdo: this.alvoMinimoX, direito: this.alvoMaximoX });
                this.fase.diretor.adicionar(pirata);
                pr.descendo.push(pirata);
                pr.restantes--;
                pr.proximo = HOLANDES.piratas.entreDescidas;
            }
            pr.descendo = pr.descendo.filter((p) => p.vivo && p.estado === "descendo");
            if (pr.restantes === 0 && pr.descendo.length === 0) {
                pr.estado = "fechando";
                pr.t = 0;
            }
        } else if (pr.estado === "fechando") {
            pr.abertura = Math.max(0, 1 - pr.t / c.fechar);
            if (pr.abertura <= 0) {
                this.prancha = null;
                this.proximaOnda = HOLANDES.piratas.intervalo;
            }
        }
    }

    // ---- naufrágio e a lente ------------------------------------------------

    afundar() {
        this.estado = "afundando";
        this.t = 0;
        relogio.parar();
        this.fase.diretor.limpar();
        this.balas.limpar();
        this.prancha = null;
        this.nevoa.alvo = 0;
        const lanterna = lanternaAtual();
        if (lanterna !== null) {
            lanterna.multiplicadorGasto = 1;
            lanterna.modoChefe = false;
        }
        partida.estatisticas.monstros += 1;
        this.fase.avisar(HOLANDES.avisos.afundar);
        efeito("rugido");
        this.fase.app.viewport.shake(3, 900);
        this.proximaExplosao = 0.4;
        // afasta-se para o lado do morro em que está, para não cair na
        // frente da torre
        const navio = this.navio;
        const lado = navio.x >= this.morroX ? 1 : -1;
        const xFim = this.morroX + lado * Math.max(Math.abs(navio.x - this.morroX), HOLANDES.derivaAfundando);
        this.inicioDoNaufragio = { angulo: navio.angulo, x: navio.x, y: navio.y, xFim };
        navio.naAgua = true;
        navio.agua = this.horizonte();
    }

    // Inclina, encolhe (vai para longe) e cai no mar ao fundo, cortado na
    // linha do horizonte, com espuma e bolhas onde o casco entra na água.
    atualizarNaufragio(dt) {
        const navio = this.navio;
        const k = Math.min(1, this.t / HOLANDES.afundar);
        const i = this.inicioDoNaufragio;
        const horizonte = this.horizonte();
        const s = suave(k);
        navio.angulo = i.angulo + (HOLANDES.inclinarAfundando - i.angulo) * suave(Math.min(1, k * 1.6));
        navio.escala = 1 + (HOLANDES.escalaAfundando - 1) * s;
        navio.x = i.x + (i.xFim - i.x) * s;
        navio.y = i.y + (horizonte + HOLANDES.abaixoDoHorizonte - i.y) * k * k;
        navio.agua = horizonte;
        navio.alfa = HOLANDES.opacidade * (1 - Math.max(0, (k - 0.75) / 0.25));
        navio.espuma = 1;
        const naAgua = navio.y > horizonte;

        this.proximaExplosao -= dt;
        if (this.proximaExplosao <= 0 && k < 0.8) {
            this.proximaExplosao = HOLANDES.explosaoAfundando;
            const p = navio.pontoDoQuadro(sortear(30, 170), sortear(40, 125));
            if (p.y < horizonte) {
                efeito("explosao");
                this.fase.app.viewport.shake(3, 260);
                this.efeitos.explodir(p.x, p.y, 14, ["fogoClaro", "fogo", "fantasmaClaro", "fantasma"], { velocidade: [30, 90], duracao: [0.4, 0.8], subida: -30 });
                this.claroes.push({ x: p.x, y: p.y, t: 0 });
            }
        }
        // bolhas e fumaça fantasma só com o casco na água
        this.proximaBolha -= dt;
        while (this.proximaBolha <= 0) {
            this.proximaBolha += HOLANDES.bolhas;
            if (!naAgua) {
                continue;
            }
            const margem = 8 * navio.escala;
            this.efeitos.bolha(sortear(navio.esquerda + margem, navio.direita - margem), horizonte - 1);
            if (Math.random() < 0.3) {
                const f = this.efeitos.nova(sortear(navio.esquerda + 2.5 * margem, navio.direita - 2.5 * margem), horizonte - 2, "fantasma", sortear(0.6, 1.2));
                if (f !== null) {
                    f.vx = sortear(-6, 6);
                    f.vy = sortear(-35, -15);
                    f.lado = 2;
                }
            }
        }
        if (!this.lenteLancada && this.t >= HOLANDES.afundar * 0.45) {
            this.lancarLente();
        }
        if (k >= 1) {
            this.estado = "vencido";
            navio.alfa = 0;
        }
    }

    // A lente voa do navio até o chão ao lado da torre.
    lancarLente() {
        this.lenteLancada = true;
        const de = this.navio.pontoDoQuadro(96, 70);
        const x = this.torreX + HOLANDES.lente.distanciaDaTorre;
        this.lente = { de: { x: de.x, y: de.y }, ate: { x, y: this.mapa.alturaDoChao(x, 0) }, t: 0, x: de.x, y: de.y };
        efeito("canhao");
    }

    atualizarLente(dt) {
        const l = this.lente;
        if (l === null) {
            return;
        }
        const c = HOLANDES.lente;
        l.t += dt;
        const p = Math.min(1, l.t / c.voo);
        // o meio do ícone chega à altura em que a peça flutua
        const alvoY = l.ate.y - 12;
        l.x = l.de.x + (l.ate.x - l.de.x) * p;
        l.y = l.de.y + (alvoY - l.de.y) * p - 4 * c.alturaDoArco * p * (1 - p);
        if (Math.random() < 0.5) {
            emitirEstrelinhas(l.x, l.y, 1);
        }
        if (p >= 1) {
            this.lente = null;
            this.fase.itens.surgirPecaEm(l.ate, ICONE_LENTE);
            this.fase.avisar(HOLANDES.avisos.lente);
        }
    }

    // ---- desenho ------------------------------------------------------------

    // Por cima da escuridão, em pixels do mundo (CamadaHolandes).
    desenharBrilho(renderer) {
        const vista = lerVista(this.fase.app.viewport);
        const cores = coresDoHolandes();
        this.desenharSombra(renderer);
        this.navio.desenhar(renderer, vista);
        this.desenharBrilhoDasLanternas(renderer, cores);
        for (const c of this.claroes) {
            const k = c.t / 0.6;
            brilho(renderer, cores.fantasmaClaro, c.x, c.y, 14 + 26 * k, 0.35 * (1 - k));
        }
        this.nevoa.desenhar(renderer, vista);
        this.desenharPrancha(renderer, cores);
        this.balas.desenhar(renderer);
        this.efeitos.desenhar(renderer);
        if (this.lente !== null) {
            brilho(renderer, cores.fogoClaro, this.lente.x, this.lente.y, 12, 0.25);
            desenharIcone(renderer, ICONE_LENTE, this.lente.x - ICONE / 2, this.lente.y - ICONE / 2);
        }
    }

    desenharBrilhoDasLanternas(renderer, cores) {
        const alfa = this.navio.alfa;
        if (alfa <= 0.01 || this.estado === "vencido") {
            return;
        }
        const escala = this.navio.escala;
        for (const l of this.lanternas) {
            if (l.apagada) {
                continue;
            }
            const pulso = 1 + Math.sin(this.tempo * HOLANDES.brilhoPulso + l.indice * 2.1) * 0.2;
            const raio = HOLANDES.brilhoRaio * pulso * escala;
            // levando luz: pisca claro
            const piscando = l.iluminado > 0 && Math.floor(this.tempo / 0.05) % 2 === 0;
            brilho(renderer, cores.fantasma, l.x, l.y, raio, 0.16 * alfa);
            brilho(renderer, piscando ? cores.fogoClaro : cores.fantasmaClaro, l.x, l.y, raio * (piscando ? 0.7 : 0.45), (piscando ? 0.45 : 0.22) * alfa);
            if (piscando) {
                retangulo(renderer, cores.fogoClaro, l.x - 1, l.y - 1, 3, 3, alfa);
            }
        }
    }

    // Sombra fraca no chão sob o navio, só com ele no ar: uma elipse achatada
    // de quadradinhos (HOLANDES.sombra), cada coluna no chão do terreno do
    // seu x. Aparece depois da chegada e some no começo do naufrágio.
    desenharSombra(renderer) {
        let forca = 0;
        if (this.estado === "lutando") {
            forca = Math.min(1, this.t / 0.6);
        } else if (this.estado === "afundando") {
            forca = Math.max(0, 1 - this.t / (HOLANDES.afundar * 0.3));
        }
        const s = HOLANDES.sombra;
        const navio = this.navio;
        const alfa = s.alfa * forca * Math.min(1, navio.alfa / HOLANDES.opacidade);
        if (alfa <= 0.01) {
            return;
        }
        const { jogo } = dadosDoEstilo();
        const lado = s.lado;
        const meia = HOLANDES.quadroLargura * s.largura * navio.escala;
        const x0 = Math.floor((navio.x - meia) / lado) * lado;
        for (let x = x0; x < navio.x + meia; x += lado) {
            const u = (x + lado / 2 - navio.x) / meia;
            if (Math.abs(u) >= 1) {
                continue;
            }
            const altura = Math.max(1, Math.round((2 * s.altura * Math.sqrt(1 - u * u)) / lado)) * lado;
            const chao = chaoDoTerreno(this.mapa, x + lado / 2);
            retangulo(renderer, jogo.escuridao, x, chao - altura / 2, lado, altura, alfa);
        }
    }

    // Prancha de luz do convés até o topo do morro: pontos claros com brilho
    // correndo.
    desenharPrancha(renderer, cores) {
        const pr = this.prancha;
        if (pr === null || pr.abertura <= 0) {
            return;
        }
        const de = this.conves();
        const ate = this.morro();
        const fim = { x: de.x + (ate.x - de.x) * pr.abertura, y: de.y + (ate.y - de.y) * pr.abertura };
        const passos = Math.max(1, Math.round(Math.hypot(fim.x - de.x, fim.y - de.y) / 2));
        const largura = HOLANDES.prancha.largura;
        for (let i = 0; i <= passos; i++) {
            const t = i / passos;
            const x = de.x + (fim.x - de.x) * t;
            const y = de.y + (fim.y - de.y) * t;
            const onda = 0.55 + 0.45 * Math.sin(this.tempo * 9 - i * 0.6);
            retangulo(renderer, cores.fantasma, x - 1, y, 2, largura, 0.5 * onda);
            retangulo(renderer, cores.fantasmaClaro, x - 1, y, 2, 1, 0.8 * onda);
        }
        brilho(renderer, cores.fantasma, fim.x, fim.y, 8, 0.18);
    }

    // Barra de vida no alto, em pixels da tela, com os 3 segmentos (uma
    // lanterna cada).
    desenharHud(renderer) {
        if (this.estado === "vencido" || (this.estado === "afundando" && this.t > 1.5)) {
            return;
        }
        this.desenharSetaDoNavio(renderer);
        const x = Math.round((CONFIG.largura - HOLANDES.barraLargura) / 2);
        this.barra.desenhar(renderer, x, HOLANDES.barraY, { cor: coresDoJogoFase1().vidaChefe });
        const topo = Math.round(HOLANDES.barraY) + this.barra.rotulo.altura + 2;
        const { jogo } = dadosDoEstilo();
        const n = this.lanternas.length;
        for (let i = 1; i < n; i++) {
            pintar(renderer, jogo.escuridao, x + Math.round((HOLANDES.barraLargura * i) / n), topo, 1, HOLANDES.barraAltura, 0.9);
        }
    }

    // Navio fora da vista (o jogador longe do morro, a vista seguindo ele):
    // seta pulsando na borda da tela apontando para o navio, para o lado em
    // que ele saiu mais (como as setas das peças e das lápides).
    desenharSetaDoNavio(renderer) {
        // na cena da torre, as faixas pretas cobrem as bordas
        if (this.estado !== "lutando" || this.fase.cena?.ativa) {
            return;
        }
        const v = lerVista(this.fase.app.viewport);
        const navio = this.navio;
        const visivel = HOLANDES.setaVisivel;
        // quanto do navio (da ponta dos mastros à quilha) está na vista
        const dentroX = Math.min(navio.direita, v.x + v.largura) - Math.max(navio.esquerda, v.x);
        const dentroY = Math.min(navio.y, v.y + v.altura) - Math.max(navio.topo, v.y);
        if (dentroX >= visivel && dentroY >= visivel) {
            return;
        }
        const largura = CONFIG.largura;
        const altura = CONFIG.altura;
        const alvo = navio.pontoDoQuadro(HOLANDES.quadroLargura / 2, 60);
        const ax = (alvo.x - v.x) * v.zoom;
        const ay = (alvo.y - v.y) * v.zoom;
        const foraX = ax < 0 ? ax : ax > largura ? ax - largura : 0;
        const foraY = ay < 0 ? ay : ay > altura ? ay - altura : 0;
        let dx = 0;
        let dy = 0;
        if (Math.abs(foraX) >= Math.abs(foraY)) {
            dx = Math.sign(foraX);
        } else {
            dy = Math.sign(foraY);
        }
        if (dx === 0 && dy === 0) {
            return;
        }
        const cores = coresDoHolandes();
        const m = HOLANDES.setaMargem;
        // na borda do lado da seta; no outro eixo, na altura (ou no x) do
        // navio, entre a barra de vida no alto e os textos do rodapé
        const sx = dx > 0 ? largura - m - 4 : dx < 0 ? m + 4 : Math.min(largura - m - 4, Math.max(m + 4, ax));
        const sy = dy > 0 ? altura - 40 : dy < 0 ? m + 40 : Math.min(altura - 40, Math.max(m + 40, ay));
        const pulso = 0.7 + Math.sin(this.tempo * HOLANDES.setaPulso) * 0.3;
        brilho(renderer, cores.fantasma, sx, sy, 10, 0.25 * pulso);
        // a seta começa 3 px antes da ponta, que fica na borda
        desenharSeta(renderer, cores.fantasmaClaro, sx - dx * 3, sy - dy * 3, dx, dy, pulso);
    }

    destroy() {
        for (const cancelar of this.cancelarAlvos) {
            cancelar();
        }
        this.cancelarAlvos = [];
        const lanterna = lanternaAtual();
        if (lanterna !== null) {
            lanterna.multiplicadorGasto = 1;
            lanterna.modoChefe = false;
        }
        this.balas.limpar();
        this.efeitos.limpar();
        this.barra.destroy();
    }
}

// Camada do Holandês no mundo: do tamanho do mapa, só registra o brilho
// (navio, névoa, prancha, balas e partículas por cima da escuridão).
export class CamadaHolandes extends Renderable {
    constructor(holandes) {
        super(0, 0, holandes.mapa.largura, holandes.mapa.altura);
        this.anchorPoint.set(0, 0);
        this.holandes = holandes;
    }

    onActivateEvent() {
        registrarBrilho(this);
    }

    onDeactivateEvent() {
        removerBrilho(this);
    }

    update() {
        return true;
    }

    draw() {}

    desenharBrilho(renderer) {
        this.holandes.desenharBrilho(renderer);
    }
}