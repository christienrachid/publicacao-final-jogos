import { loader, Renderable } from "melonjs";
import { CONFIG } from "../../config.js";
import { imagem } from "../../systems/estilo.js";
import { emitirEstrelinhas, emitirFaiscas } from "../../systems/particulas.js";
import { partida, vencer } from "../../systems/partida.js";
import { relogio } from "../../systems/relogio.js";
import { efeito } from "../../systems/som.js";
import { BarraDeVida } from "../../ui/barra.js";
import { CAMERA, KRAKEN, MUNDO, OLHOS_DO_KRAKEN } from "../config.js";
import { coresDaFase2 } from "../cores.js";
import { Aneis } from "./Aneis.js";
import { Cardume } from "./Cardume.js";
import { coresDoKraken } from "./cores.js";
import { brilhoRedondo, comecarPontos } from "./desenho.js";
import { Tentaculos } from "./Tentaculos.js";

// O Kraken, chefe da Fase 2 das 5h às 6h.
//
// Entrada: a câmera sobe para a vista do Kraken (CAMERA.yKraken), a tela
// treme, ele ruge e sobe da água no alto da tela com respingos e espuma;
// depois fica parado ao fundo, alternando os quadros 0 e 1.
//
// Luta, em ciclo: olhos abertos (quadro 2, brilho pulsando; só aí o facho
// disparado que contém um olho tira vida, um acerto por disparo) e um
// ataque, alternando anéis, cardume e o minigame dos tentáculos. Cada
// ataque fica mais forte conforme a vida cai (fúria 0, 1 e 2; KRAKEN.furia).
// Durante os tentáculos não nasce monstro e uma barra fina abaixo da barra
// de vida mostra o tempo.
//
// Fim: com a vida em 0 o relógio para, ele afunda com tremor, clarões e
// faíscas, e vem a vitória (partida.vencer). Se der 6h antes, a Fase2Stage
// chama a derrota "A noite venceu".
//
// A fase cria um Kraken novo em iniciarKraken() (o "Tentar de novo" volta
// às 5h com tudo zerado) e chama kraken.atualizar(s) em atualizarFase, que
// para na pausa. O desenho vem da CamadaKraken, por cima da noite.

const ORDEM_DOS_ATAQUES = ["aneis", "cardume", "tentaculos"];
const ATAQUES = { aneis: Aneis, cardume: Cardume, tentaculos: Tentaculos };

// avisos na primeira vez de cada coisa
const AVISOS = {
    olhos: "Mire nos olhos!",
    aneis: "Facho nas aberturas!",
    cardume: "Cardume!",
    tentaculos: "Tentáculos!",
};

// Dica dos tentáculos: só no primeiro ataque de tentáculos da sessão (zera
// ao carregar a página); depois, o aviso curto de AVISOS.
const DICA_DOS_TENTACULOS = "Segure o botão e arraste em linha reta, do círculo até a ponta!";
export let primeiroTentaculos = true;

// barra do tempo dos tentáculos, em pixels da tela: tamanho e distância
// abaixo da barra de vida
const BARRA_DO_TEMPO = { largura: 160, altura: 4, abaixo: 4 };

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

export class Kraken {
    // fase: a Fase2Stage (facho, diretor, moverCamera, danificarTorre,
    // tremer, avisar, vista)
    constructor(fase) {
        this.fase = fase;
        this.vidaMaxima = KRAKEN.vida;
        this.vida = this.vidaMaxima;
        // "chegando" (câmera subindo), "emergindo", "lutando", "afundando", "vencido"
        this.estado = "chegando";
        this.t = 0;
        this.tempo = 0;
        // ciclo da luta: "pausa", "olhos" ou "ataque", e o que vem depois da pausa
        this.etapa = "pausa";
        this.tempoDaEtapa = 0;
        this.duracaoDaEtapa = KRAKEN.pausaInicial;
        this.depoisDaPausa = "olhos";
        this.ataque = null;
        this.proximoAtaque = 0;
        this.ultimoDisparo = -1;
        this.flash = 0;
        this.clarao = 0;
        this.proximoRespingo = 0;
        this.proximaExplosao = 0;
        this.furiaAnterior = 0;
        this.avisados = new Set();
        this.olhos = OLHOS_DO_KRAKEN.map((o) => ({ x: KRAKEN.x + o.x, y: KRAKEN.y + o.y }));
        this.barra = new BarraDeVida({ largura: KRAKEN.barraLargura, altura: KRAKEN.barraAltura, rotulo: "Kraken" });
        this.barra.definir(0);
        this.barra.rastro = 0;
    }

