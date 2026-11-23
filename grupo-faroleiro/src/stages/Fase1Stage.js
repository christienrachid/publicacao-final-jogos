import { state } from "melonjs";
import { CONFIG } from "../config.js";
import { pintar } from "../entities/folha.js";
import { CameraDaFase, soltarCamera } from "../fase1/camera.js";
import { aplicarCartaDoBau, cartaDoBau, cartasDisponiveis, nivelDaCarta } from "../fase1/cartasDoBau.js";
import { CenaDaTorre } from "../fase1/cenaTorre.js";
import { Casa, Poste, Torre } from "../fase1/cenario.js";
import { Ceu } from "../fase1/ceu.js";
import { CENA, FASE1, HOLANDES, MINI_CHEFE, PECAS } from "../fase1/config.js";
import { coresDoJogoFase1 } from "../fase1/cores.js";
import { Escuridao, LuzRedonda } from "../fase1/escuridao.js";
import { Holandes } from "../fase1/holandes/Holandes.js";
import { HudFase1 } from "../fase1/HudFase1.js";
import { Itens } from "../fase1/itens/Itens.js";
import { desligarTeclasDoJogador, Jogador, ligarTeclasDoJogador } from "../fase1/Jogador.js";
import { limparAlvosDaLuz } from "../fase1/lanterna.js";
import { MapaDaIlha } from "../fase1/mapa.js";
import { Diretor } from "../fase1/monstros/Diretor.js";
import { lerVista } from "../fase1/vista.js";
import { PainelMelhorias } from "../fase2/PainelMelhorias.js";
import { limparBrilhos } from "../systems/brilhos.js";
import { emitirEstrelinhas, Particulas } from "../systems/particulas.js";
import { irParaEtapa, lembreteMostrado, marcarLembrete, partida, perder } from "../systems/partida.js";
import { minutosDe, relogio } from "../systems/relogio.js";
import { efeito } from "../systems/som.js";
import { FaseBase } from "./FaseBase.js";

// Fase 1: a ilha vista de lado, das 18h às 23h. Etapas: "fase1" (18h) e "holandes" (22h, chefe).
//
// Monta o mapa da ilha (src/fase1/mapa.js), o céu (ceu.js), a casa, a torre
// e os postes (cenario.js), o faroleiro com a lanterna (Jogador.js,
// lanterna.js), as partículas, a câmera com zoom (camera.js) e a escuridão
// com as luzes (escuridao.js), desenhada no drawLighting.
//
// Das 18h às 22h (tarefa 7): as peças na praia e os baús (fase1/itens/),
// os monstros e os mini-chefes (fase1/monstros/Diretor.js) e a cena do
// conserto da torre (fase1/cenaTorre.js). Às 22h os monstros somem e
// iniciarHolandes() começa o chefe.
//
// A peça da praia e o baú do mini-chefe, depois da peça, dão a escolher uma
// carta (Bateria maior ou Luz forte, src/fase1/cartasDoBau.js) no painel de
// cartas da Fase 2 (abrirCartasDoBau): o jogo para enquanto ele está aberto.
//
// Das 22h às 23h (tarefa 9): o Holandês Voador (fase1/holandes/), que usa
// this.mapa, this.jogador, this.diretor (piratas), this.itens (a lente) e
// avisar(texto). Vencido, ele solta a lente; pegar a lente (coletarLente)
// põe a torre no estágio 5 com a cena e passa para a Fase 2 (à 0h). Se der
// 23h com o navio inteiro, derrota "O Holandês escapou".

// ordem de desenho no mundo (as camadas de tiles usam Z_CAMADAS de mapa.js:
// fundo 3, mar 4, decoração 5, terreno 8, plataformas 9, frente 14)
export const Z = {
    ceu: 1,
    casa: 6,
    torre: 6,
    postes: 7,
    // monstros e peças entre 10 e 12
    itens: 10,
    holandes: 10,
    monstros: 11,
    jogador: 12,
    particulas: 13,
};

