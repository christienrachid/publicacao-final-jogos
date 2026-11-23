import { event, input } from "melonjs";
import { CONFIG } from "../config.js";
import { CamadaAcima, CamadaMonstros, Cenario } from "../fase2/camadas.js";
import { CAMERA, DT_MAXIMO, FAROL, MAR, MINI_CHEFE, MUNDO, NIVEL_MAXIMO, TORRE } from "../fase2/config.js";
import { Energia } from "../fase2/energia.js";
import { Facho } from "../fase2/facho.js";
import { HudFase2 } from "../fase2/HudFase2.js";
import { naIlha } from "../fase2/ilha.js";
import { CamadaKraken, Kraken } from "../fase2/kraken/Kraken.js";
import { aplicarMelhoria, capacidadeDaEnergia, melhoria, sortearCartas } from "../fase2/melhorias.js";
import { Diretor } from "../fase2/monstros/Diretor.js";
import { Noite } from "../fase2/noite.js";
import { PainelMelhorias } from "../fase2/PainelMelhorias.js";
import { emitirEstrelinhas, Particulas } from "../systems/particulas.js";
import { lembreteMostrado, marcarLembrete, partida, perder, salvarPontoDeRetorno } from "../systems/partida.js";
import { minutosDe, relogio } from "../systems/relogio.js";
import { efeito } from "../systems/som.js";
import { ponteiro } from "../ui/entrada.js";
import { FaseBase } from "./FaseBase.js";

// Fase 2: o farol visto de cima, da 0h às 6h. Etapas: "fase2" (0h) e "kraken" (5h, chefe).
//
// O mouse aponta o facho (src/fase2/facho.js), o botão esquerdo ou Espaço
// dispara; o cursor vira uma mira enquanto a fase está aberta. Durante os
// tentáculos do Kraken, o aperto que começa num círculo de partida é do
// ataque (ver tracarTentaculos) e não dispara até o botão ser solto. Os
// monstros nascem pelo diretor (src/fase2/monstros/Diretor.js), com um
// mini-chefe às 1h, 2h, 3h e 4h que solta uma engrenagem. A torre tem
// vida (partida.vidaTorre); com 0 vem a derrota "O farol apagou".
//
// Energia e melhorias: cada monstro morto pelo facho solta faíscas que
// enchem a barra de energia (src/fase2/energia.js); cheia, o jogo para e o
// painel de escolha abre (src/fase2/PainelMelhorias.js, melhorias.js).
// Conserto: não há mais conserto passivo; ao matar um mini-chefe a torre
// recupera MINI_CHEFE.cura da vida máxima (`curaPorChefe`), com um anel de luz na base (CamadaAcima).
//
// API para o Kraken (tarefa 8):
//   this.facho                 ângulo, disparando, cone, contem() (facho.js)
//   this.diretor               monstros e ondas (Diretor.js); ativo = false às 5h
//   this.danificarTorre(dano)  tira vida da torre com flash, tremor e som
//   this.moverCamera(y, ms, aoTerminar)  câmera suave: CAMERA.yKraken mostra o Kraken
//   this.vista()               retângulo visível do mundo agora
//   this.avisar(texto)         aviso grande no meio da tela
//   this.tremer(intensidade, ms)
//   this.iniciarKraken()       chamado às 5h (e ao recomeçar na etapa "kraken"):
//                              cria o Kraken (src/fase2/kraken/Kraken.js)

// ordem de desenho das camadas do mundo
const Z = {
    cenario: 0,
    monstros: 2,
    particulas: 3,
    noite: 5,
    kraken: 5.5,
    acima: 6,
};