    // Começa a entrada: câmera, tremor e rugido.
    iniciar() {
        efeito("rugido");
        this.fase.tremer(KRAKEN.tremorDaEntrada, KRAKEN.camera + KRAKEN.emergir * 1000);
        if (this.fase.hud) {
            this.fase.hud.avisoNoKraken = true;
        }
        this.fase.moverCamera(CAMERA.yKraken, KRAKEN.camera, () => this.emergir());
    }

    emergir() {
        if (this.estado !== "chegando") {
            return;
        }
        this.estado = "emergindo";
        this.t = 0;
        efeito("respingo");
    }

    // 0 com a vida cheia, 1 abaixo de 75%, 2 abaixo de 50% (KRAKEN.furia)
    get furia() {
        const f = this.vida / this.vidaMaxima;
        return f > KRAKEN.furia[0] ? 0 : f > KRAKEN.furia[1] ? 1 : 2;
    }

    get olhosAbertos() {
        return this.estado === "lutando" && this.etapa === "olhos";
    }

    get derrotado() {
        return this.estado === "afundando" || this.estado === "vencido";
    }

    // 0 = todo acima da água, 1 = todo embaixo
    get afundado() {
        if (this.estado === "chegando") {
            return 1;
        }
        if (this.estado === "emergindo") {
            const k = Math.min(1, this.t / KRAKEN.emergir);
            // sobe rápido e assenta devagar
            return Math.pow(1 - k, 2);
        }
        if (this.estado === "afundando" || this.estado === "vencido") {
            const k = Math.min(1, this.t / KRAKEN.afundar);
            return k * k;
        }
        return 0;
    }

    avisarUmaVez(chave) {
        if (!this.avisados.has(chave)) {
            this.avisados.add(chave);
            if (chave === "tentaculos" && primeiroTentaculos) {
                primeiroTentaculos = false;
                this.fase.avisar(DICA_DOS_TENTACULOS);
            } else {
                this.fase.avisar(AVISOS[chave]);
            }
        }
    }

    // ---- quadro -------------------------------------------------------------

    // dt em segundos (só fora da pausa)
    atualizar(dt) {
        this.tempo += dt;
        this.t += dt;
        this.flash = Math.max(0, this.flash - dt);
        this.clarao = Math.max(0, this.clarao - dt / 0.3);

        if (this.estado === "emergindo") {
            this.atualizarEmergindo(dt);
        } else if (this.estado === "lutando") {
            this.atualizarLuta(dt);
            this.aplicarFacho();
        } else if (this.estado === "afundando" || this.estado === "vencido") {
            this.atualizarAfundando(dt);
        }

        // a barra enche durante a subida e depois mostra a vida
        if (this.estado === "emergindo") {
            this.barra.definir(Math.min(1, this.t / KRAKEN.emergir));
        } else if (this.estado !== "chegando") {
            this.barra.definir(this.vida / this.vidaMaxima);
        }
        this.barra.atualizar(dt * 1000);
    }

