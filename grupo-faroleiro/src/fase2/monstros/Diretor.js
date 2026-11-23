import { loader } from "melonjs";
import { pintar } from "../../entities/folha.js";
import { imagem } from "../../systems/estilo.js";
import { emitirEstrelinhas, emitirFaiscas } from "../../systems/particulas.js";
import { partida } from "../../systems/partida.js";
import { relogio } from "../../systems/relogio.js";
import { efeito } from "../../systems/som.js";
import { DEPOIS_DAS_MELHORIAS, ENGRENAGEM, FAROL, MINI_CHEFE, MONSTROS, ONDAS, PRIMEIRA_ONDA } from "../config.js";
import { coresDaFase2 } from "../cores.js";
import { distanciaDaCosta } from "../ilha.js";
import { tempoDeQueima } from "../melhorias.js";
import { RESPINGO, desenharQuadro, folhaDoMar } from "./folha.js";
import { Morcego } from "./Morcego.js";
import { Piranha } from "./Piranha.js";
import { Serpente } from "./Serpente.js";

// Diretor dos monstros da Fase 2: faz nascer as ondas de cada hora (tabela
// ONDAS em src/fase2/config.js), os mini-chefes das 1h às 4h, aplica os
// disparos do facho, avisa a fase quando um monstro chega à torre e solta a
// engrenagem do mini-chefe. Também desenha os monstros, os respingos e as
// engrenagens (as camadas de src/fase2/camadas.js chamam).
//
// API para o Kraken (tarefa 8):
//   diretor.ativo = false        para as ondas comuns (os vivos continuam)
//   diretor.lista                monstros (vivos e morrendo)
//   diretor.vivos()              quantos estão vivos
//   diretor.criar(tipo, { chefe, x, y, angulo })   um monstro já no mundo
//   diretor.surgirPiranhas(n, angulo?)            um grupo vindo do mar
//   diretor.surgir(tipo)         um monstro comum do tipo, como nas ondas
//   diretor.matarTodos()         todos morrem (com efeito, sem estatística)
//   diretor.aoMatar              função (monstro) chamada a cada morte pelo facho
//
// Cada morte pelo facho solta faíscas de energia (fase.soltarEnergia); o
// Facho duplo acerta com a força dele (facho.forcaEm) e a Luz que queima
// deixa lento quem o disparo toca.

// respingo: duração (s)
const RESPINGO_DURACAO = 0.42;
// intervalo mínimo entre dois sons de morte (s)
const SOM_DE_MORTE = 0.07;
// ícone da engrenagem na folha de itens (16×16, 8 colunas)
const ICONE_ENGRENAGEM = 4;
const ICONE = 16;

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

function sortearInteiro(min, max) {
    return Math.floor(sortear(min, max + 1));
}

// Sorteia uma chave de `pesos` ({ tipo: peso }).
function sortearPeso(pesos) {
    let total = 0;
    for (const tipo in pesos) {
        total += pesos[tipo];
    }
    let r = Math.random() * total;
    for (const tipo in pesos) {
        r -= pesos[tipo];
        if (r < 0) {
            return tipo;
        }
    }
    return "morcego";
}

const CLASSES = { morcego: Morcego, piranha: Piranha, serpente: Serpente };
const PONTO = { x: 0, y: 0 };

export class Diretor {
    // fase: a Fase2Stage (vista(), facho, danificarTorre, melhorarLanterna, avisar)
    constructor(fase) {
        this.fase = fase;
        this.lista = [];
        this.respingos = [];
        this.engrenagens = [];
        this.ativo = true;
        this.espera = PRIMEIRA_ONDA;
        // próximo mini-chefe: segundos até ele e quantos já vieram
        this.esperaDoMiniChefe = MINI_CHEFE.intervalo;
        this.miniChefesVindos = 0;
        this.somDeMorte = 0;
        this.aoMatar = null;
        this.tempo = 0;
    }

    // linha da tabela ONDAS da hora atual (0h a 4h; depois fica na 4h)
    get onda() {
        const hora = relogio.hora();
        const i = hora >= 0 && hora < ONDAS.length ? hora : ONDAS.length - 1;
        return ONDAS[i];
    }

