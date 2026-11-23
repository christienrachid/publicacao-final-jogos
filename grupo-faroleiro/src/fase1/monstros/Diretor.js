import { Renderable } from "melonjs";
import { pintar } from "../../entities/folha.js";
import { registrarBrilho, removerBrilho } from "../../systems/brilhos.js";
import { dadosDoEstilo } from "../../systems/estilo.js";
import { partida } from "../../systems/partida.js";
import { relogio } from "../../systems/relogio.js";
import { efeito } from "../../systems/som.js";
import { CORACAO, DIRETOR, LAPIDE, MINI_CHEFE, MONSTROS } from "../config.js";
import { coresDoJogoFase1 } from "../cores.js";
import { lerVista } from "../vista.js";
import { Alma } from "./Alma.js";
import { Caranguejo } from "./Caranguejo.js";
import { desenharInimigo, desenharOlhos, folhaDeInimigos } from "./folha.js";
import { Lapide } from "./Lapide.js";
import { Vampiro } from "./Vampiro.js";

// Diretor dos monstros da Fase 1: segue a
// tabela DIRETOR (config.js) pela hora, com limite de vivos por tipo e no
// total, e faz nascer caranguejos nos pontos SpawnMar fora da vista e almas
// fora da borda da vista. Também os mini-chefes (surgirMiniChefe), o baú
// do mini-chefe morto (fase.itens.soltarBau), as lápides que soltam zumbis
// (Lapide.js, nos pontos "lapide" fora da vista, das 20h em diante), o
// vampiro (Vampiro.js, num ponto de chão fora da vista, das 21h em diante,
// um vivo por vez) e a limpeza das 22h (limpar).
//
// Desenho: CamadaMonstros (um Renderable no mundo, z entre 10 e 12) desenha
// os comuns embaixo da escuridão e, por cima dela, só os olhos deles (no
// escuro das 21h em diante só os olhos aparecem; os do zumbi são foscos e
// não aparecem; os do vampiro brilham inteiros só no aviso do dash); as lápides vão embaixo dos monstros; os mini-chefes, com halo,
// contorno e barra de vida, saem inteiros por cima dela (registro de brilhos).
//
// API para a fase e o Holandês (tarefa 9):
//   diretor.ativo = false        para de fazer nascer monstros comuns
//   diretor.adicionar(monstro)   põe um monstro qualquer (subclasse de
//                                Monstro.js) na lista: atualizado,
//                                desenhado e ferindo o jogador
//   diretor.surgirCaranguejo(chefe), diretor.surgirAlma(chefe)
//   diretor.surgirVampiro()      vampiro num ponto de chão fora da vista, com aviso
//   diretor.surgirLapide(ponto)  lápide num ponto "lapide" fora da vista (ou
//                                no ponto { x, y } dado), com aviso
//   diretor.lapides              as lápides (Lapide.js), para o HUD e o minimapa
//   diretor.limpar()             todos somem com fumaça, lápides também
//   diretor.vivos(tipo)          quantos vivos (de um tipo ou todos)

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

const PONTO = { x: 0, y: 0 };

export class Diretor {
    // fase: a Fase1Stage (mapa, jogador, itens, avisar, app)
    constructor(fase) {
        this.fase = fase;
        this.mapa = fase.mapa;
        this.jogador = fase.jogador;
        this.lista = [];
        this.lapides = [];
        this.ativo = true;
        // espera até o próximo de cada tipo (s); null = tipo ainda fechado
        this.esperas = { caranguejo: null, alma: null, lapide: null, vampiro: null };
        this.tempo = 0;
        const casa = this.mapa.ponto("Casa");
        this.meioDaIlha = casa ? casa.x : this.mapa.largura / 2;
        this.saidas = ["SpawnMarEsquerda", "SpawnMarDireita"].map((nome) => this.mapa.ponto(nome)).filter((p) => p !== null);
        this.camada = new CamadaMonstros(this);
    }

    // ---- consultas ----------------------------------------------------------

    vivos(tipo = null) {
        let n = 0;
        for (const m of this.lista) {
            if (m.vivo && (tipo === null || m.tipo === tipo)) {
                n++;
            }
        }
        return n;
    }

    // linha da tabela da hora (ou null antes da primeira)
    linhaDaHora(minutos = relogio.minutos()) {
        let linha = null;
        for (const l of DIRETOR.tabela) {
            if (minutos >= l.desde) {
                linha = l;
            }
        }
        return linha;
    }

    vista() {
        return lerVista(this.fase.app.viewport);
    }

    // ---- nascimento ---------------------------------------------------------

    adicionar(monstro) {
        this.lista.push(monstro);
        return monstro;
    }