// lembrete do começo da primeira Fase 1 (segundos na tela)
const LEMBRETE_FASE1 = "A/D andam, W pula, clique acende, E recarrega na casa";
const LEMBRETE_DURACAO = 5;

export class Fase1Stage extends FaseBase {
    constructor() {
        super();
        this.mapa = null;
        this.jogador = null;
        this.torre = null;
        this.casa = null;
        this.postes = [];
        this.escuridao = null;
        this.cameraDaFase = null;
        this.aura = null;
        this.particulas = null;
        this.diretor = null;
        this.itens = null;
        this.cena = null;
        this.holandes = null;
        // a noite das 18h às 22h acabou (monstros limpos, Holandês chamado)
        this.holandesIniciado = false;
        // painel que para o jogo (as cartas do baú); null sem painel
        this.painel = null;
        // o painel das cartas do baú (aberto, fica também em this.painel)
        this.painelDoBau = null;
        // o relógio rodava quando o painel abriu (volta a rodar ao fechar)
        this.relogioRodavaNoPainel = false;
        // segundos até o próximo batimento (vida baixa)
        this.proximoBatimento = 0;
        // a derrota do faroleiro já foi pedida (a troca de tela leva alguns quadros)
        this.derrotaAberta = false;
    }

    // O jogo está parado por uma cena, um painel ou o naufrágio do Holandês:
    // a derrota do faroleiro espera para não abrir por cima de um estado
    // parado.
    get travado() {
        return this.cena?.ativa === true || this.painel !== null || this.holandes?.estado === "afundando";
    }

    get estadoDaFase() {
        return "fase1";
    }

    musicaDaEtapa(etapa) {
        return etapa === "holandes" ? "holandes" : "fase1";
    }

    criarHud() {
        return new HudFase1(this);
    }

    montar(app) {
        const mundo = app.world;
        const mapa = new MapaDaIlha().carregar("ilha");
        this.mapa = mapa;
        mapa.colocarNoMundo(mundo);

        mundo.addChild(new Ceu(mapa), Z.ceu);

        const ponto = (nome) => {
            const p = mapa.ponto(nome);
            if (p === null) {
                throw new Error(`Fase 1: o mapa não tem o ponto "${nome}"`);
            }
            return p;
        };
        this.casa = new Casa(ponto("Casa"), mapa);
        mundo.addChild(this.casa, Z.casa);
        this.torre = new Torre(ponto("Torre"));
        mundo.addChild(this.torre, Z.torre);
        this.postes = mapa.pontos("Poste").map((p) => new Poste(p, mapa));
        for (const poste of this.postes) {
            mundo.addChild(poste, Z.postes);
        }

        this.jogador = new Jogador(mapa, ponto("Jogador"), ponto("Porta"));
        mundo.addChild(this.jogador, Z.jogador);
        this.particulas = new Particulas(mapa.largura, mapa.altura);
        mundo.addChild(this.particulas, Z.particulas);
        ligarTeclasDoJogador();

        // luzes: postes, janela, lanterna e a aura fraca do faroleiro
        this.escuridao = new Escuridao(mapa);
        for (const poste of this.postes) {
            this.escuridao.adicionar(poste.luz);
        }
        this.escuridao.adicionar(this.casa.luzDaJanela);
        this.escuridao.adicionar(this.jogador.lanterna.cone);
        this.aura = this.escuridao.adicionar(new LuzRedonda(mapa, 0, 0, FASE1.luzes.aura));

        this.cameraDaFase = new CameraDaFase(app.viewport, mapa, this.jogador);

        // peças, baús, monstros e a cena da torre
        this.itens = new Itens(this);
        mundo.addChild(this.itens.camada, Z.itens);
        this.diretor = new Diretor(this);
        mundo.addChild(this.diretor.camada, Z.monstros);
        this.cena = new CenaDaTorre(this);
        this.holandesIniciado = false;
        this.derrotaAberta = false;
        this.painel = null;
        this.painelDoBau = new PainelMelhorias(this, (id) => this.escolherCartaDoBau(id), {
            titulo: "Tesouro do baú",
            nivelDe: nivelDaCarta,
        });
        this.proximoBatimento = 0;
        // recomeçando às 22h (ou pulando para depois): direto no Holandês
        if (this.etapa === "holandes") {
            this.encerrarNoite();
        }
        // lembrete dos controles, uma vez por sessão
        if (this.etapa === "fase1" && !lembreteMostrado("fase1")) {
            marcarLembrete("fase1");
            this.avisar(LEMBRETE_FASE1, LEMBRETE_DURACAO);
        }

        if (CONFIG.debug) {
            // para testar pelo console: __faroleiro.jogador.levarDano(1)
            globalThis.__faroleiro = this;
        }
    }