    // Intervalo [mínimo, máximo] e máximo de vivos da linha `onda`, já com o
    // aperto de DEPOIS_DAS_MELHORIAS quando o jogador somou melhorias demais.
    ondaEfetiva(onda) {
        let escolhidas = 0;
        for (const id in partida.melhorias) {
            escolhidas += partida.melhorias[id];
        }
        if (escolhidas < DEPOIS_DAS_MELHORIAS.quantas) {
            return { intervalo: onda.intervalo, maximo: onda.maximo };
        }
        const k = DEPOIS_DAS_MELHORIAS.intervalo;
        return {
            intervalo: [onda.intervalo[0] * k, onda.intervalo[1] * k],
            maximo: Math.ceil(onda.maximo * DEPOIS_DAS_MELHORIAS.maximo),
        };
    }

    vivos() {
        let n = 0;
        for (const m of this.lista) {
            if (m.vivo) {
                n++;
            }
        }
        return n;
    }

    temChefe() {
        return this.lista.some((m) => m.chefe && m.vivo);
    }

    // ---- nascimento -------------------------------------------------------

    criar(tipo, { chefe = false, x = 0, y = 0, angulo } = {}) {
        const Classe = CLASSES[tipo];
        if (Classe === undefined) {
            throw new Error(`diretor: monstro desconhecido "${tipo}"`);
        }
        const m = new Classe({ chefe });
        m.colocar(x, y, angulo);
        this.lista.push(m);
        return m;
    }

    // Um monstro comum do tipo, nascendo como nas ondas.
    surgir(tipo, chefe = false) {
        if (tipo === "morcego") {
            return [this.surgirMorcego(chefe)];
        }
        if (tipo === "piranha") {
            const linha = MONSTROS.piranha.grupo[Math.min(relogio.hora(), MONSTROS.piranha.grupo.length - 1)] ?? [3, 3];
            return this.surgirPiranhas(chefe ? 1 : sortearInteiro(linha[0], linha[1]), undefined, chefe);
        }
        return [this.surgirSerpente(chefe)];
    }

    // Morcego numa borda da vista, um pouco para fora.
    surgirMorcego(chefe = false) {
        const v = this.fase.vista();
        const margem = chefe ? 30 : 16;
        const perimetro = 2 * (v.largura + v.altura);
        let r = Math.random() * perimetro;
        let x;
        let y;
        if (r < v.largura) {
            x = v.x + r;
            y = v.y - margem;
        } else if ((r -= v.largura) < v.altura) {
            x = v.x + v.largura + margem;
            y = v.y + r;
        } else if ((r -= v.altura) < v.largura) {
            x = v.x + v.largura - r;
            y = v.y + v.altura + margem;
        } else {
            r -= v.largura;
            x = v.x - margem;
            y = v.y + v.altura - r;
        }
        return this.criar("morcego", { chefe, x, y });
    }

    // Grupo de piranhas surgindo do mar numa direção (radianos a partir do farol).
    surgirPiranhas(quantidade, angulo, chefe = false) {
        const dados = MONSTROS.piranha;
        const v = this.fase.vista();
        let direcao = angulo;
        let distancia = 0;
        // procura uma direção com mar suficiente dentro da vista
        for (let tentativa = 0; tentativa < 12; tentativa++) {
            const a = direcao ?? Math.random() * Math.PI * 2;
            const costa = distanciaDaCosta(a);
            const limite = this.distanciaAteABorda(a, v) - 14;
            const desejada = costa + sortear(dados.distanciaDoMar[0], dados.distanciaDoMar[1]);
            distancia = Math.min(desejada, limite);
            if (distancia >= costa + 28) {
                direcao = a;
                break;
            }
            direcao = undefined;
        }
        if (direcao === undefined) {
            return [];
        }
        const grupo = [];
        // grupos de mais de 5 (cardume do Kraken) abrem o leque na proporção,
        // para não nascerem empilhados
        const abrir = Math.max(1, Math.sqrt(quantidade / 5));
        const espalhar = (dados.espalhamentoAngulo * abrir * Math.PI) / 180;
        const fundo = dados.espalhamentoDistancia * abrir;
        for (let i = 0; i < quantidade; i++) {
            const a = direcao + (i === 0 ? 0 : sortear(-espalhar, espalhar) / 2);
            const d = distancia - (i === 0 ? 0 : sortear(0, fundo));
            const x = FAROL.x + Math.cos(a) * Math.max(d, distanciaDaCosta(a) + 16);
            const y = FAROL.y + Math.sin(a) * Math.max(d, distanciaDaCosta(a) + 16);
            const m = new Piranha({ chefe }, i * 0.14);
            m.colocar(x, y);
            this.lista.push(m);
            grupo.push(m);
        }
        efeito("respingo");
        return grupo;
    }