    // Caranguejo num SpawnMar fora da vista (o mais perto do jogador).
    surgirCaranguejo(chefe = false) {
        if (this.saidas.length === 0) {
            return null;
        }
        const v = this.vista();
        const j = this.jogador.centro();
        const fora = this.saidas.filter((p) => p.x < v.x - 16 || p.x > v.x + v.largura + 16);
        const opcoes = fora.length > 0 ? fora : this.saidas;
        opcoes.sort((a, b) => Math.abs(a.x - j.x) - Math.abs(b.x - j.x));
        const saida = opcoes[0];
        // beira da praia do lado da saída
        const esquerda = saida.x < this.mapa.largura / 2;
        const meiaLargura = (16 * (chefe ? MINI_CHEFE.escala : 1)) / 2 + 2;
        const praiaX = esquerda ? this.mapa.limiteEsquerdo + meiaLargura : this.mapa.limiteDireito - meiaLargura;
        const praia = { x: praiaX, y: this.mapa.alturaDoChao(praiaX, 0) };
        return this.adicionar(new Caranguejo(this.mapa, saida, praia, { chefe }));
    }

    // Alma fora da borda da vista, acima do jogador.
    surgirAlma(chefe = false) {
        const v = this.vista();
        const j = this.jogador.centro();
        const margem = DIRETOR.foraDaVista * (chefe ? 2 : 1);
        const xEsquerda = v.x - margem;
        const xDireita = v.x + v.largura + margem;
        let lado = Math.random() < 0.5 ? -1 : 1;
        if (lado < 0 && xEsquerda < this.mapa.limiteEsquerdo - 32) {
            lado = 1;
        } else if (lado > 0 && xDireita > this.mapa.limiteDireito + 32) {
            lado = -1;
        }
        const x = lado < 0 ? xEsquerda : xDireita;
        const y = Math.max(24, j.y - 60 - sortear(0, 40));
        return this.adicionar(new Alma(x, y, { chefe }));
    }

    // Vampiro num ponto de chão fora da vista: os pontos "lapide" e a beira
    // das duas praias, o mais perto do jogador entre os que estão fora da
    // vista, com aviso. null se todos estão à vista ou já há um vivo.
    surgirVampiro() {
        const d = MONSTROS.vampiro;
        if (this.vivos("vampiro") >= d.maximo) {
            return null;
        }
        const meiaLargura = d.largura / 2 + 2;
        const praias = [this.mapa.limiteEsquerdo + meiaLargura, this.mapa.limiteDireito - meiaLargura].map((x) => ({ x, y: this.mapa.alturaDoChao(x, 0) }));
        const pontos = this.mapa.pontos("lapide").map((p) => ({ x: p.x, y: Lapide.chaoNoPonto(this.mapa, p) }));
        const v = this.vista();
        const margem = DIRETOR.foraDaVista;
        const fora = [...pontos, ...praias].filter((p) => p.x < v.x - margem || p.x > v.x + v.largura + margem || p.y < v.y - margem || p.y - d.altura > v.y + v.altura + margem);
        if (fora.length === 0) {
            return null;
        }
        const j = this.jogador.centro();
        fora.sort((a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y));
        const p = fora[0];
        const vampiro = this.adicionar(new Vampiro(this.mapa, p.x, p.y));
        this.fase.avisar(d.avisoTexto);
        return vampiro;
    }

    surgir(tipo, chefe = false) {
        if (tipo === "vampiro") {
            return this.surgirVampiro();
        }
        return tipo === "alma" ? this.surgirAlma(chefe) : this.surgirCaranguejo(chefe);
    }

    lapidesVivas() {
        let n = 0;
        for (const l of this.lapides) {
            if (l.vivo) {
                n++;
            }
        }
        return n;
    }

    // Lápide num ponto "lapide" livre fora da vista (sorteado; se todos estão
    // à vista, um livre qualquer), com aviso. ponto: { x, y } para forçar um
    // lugar (modo de teste). null se não há ponto livre.
    surgirLapide(ponto = null) {
        if (ponto === null) {
            // ocupado: já tem uma lápide (os pontos ficam em colunas diferentes;
            // o y da lápide pode subir até o topo do chão, Lapide.chaoNoPonto)
            const livres = this.mapa.pontos("lapide").filter((p) => !this.lapides.some((l) => !l.removida && Math.abs(l.pos.x - p.x) < 1));
            if (livres.length === 0) {
                return null;
            }
            const v = this.vista();
            const fora = livres.filter((p) => p.x < v.x - 16 || p.x > v.x + v.largura + 16 || p.y < v.y - 16 || p.y - LAPIDE.altura > v.y + v.altura + 16);
            const opcoes = fora.length > 0 ? fora : livres;
            ponto = opcoes[Math.floor(Math.random() * opcoes.length)];
        }
        const lapide = new Lapide(this.mapa, ponto);
        this.lapides.push(lapide);
        this.fase.avisar(LAPIDE.aviso);
        return lapide;
    }