    desmontar(app) {
        desligarTeclasDoJogador();
        this.holandes?.destroy();
        this.holandes = null;
        this.cena?.destroy();
        this.painelDoBau?.desligar();
        this.painelDoBau?.destroy();
        this.painelDoBau = null;
        this.painel = null;
        this.diretor?.destroy();
        this.itens?.destroy();
        limparAlvosDaLuz();
        limparBrilhos();
        if (this.jogador?.cortina) {
            app.viewport.removeCameraEffect(this.jogador.cortina);
            this.jogador.cortina = null;
        }
        this.escuridao?.destroy();
        this.cameraDaFase?.destroy();
        soltarCamera(app.viewport);
        if (globalThis.__faroleiro === this) {
            delete globalThis.__faroleiro;
        }
        this.mapa = null;
        this.jogador = null;
        this.torre = null;
        this.casa = null;
        this.postes = [];
        this.escuridao = null;
        this.cameraDaFase = null;
        this.aura = null;
        this.particulas = null;
        this.diretor = null;
        this.itens = null;
        this.cena = null;
    }

    update(dt) {
        // o painel do baú segura a pausa do MelonJS e termina a escolha
        // antes de a base olhar a pausa (como na Fase 2)
        this.painel?.atualizar(dt);
        const sujo = super.update(dt);
        if (this.jogador !== null) {
            // o clique que fecha a pausa não liga a lanterna
            if (state.isPaused()) {
                this.jogador.botaoTravado = true;
            }
        }
        return sujo;
    }

    atualizarFase(dt) {
        const s = Math.min(dt, 50) / 1000;
        // a cena da torre pausa a lógica do mundo (monstros, itens, relógio)
        this.cena.atualizar(dt);
        if (!this.cena.ativa) {
            this.diretor.atualizar(s);
            this.itens.atualizar(s);
            this.holandes?.atualizar(s);
        }
        this.jogador.atualizar(dt);
        this.atualizarVidaBaixa(s);
        // morte definitiva: só abre a derrota com o jogo rodando
        if (this.jogador.morteAdiada && !this.travado && !this.derrotaAberta) {
            this.derrotaAberta = true;
            perder("O faroleiro caiu");
            return;
        }
        const c = this.jogador.centro();
        this.aura.x = c.x;
        this.aura.y = c.y;
        this.aura.forca = this.jogador.vivo ? 1 : 0;
        this.casa.atualizar();
        for (const poste of this.postes) {
            poste.atualizar();
        }
        this.escuridao.atualizar(dt);
        this.cameraDaFase.atualizar(dt);
    }

    // Com 1 coração e vivo: o batimento toca a cada alertaBaixa.batimento s.
    atualizarVidaBaixa(s) {
        if (!this.vidaBaixa) {
            this.proximoBatimento = 0;
            return;
        }
        this.proximoBatimento -= s;
        if (this.proximoBatimento <= 0) {
            this.proximoBatimento = FASE1.vida.alertaBaixa.batimento;
            efeito("batimento");
        }
    }