    atualizarEmergindo(dt) {
        this.proximoRespingo -= dt;
        if (this.proximoRespingo <= 0) {
            this.proximoRespingo = KRAKEN.respingo;
            this.respingoNaAgua(1 + Math.random() * 0.6);
        }
        if (this.t >= KRAKEN.emergir) {
            this.estado = "lutando";
            this.t = 0;
            this.comecarEtapa("pausa", KRAKEN.pausaInicial);
            this.depoisDaPausa = "olhos";
        }
    }

    respingoNaAgua(escala) {
        const x = KRAKEN.x + sortear(24, KRAKEN.quadroLargura - 24);
        this.fase.diretor?.respingo(x, KRAKEN.y + KRAKEN.linhaDagua + 2, escala);
    }

    comecarEtapa(etapa, duracao) {
        this.etapa = etapa;
        this.tempoDaEtapa = 0;
        this.duracaoDaEtapa = duracao;
    }

    atualizarLuta(dt) {
        // a fúria subiu: rugido e aviso
        const furia = this.furia;
        if (furia > this.furiaAnterior) {
            this.furiaAnterior = furia;
            efeito("rugido");
            this.fase.tremer(2, 500);
            this.fase.avisar("O Kraken se enfurece!");
        }

        this.tempoDaEtapa += dt;
        if (this.etapa === "pausa") {
            if (this.tempoDaEtapa >= this.duracaoDaEtapa) {
                if (this.depoisDaPausa === "olhos") {
                    this.abrirOlhos();
                } else {
                    this.comecarAtaque();
                }
            }
        } else if (this.etapa === "olhos") {
            if (this.tempoDaEtapa >= this.duracaoDaEtapa) {
                this.comecarEtapa("pausa", KRAKEN.pausa);
                this.depoisDaPausa = "ataque";
            }
        } else if (this.etapa === "ataque") {
            this.ataque.atualizar(dt);
            if (this.ataque.terminou) {
                this.ataque = null;
                this.comecarEtapa("pausa", KRAKEN.pausa);
                this.depoisDaPausa = "olhos";
            }
        }
    }

    abrirOlhos() {
        this.comecarEtapa("olhos", KRAKEN.olhosAbertos);
        efeito("lanternaLiga");
        this.avisarUmaVez("olhos");
        for (const o of this.olhos) {
            emitirEstrelinhas(o.x, o.y, 5);
        }
    }

    comecarAtaque() {
        const nome = ORDEM_DOS_ATAQUES[this.proximoAtaque % ORDEM_DOS_ATAQUES.length];
        this.proximoAtaque++;
        this.ataque = new ATAQUES[nome](this);
        this.comecarEtapa("ataque", Infinity);
        this.avisarUmaVez(nome);
        if (nome !== "cardume") {
            efeito("rugido");
        }
    }

    // O disparo que contém um olho aberto tira vida (uma vez por disparo),
    // com a força do facho que o toca (o oposto do Facho duplo é mais fraco).
    aplicarFacho() {
        const facho = this.fase.facho;
        if (!this.olhosAbertos || facho === null || !facho.disparando || facho.disparoId === this.ultimoDisparo) {
            return;
        }
        let forca = 0;
        for (const o of this.olhos) {
            forca = Math.max(forca, facho.forcaEm(o.x, o.y, KRAKEN.raioDoOlho));
        }
        if (forca > 0) {
            this.ultimoDisparo = facho.disparoId;
            this.levarDano(facho.dano * forca);
        }
    }

    levarDano(dano) {
        this.vida = Math.max(0, this.vida - dano);
        this.flash = KRAKEN.flashDano;
        for (const o of this.olhos) {
            emitirFaiscas(o.x, o.y, KRAKEN.faiscasDano);
        }
        efeito("canhao");
        this.fase.tremer(KRAKEN.tremorDano, KRAKEN.tremorDanoMs);
        if (this.vida <= 0) {
            this.morrer();
        }
    }