    // Mini-chefe (19h30 caranguejo, 21h30 alma): aviso e rugido.
    surgirMiniChefe(tipo) {
        const m = this.surgir(tipo, true);
        if (m !== null) {
            this.fase.avisar(MINI_CHEFE.avisos[tipo]);
            efeito("rugido");
        }
        return m;
    }

    // ---- quadro -------------------------------------------------------------

    // dt em segundos (só fora da pausa e das cenas)
    atualizar(dt) {
        this.tempo += dt;
        if (this.ativo) {
            this.diretorDeOndas(dt);
        }
        for (const m of this.lista) {
            m.atualizar(dt, this);
        }
        for (const l of this.lapides) {
            l.atualizar(dt, this);
        }
        let k = 0;
        for (let i = 0; i < this.lapides.length; i++) {
            const l = this.lapides[i];
            if (!l.removida) {
                this.lapides[k++] = l;
            } else {
                l.cancelarLuz();
            }
        }
        this.lapides.length = k;
        // tira os que acabaram (sem criar array novo)
        let j = 0;
        for (let i = 0; i < this.lista.length; i++) {
            const m = this.lista[i];
            if (!m.removido) {
                this.lista[j++] = m;
            } else {
                m.cancelarLuz();
            }
        }
        this.lista.length = j;
    }

    diretorDeOndas(dt) {
        const linha = this.linhaDaHora();
        for (const tipo of ["caranguejo", "alma", "lapide", "vampiro"]) {
            const onda = linha?.[tipo] ?? null;
            if (onda === null) {
                this.esperas[tipo] = null;
                continue;
            }
            if (this.esperas[tipo] === null) {
                this.esperas[tipo] = DIRETOR.primeiraEspera;
            }
            this.esperas[tipo] -= dt;
            if (this.esperas[tipo] <= 0) {
                if (tipo === "lapide") {
                    // as lápides contam só entre elas
                    if (this.lapidesVivas() < onda.maximo) {
                        this.surgirLapide();
                    }
                } else if (tipo === "vampiro") {
                    // o vampiro fica fora do teto maximoTotal
                    if (this.vivos(tipo) < onda.maximo) {
                        this.surgirVampiro();
                    }
                } else if (this.vivos(tipo) < onda.maximo && this.vivos() < DIRETOR.maximoTotal) {
                    this.surgir(tipo);
                }
                this.esperas[tipo] = sortear(onda.intervalo[0], onda.intervalo[1]);
            }
        }
    }

    // Chamado pelo monstro ao morrer (zumbis e vampiros contam como os outros comuns).
    aoMorrer(m, pelaLuz) {
        if (!pelaLuz) {
            return;
        }
        partida.estatisticas.monstros += 1;
        if (!m.chefe) {
            // monstro comum desfeito pela luz: um zunido curto
            efeito("disparo");
            this.talvezSoltarCoracao(m);
        }
        if (m.chefe) {
            efeito("explosao");
            this.fase.app.viewport.shake(3, 260);
            const c = m.centro();
            this.fase.itens?.soltarBau(c.x, c.y);
        }
    }

    // Às vezes o monstro comum solta um coração. A chance sobe com a vida
    // baixa, e depois de CORACAO.garantia mortes sem coração o próximo solta.
    talvezSoltarCoracao(m) {
        const jogador = this.fase.jogador;
        const faltando = jogador ? jogador.vidaMaxima - jogador.vida : 0;
        const chance = CORACAO.chance + faltando * CORACAO.chancePorCoracaoFaltando;
        this.mortesSemCoracao = (this.mortesSemCoracao ?? 0) + 1;
        if (Math.random() < chance || this.mortesSemCoracao >= CORACAO.garantia) {
            this.mortesSemCoracao = 0;
            const c = m.centro();
            this.fase.itens?.soltarCoracao(c.x, c.y);
        }
    }

    // Todos somem com fumaça (22h), as lápides também.
    limpar() {
        for (const m of this.lista) {
            m.sumir();
        }
        for (const l of this.lapides) {
            l.sumir();
        }
    }

    // ---- desenho ------------------------------------------------------------