    get vidaBaixa() {
        const j = this.jogador;
        return j !== null && j.vivo && j.vida === 1;
    }

    // Moldura vermelha nas bordas que pulsa (faixas de quatro px, cada uma
    // mais fraca que a de fora).
    desenharVidaBaixa(renderer) {
        const a = FASE1.vida.alertaBaixa;
        const t = this.hud.tempo / 1000;
        const alfa = a.alfaMax * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / a.pulso));
        const cor = coresDoJogoFase1().vidaBaixa;
        const faixa = 4;
        const n = Math.round(a.moldura / faixa);
        for (let i = 0; i < n; i++) {
            const fade = alfa * (1 - i / n);
            const d = i * faixa;
            pintar(renderer, cor, d, d, CONFIG.largura - 2 * d, faixa, fade);
            pintar(renderer, cor, d, CONFIG.altura - d - faixa, CONFIG.largura - 2 * d, faixa, fade);
            pintar(renderer, cor, d, d + faixa, faixa, CONFIG.altura - 2 * d - 2 * faixa, fade);
            pintar(renderer, cor, CONFIG.largura - d - faixa, d + faixa, faixa, CONFIG.altura - 2 * d - 2 * faixa, fade);
        }
    }

    // HUD, a barra do Holandês e, por cima, as faixas pretas e o texto da
    // cena da torre. A moldura da vida baixa fica por baixo do HUD.
    desenharHud(renderer) {
        if (this.vidaBaixa) {
            this.desenharVidaBaixa(renderer);
        }
        this.hud.desenhar(renderer);
        this.holandes?.desenharHud(renderer);
        this.cena?.desenhar(renderer);
        this.painel?.desenhar(renderer);
    }

    // Escuridão com as luzes recortando, depois do mundo (ver escuridao.js).
    drawLighting(renderer, camera, translateX, translateY) {
        if (this.escuridao === null) {
            return;
        }
        this.escuridao.desenhar(renderer, camera, translateX, translateY, lerVista(camera));
    }

    // ---- jogabilidade das 18h às 22h ------------------------------------

    // Aviso grande no meio da tela, com fade.
    avisar(texto, duracao) {
        this.hud?.avisar(texto, duracao);
    }

    // Peça pega (da praia ou do baú): conserta a torre com a cena; depois
    // da quarta, vira bônus (bateria cheia e corações).
    coletarPeca(icone, ponto) {
        if (icone === HOLANDES.lente.icone) {
            return this.coletarLente(ponto);
        }
        efeito("coleta");
        emitirEstrelinhas(ponto.x, ponto.y, 8);
        partida.estatisticas.pecas += 1;
        if (partida.pecas >= 4) {
            const jogador = this.jogador;
            jogador.lanterna.encher();
            jogador.vida = Math.min(jogador.vidaMaxima, jogador.vida + CENA.curaDoBonus);
            this.avisar("Bateria cheia, +2 corações");
            return null;
        }
        const antes = this.torre.estagio;
        partida.pecas += 1;
        return this.cena.iniciar({ estagioAntes: antes, texto: `Torre ${partida.pecas}/4` });
    }

    // Peça da praia pega ou baú aberto (Itens.js chama depois da peça e da
    // cena da torre): o jogo para, como na
    // cena (relógio parado, jogador travado), e o painel mostra as cartas
    // que não chegaram ao máximo. Sem nenhuma, não abre. Devolve true se abriu.
    abrirCartasDoBau() {
        const jogador = this.jogador;
        if (this.painelDoBau === null || this.painel !== null || jogador === null || !jogador.vivo || this.derrotaAberta) {
            return false;
        }
        const cartas = cartasDisponiveis();
        if (cartas.length === 0) {
            return false;
        }
        this.relogioRodavaNoPainel = relogio.estaRodando();
        relogio.parar();
        jogador.travado = true;
        this.painel = this.painelDoBau;
        return this.painel.abrir(cartas);
    }

    // Carta escolhida no painel do baú: aplica, anota e solta o jogo.
    escolherCartaDoBau(id) {
        const jogador = this.jogador;
        this.painel = null;
        if (jogador === null) {
            return;
        }
        aplicarCartaDoBau(id, jogador.lanterna);
        partida.estatisticas.cartas.push(id);
        emitirEstrelinhas(jogador.centro().x, jogador.centro().y, 8);
        this.avisar(`${cartaDoBau(id).nome}!`);
        jogador.travado = false;
        // o clique que escolheu a carta não liga a lanterna sozinho
        jogador.botaoTravado = true;
        if (this.relogioRodavaNoPainel) {
            relogio.retomar();
        }
    }

    // Lente do farol (solta pelo Holandês vencido): torre no estágio 5 com a
    // cena e, no fim dela, a Fase 2 à 0h.
    coletarLente(ponto) {
        efeito("coleta");
        emitirEstrelinhas(ponto.x, ponto.y, 12);
        const antes = this.torre.estagio;
        partida.lente = true;
        const cena = this.cena;
        return cena.iniciar({ estagioAntes: antes, texto: "O farol está inteiro!" }).then(() => {
            // a fase pode ter sido desmontada no meio da cena (pausa → menu)
            if (this.cena === cena) {
                relogio.parar();
                irParaEtapa("fase2");
            }
        });
    }

    // 22h: para os monstros comuns, limpa os que restam e chama o chefe.
    encerrarNoite() {
        if (this.holandesIniciado) {
            return;
        }
        this.holandesIniciado = true;
        this.diretor.ativo = false;
        this.diretor.limpar();
        this.iniciarHolandes();
    }

    // O Holandês Voador (22h, ou recomeçando na etapa "holandes"): um chefe
    // novo, com tudo zerado.
    iniciarHolandes() {
        this.holandes?.destroy();
        this.holandes = new Holandes(this);
        this.app.world.addChild(this.holandes.camada, Z.holandes);
        this.holandes.iniciar();
    }

    // A peça da praia marcada para esta hora (cheia ou h:30, PECAS.horas),
    // se houver uma e o Holandês ainda não tiver chegado.
    surgirPecaDaHora(minutos) {
        const peca = PECAS.horas.indexOf(minutos);
        if (peca >= 0 && !this.holandesIniciado) {
            this.itens.surgirPeca(peca);
        }
    }

    aoMeiaHora({ minutos }) {
        this.surgirPecaDaHora(minutos);
        const tipo = MINI_CHEFE.porMeiaHora[minutos];
        if (tipo !== undefined && !this.holandesIniciado) {
            this.diretor.surgirMiniChefe(tipo);
        }
    }

    aoMudarHora({ minutos }) {
        this.surgirPecaDaHora(minutos);
        if (minutos === minutosDe(22)) {
            // sem as 4 peças a torre não fica pronta: a noite acaba aqui, antes
            // do Holandês (a última peça da praia afunda às 21h50)
            if (partida.pecas < PECAS.horas.length) {
                relogio.parar();
                perder("A torre não ficou pronta");
                return;
            }
            this.entrarNaEtapa("holandes");
            this.encerrarNoite();
        } else if (minutos >= minutosDe(23)) {
            // vencido, o relógio para no naufrágio e a lente leva à Fase 2;
            // 23h com o navio inteiro é derrota
            relogio.parar();
            if (!this.holandes?.derrotado) {
                perder("O Holandês escapou");
            }
        }
    }

    aoPularTempo() {
        // o modo de teste pode pular para antes ou depois das 22h
        const etapa = relogio.minutos() >= minutosDe(22) ? "holandes" : "fase1";
        if (etapa !== this.etapa) {
            this.entrarNaEtapa(etapa);
        }
        if (etapa === "holandes") {
            this.encerrarNoite();
        }
    }
}