    morrer() {
        this.estado = "afundando";
        this.t = 0;
        this.proximaExplosao = 0;
        relogio.parar();
        this.ataque?.encerrar();
        const diretor = this.fase.diretor;
        if (diretor !== null) {
            diretor.ativo = false;
            diretor.matarTodos();
        }
        partida.estatisticas.monstros++;
        efeito("rugido");
        this.fase.tremer(4, KRAKEN.afundar * 1000);
        this.fase.avisar("O Kraken afunda!");
    }

    atualizarAfundando(dt) {
        // o ataque que estava em curso termina de se desfazer
        if (this.ataque !== null) {
            this.ataque.atualizar(dt);
            if (this.ataque.terminou) {
                this.ataque = null;
            }
        }
        if (this.estado === "vencido") {
            return;
        }
        if (this.t < KRAKEN.afundar) {
            this.proximaExplosao -= dt;
            if (this.proximaExplosao <= 0) {
                this.proximaExplosao = KRAKEN.explosao;
                efeito("explosao");
                this.clarao = 1;
                const x = KRAKEN.x + sortear(40, KRAKEN.quadroLargura - 40);
                const y = KRAKEN.y + sortear(20, KRAKEN.linhaDagua - 10) + this.afundado * KRAKEN.linhaDagua;
                emitirFaiscas(x, Math.min(y, KRAKEN.y + KRAKEN.linhaDagua), KRAKEN.faiscasMorte);
            }
            this.proximoRespingo -= dt;
            if (this.proximoRespingo <= 0) {
                this.proximoRespingo = KRAKEN.respingo;
                this.respingoNaAgua(1.2 + Math.random() * 0.6);
            }
        } else if (this.t >= KRAKEN.afundar + KRAKEN.esperaVitoria) {
            this.estado = "vencido";
            vencer();
        }
    }

    // ---- desenho (em pixels do mundo, pela CamadaKraken) -------------------

    quadro() {
        if (this.derrotado) {
            return Math.floor(this.t / 0.08) % 2 === 0 ? 3 : 0;
        }
        if (this.flash > 0 && Math.floor(this.flash / 0.05) % 2 === 0) {
            return 3;
        }
        if (this.olhosAbertos) {
            return 2;
        }
        return Math.floor(this.tempo / KRAKEN.quadroParado) % 2;
    }

    desenhar(renderer, vista) {
        if (this.estado === "chegando") {
            return;
        }
        this.desenharCorpo(renderer);
        this.desenharEspuma(renderer);
        if (this.olhosAbertos) {
            this.desenharBrilhoDosOlhos(renderer);
        }
        if (this.ataque !== null) {
            this.ataque.desenhar(renderer, vista);
        }
        if (this.clarao > 0) {
            renderer.save();
            renderer.setBlendMode("additive");
            comecarPontos(renderer, coresDoKraken().clarao, 0.3 * this.clarao);
            renderer.fillRect(vista.x - 8, vista.y - 8, vista.largura + 16, vista.altura + 16);
            renderer.restore();
            renderer.setBlendMode("normal");
            renderer.restore();
        }
    }

    // O corpo cortado na linha d'água (subindo ou afundando) e, abaixo dela,
    // a água e o reflexo do quadro, sumindo com o corpo.
    desenharCorpo(renderer) {
        const img = loader.getImage(imagem("kraken"));
        const L = KRAKEN.quadroLargura;
        const A = KRAKEN.quadroAltura;
        const linha = KRAKEN.linhaDagua;
        const sx = this.quadro() * L;
        const afundado = this.afundado;
        const descida = Math.round(afundado * linha);
        const visivel = linha - descida;
        if (visivel > 0) {
            renderer.drawImage(img, sx, 0, L, visivel, KRAKEN.x, KRAKEN.y + descida, L, visivel);
        }
        const alfa = 1 - afundado;
        if (alfa > 0.01) {
            renderer.save();
            renderer.setGlobalAlpha(alfa);
            renderer.drawImage(img, sx, linha, L, A - linha, KRAKEN.x, KRAKEN.y + linha, L, A - linha);
            renderer.restore();
        }
    }