    // No mundo, embaixo da escuridão: as lápides e, por cima delas, os comuns.
    desenhar(renderer) {
        const img = folhaDeInimigos();
        for (const l of this.lapides) {
            l.desenhar(renderer, img);
        }
        for (const m of this.lista) {
            if (!m.chefe) {
                m.desenhar(renderer, img);
            }
        }
    }

    // Por cima da escuridão: os olhos dos comuns e os mini-chefes com halo,
    // contorno e barra.
    desenharBrilho(renderer) {
        const img = folhaDeInimigos();
        const cores = coresDoJogoFase1();
        const olho = dadosDoEstilo().jogo.olho;
        for (const m of this.lista) {
            // o zumbi tem olhos foscos (e outra folha): nada por cima do escuro
            if (m.chefe || m.removido || m.tipo === "zumbi") {
                continue;
            }
            const b = m.baseDoDesenho();
            const cor = m.tipo === "pirata" ? cores.olhoFantasma : olho;
            // o vampiro brilha inteiro só no aviso do dash (Vampiro.alfaDosOlhos)
            const alfa = m.tipo === "vampiro" ? m.alfaDosOlhos() : m.opacidade();
            desenharOlhos(renderer, m.quadroAtual(), b.x, b.y, m.olhando, m.escala, cor, alfa);
        }
        for (const m of this.lista) {
            if (!m.chefe || m.removido) {
                continue;
            }
            const alfa = m.opacidade();
            const c = m.centro();
            // halo pulsando (aditivo, em degraus)
            const pulso = 1 + Math.sin(this.tempo * 5) * 0.08;
            renderer.save();
            renderer.setBlendMode("additive");
            renderer.setColor(cores.halo);
            for (let i = 0; i < 3; i++) {
                const r = MINI_CHEFE.haloRaio * pulso * (1 - i * 0.25);
                renderer.setGlobalAlpha(0.08 * alfa);
                renderer.fillEllipse(Math.round(c.x), Math.round(c.y), r, r);
            }
            renderer.setBlendMode("normal");
            renderer.restore();
            // contorno: a silhueta clara (quadro de dano) deslocada nos 4 lados
            const b = m.baseDoDesenho();
            if (m.vivo) {
                const largura = MINI_CHEFE.contornoLargura * m.escala;
                const a = alfa * (0.75 + Math.sin(this.tempo * 6) * 0.25);
                const q = m.quadros.dano;
                desenharInimigo(renderer, img, q, b.x - largura, b.y, m.olhando, m.escala, a);
                desenharInimigo(renderer, img, q, b.x + largura, b.y, m.olhando, m.escala, a);
                desenharInimigo(renderer, img, q, b.x, b.y - largura, m.olhando, m.escala, a);
                desenharInimigo(renderer, img, q, b.x, b.y + largura, m.olhando, m.escala, a);
            }
            m.desenhar(renderer, img);
            if (m.vivo) {
                this.desenharBarra(renderer, m, cores);
            }
        }
    }

    desenharBarra(renderer, m, cores) {
        const caixa = m.caixa();
        PONTO.x = caixa.x + caixa.largura / 2;
        PONTO.y = caixa.y;
        const w = MINI_CHEFE.barraLargura;
        const h = MINI_CHEFE.barraAltura;
        const x = Math.round(PONTO.x - w / 2);
        // o desenho passa um pouco do alto da caixa
        const topoDoDesenho = m.baseDoDesenho().y - 32 * m.escala;
        const y = Math.round(Math.min(PONTO.y, topoDoDesenho + 8 * m.escala) - MINI_CHEFE.barraAcima - h);
        pintar(renderer, dadosDoEstilo().jogo.escuridao, x - 1, y - 1, w + 2, h + 2, 0.8);
        const vida = Math.max(0, Math.round((w * m.vida) / m.vidaMaxima));
        if (vida > 0) {
            pintar(renderer, cores.vidaChefe, x, y, vida, h);
            pintar(renderer, cores.miolo, x, y, vida, 1, 0.4);
        }
    }

    destroy() {
        for (const m of this.lista) {
            m.cancelarLuz();
        }
        this.lista.length = 0;
        for (const l of this.lapides) {
            l.destroy();
        }
        this.lapides.length = 0;
    }
}

// Camada dos monstros no mundo: do tamanho do mapa (nunca sai da vista),
// desenha os comuns e registra o brilho dos mini-chefes.
export class CamadaMonstros extends Renderable {
    constructor(diretor) {
        super(0, 0, diretor.mapa.largura, diretor.mapa.altura);
        this.anchorPoint.set(0, 0);
        this.diretor = diretor;
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

    draw(renderer) {
        this.diretor.desenhar(renderer);
    }

    desenharBrilho(renderer) {
        this.diretor.desenharBrilho(renderer);
    }
}