// suavização da câmera (0 a 1 → 0 a 1), entrando e saindo devagar
function suavizar(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// lembrete do começo da primeira Fase 2 (segundos na tela)
const LEMBRETE_FASE2 = "Mouse aponta, clique dispara, Esc pausa";
const LEMBRETE_DURACAO = 5;

export class Fase2Stage extends FaseBase {
    constructor() {
        super();
        this.facho = null;
        this.diretor = null;
        this.kraken = null;
        this.energia = null;
        this.painel = null;
        // 1 a cada conserto da torre (mini-chefe morto), caindo até 0 (só desenho)
        this.brilhoDoConserto = 0;
        // 1 ao escolher uma melhoria, caindo até 0 (brilho no farol)
        this.brilhoDaMelhoria = 0;
        this.camera = null;
        this.espaco = false;
        // botão do mouse no quadro anterior e se o aperto atual é do ataque
        this.botaoAntes = false;
        this.botaoDoAtaque = false;
        this.apagou = false;
        this.krakenIniciado = false;
        this.movimentoDaCamera = null;
        this.retanguloDaVista = { x: 0, y: 0, largura: CONFIG.largura, altura: CONFIG.altura };
        this.aoTeclar = this.aoTeclar.bind(this);
        this.aoSoltarTecla = this.aoSoltarTecla.bind(this);
        this.aoPerderFoco = this.aoPerderFoco.bind(this);
    }

    get estadoDaFase() {
        return "fase2";
    }

    musicaDaEtapa(etapa) {
        return etapa === "kraken" ? "kraken" : "fase2";
    }

    criarHud() {
        return new HudFase2(this);
    }

    montar(app) {
        this.apagou = false;
        this.krakenIniciado = false;
        this.kraken = null;
        this.espaco = false;
        this.botaoAntes = ponteiro.apertado;
        this.botaoDoAtaque = false;
        this.movimentoDaCamera = null;
        this.brilhoDoConserto = 0;
        this.brilhoDaMelhoria = 0;
        this.prepararTorre();

        // câmera parada mostrando y 120 a 480 do mundo 640×480
        this.camera = app.viewport;
        this.camera.offset.set(0, 0);
        this.camera.setBounds(0, 0, MUNDO.largura, MUNDO.altura);
        this.camera.moveTo(0, CAMERA.yNormal);

        this.facho = new Facho();
        this.diretor = new Diretor(this);
        this.energia = new Energia();
        this.painel = new PainelMelhorias(this, (id) => this.escolherMelhoria(id));

        const particulas = new Particulas(MUNDO.largura, MUNDO.altura);
        this.espalharVagalumes(particulas);
        app.world.addChild(new Cenario(), Z.cenario);
        app.world.addChild(new CamadaMonstros(this), Z.monstros);
        app.world.addChild(particulas, Z.particulas);
        app.world.addChild(new Noite(this), Z.noite);
        app.world.addChild(new CamadaAcima(this), Z.acima);

        event.on(event.KEYDOWN, this.aoTeclar);
        event.on(event.KEYUP, this.aoSoltarTecla);
        event.on(event.BLUR, this.aoPerderFoco);
        // cursor de mira no canvas enquanto a fase está aberta
        app.renderer.getCanvas().style.cursor = "crosshair";

        if (this.etapa === "kraken") {
            this.iniciarKraken();
        }
        // lembrete dos controles, uma vez por sessão
        if (this.etapa === "fase2" && !lembreteMostrado("fase2")) {
            marcarLembrete("fase2");
            this.avisar(LEMBRETE_FASE2, LEMBRETE_DURACAO);
        }
    }

    desmontar(app) {
        event.off(event.KEYDOWN, this.aoTeclar);
        event.off(event.KEYUP, this.aoSoltarTecla);
        event.off(event.BLUR, this.aoPerderFoco);
        app.renderer.getCanvas().style.cursor = "";
        // a câmera é a mesma em todas as stages: volta ao tamanho da tela
        const camera = app.viewport;
        camera.offset.set(0, 0);
        camera.setBounds(0, 0, CONFIG.largura, CONFIG.altura);
        camera.moveTo(0, 0);
        this.camera = null;
        this.facho = null;
        this.diretor = null;
        this.energia = null;
        this.painel?.desligar();
        this.painel?.destroy();
        this.painel = null;
        this.kraken?.destruir();
        this.kraken = null;
        this.movimentoDaCamera = null;
    }

    // Vida da torre: cheia (60 + 10 por peça) ao começar a Fase 2; na etapa
    // do Kraken ela vem do ponto de retorno. O ponto é salvo de novo aqui,
    // porque FaseBase salva antes de montar.
    prepararTorre() {
        if (this.etapa === "fase2" || partida.vidaTorreMax <= 0) {
            partida.vidaTorreMax = TORRE.vidaBase + TORRE.vidaPorPeca * partida.pecas;
            partida.vidaTorre = partida.vidaTorreMax;
        }
        if (this.etapa === "fase2") {
            partida.nivelLanterna = 0;
            partida.melhorias = {};
            partida.energia = 0;
            partida.nivelEnergia = 0;
        }
        salvarPontoDeRetorno(this.etapa);
    }

    espalharVagalumes(particulas) {
        let tentativas = 0;
        while (particulas.vagalumes.length < MAR.vagalumes && tentativas < 400) {
            tentativas++;
            const x = 120 + Math.random() * 400;
            const y = 190 + Math.random() * 230;
            // na grama, longe da areia e do farol
            const longeDoFarol = Math.hypot(x - 320, y - 300) > 60;
            if (longeDoFarol && naIlha(x, y) && naIlha(x + 14, y) && naIlha(x - 14, y) && naIlha(x, y + 12) && naIlha(x, y - 12)) {
                particulas.vagalumes.push({
                    cx: x,
                    cy: y,
                    fases: [0, 1, 2, 3, 4].map(() => Math.random() * Math.PI * 2),
                });
            }
        }
    }

    // ---- entrada --------------------------------------------------------------

    aoTeclar(_acao, codigo) {
        if (codigo === input.KEY.SPACE) {
            this.espaco = true;
        }
    }

    aoSoltarTecla(_acao, codigo) {
        if (codigo === input.KEY.SPACE) {
            this.espaco = false;
        }
    }

    aoPerderFoco() {
        this.espaco = false;
    }

    // ---- quadro ---------------------------------------------------------------

    // O painel de melhorias segura a pausa do MelonJS e termina a escolha
    // antes de a base olhar a pausa.
    update(dt) {
        this.painel?.atualizar(dt);
        return super.update(dt);
    }

    atualizarFase(dt) {
        if (this.apagou || this.facho === null) {
            return;
        }
        const ms = Math.min(dt, DT_MAXIMO);
        const s = ms / 1000;
        this.atualizarCamera(ms);

        // o mouse vem em pixels da tela (src/ui/entrada.js): soma a câmera
        if (ponteiro.x >= 0) {
            this.facho.mirar(ponteiro.x + this.camera.pos.x, ponteiro.y + this.camera.pos.y);
        }
        this.tracarTentaculos();
        this.facho.atualizar(s, (ponteiro.apertado && !this.botaoDoAtaque) || this.espaco);
        this.diretor.atualizar(s);
        this.kraken?.atualizar(s);
        this.energia.atualizar(s);
        this.atualizarConserto(s);
        this.brilhoDaMelhoria = Math.max(0, this.brilhoDaMelhoria - s / 1.2);

        // barra de energia cheia: o jogo para e abre a escolha
        if (this.energia.cheia && !this.apagou && !this.kraken?.derrotado) {
            this.painel.abrir(sortearCartas());
        }
    }

    // Repassa o botão do mouse ao ataque em curso que o aceita (os
    // tentáculos), em pixels do mundo: o aperto vai ao ataque quando
    // consomeBotao diz que é dele, e aí o botão fica com o ataque (sem
    // disparar) até ser solto. Soltar em qualquer lugar (entrada.js ouve a
    // janela) ou levar o cursor para fora da tela zera o traço.
    tracarTentaculos() {
        const apertado = ponteiro.apertado;
        const ataque = this.kraken?.ataque ?? null;
        const traco = typeof ataque?.consomeBotao === "function" ? ataque : null;
        const x = ponteiro.x + this.camera.pos.x;
        const y = ponteiro.y + this.camera.pos.y;
        const naTela = ponteiro.x >= 0 && ponteiro.x <= CONFIG.largura && ponteiro.y >= 0 && ponteiro.y <= CONFIG.altura;
        if (apertado && !this.botaoAntes) {
            this.botaoDoAtaque = traco !== null && naTela && traco.consomeBotao(x, y);
            if (this.botaoDoAtaque) {
                traco.apertarPonteiro(x, y);
            }
        } else if (!apertado && this.botaoAntes) {
            if (this.botaoDoAtaque && traco !== null) {
                // o último trecho antes de soltar ainda conta
                if (naTela) {
                    traco.moverPonteiro(x, y);
                }
                traco.soltarPonteiro();
            }
            this.botaoDoAtaque = false;
        } else if (apertado && this.botaoDoAtaque && traco !== null) {
            if (naTela) {
                traco.moverPonteiro(x, y);
            } else {
                traco.soltarPonteiro();
            }
        }
        this.botaoAntes = apertado;
    }

    // O anel de luz do conserto vai se apagando
    atualizarConserto(s) {
        this.brilhoDoConserto = Math.max(0, this.brilhoDoConserto - s / 1.4);
    }

    curarPorChefe() {
        if (this.apagou || partida.vidaTorre <= 0) {
            return;
        }
        partida.vidaTorre = Math.min(partida.vidaTorreMax, partida.vidaTorre + partida.vidaTorreMax * MINI_CHEFE.cura);
        this.brilhoDoConserto = 1;
        efeito("conserto");
    }

    // HUD comum e, por cima, a barra de vida do Kraken.
    desenharHud(renderer) {
        super.desenharHud(renderer);
        this.kraken?.desenharHud(renderer);
        this.painel?.desenhar(renderer);
    }

    // Retângulo do mundo que a câmera mostra agora (sem o tremor).
    vista() {
        const v = this.retanguloDaVista;
        if (this.camera !== null) {
            v.x = this.camera.pos.x;
            v.y = this.camera.pos.y;
        }
        return v;
    }

    // Leva a câmera até o topo `yTopo` (CAMERA.yNormal ou CAMERA.yKraken) em
    // `ms` milissegundos, entrando e saindo devagar.
    moverCamera(yTopo, ms = 1200, aoTerminar = null) {
        if (this.camera === null) {
            return;
        }
        const alvo = Math.max(0, Math.min(MUNDO.altura - CONFIG.altura, yTopo));
        if (ms <= 0) {
            this.camera.moveTo(0, alvo);
            this.movimentoDaCamera = null;
            aoTerminar?.();
            return;
        }
        this.movimentoDaCamera = { de: this.camera.pos.y, para: alvo, tempo: 0, duracao: ms, aoTerminar };
    }

    atualizarCamera(ms) {
        const m = this.movimentoDaCamera;
        if (m === null) {
            return;
        }
        m.tempo += ms;
        const t = Math.min(1, m.tempo / m.duracao);
        this.camera.moveTo(0, Math.round(m.de + (m.para - m.de) * suavizar(t)));
        if (t >= 1) {
            this.movimentoDaCamera = null;
            m.aoTerminar?.();
        }
    }

    tremer(intensidade, ms) {
        this.camera?.shake(intensidade, ms);
    }

    avisar(texto, duracao) {
        this.hud?.avisar(texto, duracao);
    }

    // ---- torre e lanterna ------------------------------------------------------

    // Um monstro (ou o Kraken) tirou `dano` de vida da torre.
    danificarTorre(dano, _origem = null) {
        if (this.apagou) {
            return;
        }
        if (partida.invencivel) {
            this.hud?.piscarDano();
            return;
        }
        partida.vidaTorre = Math.max(0, partida.vidaTorre - dano);
        this.hud?.piscarDano();
        this.tremer(TORRE.tremorIntensidade, TORRE.tremorMs);
        efeito("dano");
        if (partida.vidaTorre <= 0) {
            this.apagou = true;
            relogio.parar();
            perder("O farol apagou");
        }
    }

    // A engrenagem de um mini-chefe chegou ao farol.
    melhorarLanterna() {
        efeito("engrenagem");
        partida.estatisticas.engrenagens++;
        if (partida.nivelLanterna >= NIVEL_MAXIMO) {
            this.avisar("Lanterna no máximo!");
            return;
        }
        partida.nivelLanterna++;
        this.facho?.realcar();
        this.hud?.acenderEngrenagem();
        this.avisar("Lanterna melhorou!");
    }

    // ---- energia e melhorias ------------------------------------------------

    // Um monstro morreu pelo facho em (x, y): faíscas de energia (o diretor chama).
    soltarEnergia(x, y, chefe = false) {
        this.energia?.soltar(x, y, chefe);
    }

    // O jogador escolheu a melhoria `id` no painel: gasta a barra, aplica,
    // e o farol brilha.
    escolherMelhoria(id) {
        partida.energia = Math.max(0, partida.energia - capacidadeDaEnergia());
        partida.nivelEnergia++;
        aplicarMelhoria(id);
        this.facho?.realcar();
        this.brilhoDaMelhoria = 1;
        emitirEstrelinhas(FAROL.x, FAROL.y, 10);
        this.hud?.acenderMelhoria(id);
        this.avisar(`${melhoria(id).nome}!`);
    }

    // ---- relógio --------------------------------------------------------------

    // Às 5h o Kraken acorda: param as ondas comuns, a câmera sobe e ele sai
    // da água (src/fase2/kraken/Kraken.js). Um Kraken novo a cada vez: o
    // "Tentar de novo" volta às 5h com a vida e o estado dele zerados.
    iniciarKraken() {
        if (this.krakenIniciado || this.app === null) {
            return;
        }
        this.krakenIniciado = true;
        if (this.diretor !== null) {
            this.diretor.ativo = false;
        }
        this.kraken = new Kraken(this);
        this.app.world.addChild(new CamadaKraken(this.kraken), Z.kraken);
        this.kraken.iniciar();
        this.avisar("O Kraken desperta!");
    }

    aoMudarHora({ minutos }) {
        if (minutos < minutosDe(6)) {
            efeito("hora");
        }
        if (minutos === minutosDe(5)) {
            this.entrarNaEtapa("kraken");
            this.iniciarKraken();
        } else if (minutos >= minutosDe(6)) {
            // a vitória vem quando o Kraken afunda (o relógio para nessa
            // hora); se der 6h com ele vivo, a noite venceu
            if (this.kraken?.derrotado) {
                return;
            }
            this.apagou = true;
            relogio.parar();
            perder("A noite venceu");
        }
    }

    aoPularTempo() {
        // o modo de teste pode pular para antes ou depois das 5h
        const etapa = relogio.minutos() >= minutosDe(5) ? "kraken" : "fase2";
        if (etapa !== this.etapa) {
            this.entrarNaEtapa(etapa);
        }
        if (etapa === "kraken") {
            this.iniciarKraken();
        }
    }
}