    // distância do farol até a borda da vista na direção a
    distanciaAteABorda(a, v) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        let t = Infinity;
        if (c > 0.0001) {
            t = Math.min(t, (v.x + v.largura - FAROL.x) / c);
        } else if (c < -0.0001) {
            t = Math.min(t, (v.x - FAROL.x) / c);
        }
        if (s > 0.0001) {
            t = Math.min(t, (v.y + v.altura - FAROL.y) / s);
        } else if (s < -0.0001) {
            t = Math.min(t, (v.y - FAROL.y) / s);
        }
        return t;
    }

    surgirSerpente(chefe = false) {
        const m = new Serpente({ chefe });
        m.colocarNaVolta(Math.random() * Math.PI * 2);
        this.lista.push(m);
        return m;
    }

    // Próximo mini-chefe da fila `MINI_CHEFE.tipos`; null se já vieram todos.
    surgirMiniChefe() {
        const tipo = MINI_CHEFE.tipos[this.miniChefesVindos];
        if (tipo === undefined) {
            return null;
        }
        this.miniChefesVindos++;
        const [chefe] = this.surgir(tipo, true);
        return chefe ?? null;
    }

    // ---- quadro -------------------------------------------------------------

    // dt em segundos
    atualizar(dt) {
        this.tempo += dt;
        this.somDeMorte = Math.max(0, this.somDeMorte - dt);

        if (this.ativo) {
            // mini-chefe a cada MINI_CHEFE.intervalo s de jogo, até acabarem
            this.esperaDoMiniChefe -= dt;
            if (this.esperaDoMiniChefe <= 0) {
                this.esperaDoMiniChefe += MINI_CHEFE.intervalo;
                if (this.surgirMiniChefe()) {
                    this.fase.avisar("Mini-chefe à vista!");
                }
            }
            this.espera -= dt;
            if (this.espera <= 0) {
                const onda = this.onda;
                const efetiva = this.ondaEfetiva(onda);
                if (this.vivos() < efetiva.maximo) {
                    this.surgir(sortearPeso(onda.pesos));
                }
                const fator = this.temChefe() ? MINI_CHEFE.intervaloComChefe : 1;
                this.espera = sortear(efetiva.intervalo[0], efetiva.intervalo[1]) * fator;
            }
        }

        for (const m of this.lista) {
            m.atualizar(dt, this);
        }
        this.aplicarFacho();

        // tira os que acabaram (sem criar array novo)
        let j = 0;
        for (let i = 0; i < this.lista.length; i++) {
            const m = this.lista[i];
            if (!m.removido) {
                this.lista[j++] = m;
            }
        }
        this.lista.length = j;

        for (let i = this.respingos.length - 1; i >= 0; i--) {
            const r = this.respingos[i];
            r.t += dt;
            if (r.t >= RESPINGO_DURACAO) {
                this.respingos.splice(i, 1);
            }
        }
        this.atualizarEngrenagens(dt);
    }

    // o disparo acerta cada monstro uma vez (com a força do facho que o toca)
    aplicarFacho() {
        const facho = this.fase.facho;
        if (facho === null || !facho.disparando) {
            return;
        }
        const queima = tempoDeQueima();
        for (const m of this.lista) {
            if (!m.vivo || !m.atingivel || m.ultimoDisparo === facho.disparoId) {
                continue;
            }
            const forca = facho.forcaEm(m.x, m.yCorpo, m.raio);
            if (forca > 0) {
                m.ultimoDisparo = facho.disparoId;
                if (m.levarDano(facho.dano * forca)) {
                    this.matou(m);
                } else {
                    emitirFaiscas(m.x, m.yCorpo, m.chefe ? 5 : 3);
                    if (queima > 0) {
                        m.queimar(queima);
                    }
                }
            }
        }
    }

    matou(m) {
        partida.estatisticas.monstros++;
        emitirFaiscas(m.x, m.yCorpo, m.chefe ? 24 : 9);
        if (m.chefe) {
            efeito("explosao");
            this.fase.tremer(3, 260);
            this.soltarEngrenagem(m.x, m.yCorpo);
            this.fase.curarPorChefe?.();
        } else if (this.somDeMorte <= 0) {
            efeito("lanternaDesliga");
            this.somDeMorte = SOM_DE_MORTE;
        }
        this.fase.soltarEnergia?.(m.x, m.yCorpo, m.chefe);
        this.aoMatar?.(m);
    }

    // Um monstro comum chegou à torre: dano e some num estouro.
    chegouNaTorre(m) {
        this.danificarTorre(m.dano, m);
        m.morrer();
        emitirFaiscas(m.x, m.yCorpo, 6);
        if (m.tipo === "piranha") {
            this.respingo(m.x, m.y, 0.7);
        }
    }

    danificarTorre(dano, monstro) {
        this.fase.danificarTorre(dano, monstro);
    }

    respingo(x, y, escala = 1) {
        this.respingos.push({ x, y, escala, t: 0 });
    }

    // Todos morrem com efeito (sem contar nas estatísticas).
    matarTodos() {
        for (const m of this.lista) {
            if (m.vivo) {
                m.morrer();
                emitirFaiscas(m.x, m.yCorpo, 4);
            }
        }
    }

    // ---- engrenagem ---------------------------------------------------------

    soltarEngrenagem(x, y) {
        this.engrenagens.push({ x0: x, y0: y, x, y, t: 0 });
    }

    atualizarEngrenagens(dt) {
        for (let i = this.engrenagens.length - 1; i >= 0; i--) {
            const e = this.engrenagens[i];
            e.t += dt;
            const t = Math.min(1, e.t / ENGRENAGEM.duracao);
            // sai devagar, acelera no fim
            const k = t * t * (3 - 2 * t);
            e.x = e.x0 + (FAROL.x - e.x0) * k;
            e.y = e.y0 + (FAROL.y - e.y0) * k - Math.sin(t * Math.PI) * ENGRENAGEM.alturaDoArco;
            if (Math.random() < dt * 18) {
                emitirEstrelinhas(e.x, e.y, 1);
            }
            if (t >= 1) {
                this.engrenagens.splice(i, 1);
                emitirFaiscas(FAROL.x, FAROL.y, 16);
                emitirEstrelinhas(FAROL.x, FAROL.y, 8);
                this.fase.melhorarLanterna();
            }
        }
    }

    // ---- desenho ------------------------------------------------------------

    // Embaixo da noite: sombras, respingos, quem nada ou anda e, por cima,
    // quem voa ou salta. Os mini-chefes ficam para desenharChefes.
    desenharMonstros(renderer) {
        const img = folhaDoMar();
        for (const m of this.lista) {
            if (!m.chefe) {
                m.desenharSombra(renderer, img);
            }
        }
        for (const r of this.respingos) {
            const i = Math.min(RESPINGO.length - 1, Math.floor((r.t / RESPINGO_DURACAO) * RESPINGO.length));
            desenharQuadro(renderer, img, RESPINGO[i], r.x, r.y, 0, r.escala, 1 - (r.t / RESPINGO_DURACAO) * 0.5);
        }
        for (const m of this.lista) {
            if (!m.chefe && !m.voando) {
                m.desenhar(renderer, img);
            }
        }
        for (const m of this.lista) {
            if (!m.chefe && m.voando) {
                m.desenhar(renderer, img);
            }
        }
    }

    // Por cima da noite: os mini-chefes com halo e contorno claro.
    desenharChefes(renderer) {
        const img = folhaDoMar();
        const cores = coresDaFase2();
        for (const m of this.lista) {
            if (!m.chefe || m.removido) {
                continue;
            }
            const fim = m.morrendo ? Math.max(0, 1 - m.tempoMorte / 0.42) : 1;
            m.desenharSombra(renderer, img);
            m.posicaoDoDesenho(PONTO);
            // halo pulsando (aditivo, em degraus)
            const pulso = 1 + Math.sin(this.tempo * 5) * 0.08;
            renderer.save();
            renderer.setBlendMode("additive");
            renderer.setColor(cores.haloChefe);
            for (let i = 0; i < 3; i++) {
                const r = MINI_CHEFE.haloRaio * pulso * (1 - i * 0.25);
                renderer.setGlobalAlpha(0.09 * fim * m.alfa);
                renderer.fillEllipse(Math.round(PONTO.x), Math.round(PONTO.y), r, r);
            }
            renderer.setBlendMode("normal");
            renderer.restore();
            // contorno: a silhueta clara (quadro de dano) deslocada nos 4 lados
            const escala = m.escala * (1 + m.escalaExtra);
            const largura = MINI_CHEFE.contornoLargura * m.escala;
            if (!m.morrendo) {
                const alfa = m.alfa * (0.75 + Math.sin(this.tempo * 6) * 0.25);
                const dano = m.quadros.dano;
                desenharQuadro(renderer, img, dano, PONTO.x - largura, PONTO.y, m.angulo, escala, alfa);
                desenharQuadro(renderer, img, dano, PONTO.x + largura, PONTO.y, m.angulo, escala, alfa);
                desenharQuadro(renderer, img, dano, PONTO.x, PONTO.y - largura, m.angulo, escala, alfa);
                desenharQuadro(renderer, img, dano, PONTO.x, PONTO.y + largura, m.angulo, escala, alfa);
            }
            m.desenhar(renderer, img);
        }
    }

    // Barras de vida acima dos mini-chefes (por cima do topo do farol).
    desenharBarrasDosChefes(renderer) {
        const cores = coresDaFase2();
        for (const m of this.lista) {
            if (m.chefe && !m.morrendo && !m.removido && m.atingivel) {
                m.posicaoDoDesenho(PONTO);
                const w = MINI_CHEFE.barraLargura;
                const h = MINI_CHEFE.barraAltura;
                const x = Math.round(PONTO.x - w / 2);
                const y = Math.round(PONTO.y - MINI_CHEFE.barraAcima);
                pintar(renderer, cores.noite, x - 1, y - 1, w + 2, h + 2, 0.85);
                const vida = Math.max(0, Math.round((w * m.vida) / m.vidaMaxima));
                if (vida > 0) {
                    pintar(renderer, cores.vidaChefe, x, y, vida, h);
                    pintar(renderer, cores.fachoMiolo, x, y, vida, 1, 0.4);
                }
            }
        }
    }

    // Engrenagens voando até o farol, girando, com brilho.
    desenharEngrenagens(renderer) {
        if (this.engrenagens.length === 0) {
            return;
        }
        const itens = loader.getImage(imagem("itens"));
        const cores = coresDaFase2();
        for (const e of this.engrenagens) {
            renderer.save();
            renderer.setBlendMode("additive");
            renderer.setColor(cores.engrenagem);
            renderer.setGlobalAlpha(0.25);
            renderer.fillEllipse(Math.round(e.x), Math.round(e.y), 12, 12);
            renderer.setGlobalAlpha(0.3);
            renderer.fillEllipse(Math.round(e.x), Math.round(e.y), 7, 7);
            renderer.setBlendMode("normal");
            renderer.restore();
            renderer.save();
            renderer.translate(Math.round(e.x), Math.round(e.y));
            renderer.rotate(e.t * ENGRENAGEM.giro);
            renderer.drawImage(
                itens,
                (ICONE_ENGRENAGEM % 8) * ICONE,
                Math.floor(ICONE_ENGRENAGEM / 8) * ICONE,
                ICONE,
                ICONE,
                -ICONE / 2,
                -ICONE / 2,
                ICONE,
                ICONE,
            );
            renderer.restore();
        }
    }
}