    // espuma na linha d'água enquanto ele sobe ou afunda
    desenharEspuma(renderer) {
        let forca = 0;
        if (this.estado === "emergindo") {
            forca = 1;
        } else if (this.estado === "lutando") {
            forca = Math.max(0, 1 - this.t / 1.2);
        } else if (this.derrotado) {
            forca = Math.max(0, 1 - Math.max(0, this.t - KRAKEN.afundar) / 1.0);
        }
        if (forca <= 0) {
            return;
        }
        const cores = coresDoKraken();
        const y = KRAKEN.y + KRAKEN.linhaDagua;
        comecarPontos(renderer, cores.espuma, 0.85 * forca);
        for (let x = KRAKEN.x + 12; x < KRAKEN.x + KRAKEN.quadroLargura - 12; x += 3) {
            const onda = Math.sin(x * 0.21 + this.tempo * 9) + Math.sin(x * 0.07 - this.tempo * 5);
            if (onda > 0.2) {
                renderer.fillRect(x, Math.round(y - 1 + Math.sin(x * 0.13 + this.tempo * 6) * 1.5), 2, onda > 1 ? 2 : 1);
            }
        }
        renderer.restore();
    }

    desenharBrilhoDosOlhos(renderer) {
        const cores = coresDoKraken();
        const pulso = 1 + Math.sin(this.tempo * KRAKEN.brilhoPulso) * 0.18;
        // abre devagar nos primeiros 0,25 s
        const entrada = Math.min(1, this.tempoDaEtapa / 0.25);
        for (const o of this.olhos) {
            brilhoRedondo(renderer, cores.olho, o.x, o.y, KRAKEN.brilhoRaio * pulso * entrada, 0.16 * entrada);
        }
    }

    // Barra de vida no alto, em pixels da tela (Fase2Stage.desenharHud), e,
    // durante os tentáculos, a barra do tempo que falta logo abaixo.
    desenharHud(renderer) {
        if (this.estado === "chegando" || this.estado === "vencido") {
            return;
        }
        const x = Math.round((CONFIG.largura - KRAKEN.barraLargura) / 2);
        this.barra.desenhar(renderer, x, KRAKEN.barraY, { cor: coresDaFase2().vidaChefe });
        if (this.ataque instanceof Tentaculos && !this.ataque.esgotou && !this.derrotado) {
            this.desenharBarraDoTempo(renderer);
        }
    }

    desenharBarraDoTempo(renderer) {
        const b = BARRA_DO_TEMPO;
        const cores = coresDoKraken();
        const fracao = Math.max(0, Math.min(1, this.ataque.restante / this.ataque.duracao));
        const x = Math.round((CONFIG.largura - b.largura) / 2);
        const rotulo = this.barra.rotulo === null ? 0 : this.barra.rotulo.altura + 2;
        const y = KRAKEN.barraY + rotulo + KRAKEN.barraAltura + b.abaixo;
        comecarPontos(renderer, cores.anelEscuro, 0.85);
        renderer.fillRect(x - 1, y - 1, b.largura + 2, b.altura + 2);
        renderer.restore();
        comecarPontos(renderer, cores.partida, 0.9);
        renderer.fillRect(x, y, Math.round(b.largura * fracao), b.altura);
        renderer.restore();
    }

    destruir() {
        this.barra.destroy();
    }
}

// Camada do Kraken no mundo, por cima da noite e embaixo do topo do farol:
// o corpo, o brilho dos olhos e o ataque em curso.
export class CamadaKraken extends Renderable {
    constructor(kraken) {
        super(0, 0, MUNDO.largura, MUNDO.altura);
        this.anchorPoint.set(0, 0);
        this.alwaysUpdate = true;
        this.kraken = kraken;
    }

    draw(renderer) {
        this.kraken.desenhar(renderer, this.kraken.fase.vista());
    }
}
