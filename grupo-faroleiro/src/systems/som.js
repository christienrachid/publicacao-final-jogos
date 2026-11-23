import { MUSICAS } from "./musicas.js";
import { salvarVolumeEfeitos, salvarVolumeMusica, volumeEfeitos, volumeMusica } from "./opcoes.js";
import { MUSICA_DA_PAUSA, TRILHA_DA_MUSICA, TRILHAS } from "./trilhas.js";

// Efeitos e músicas de reserva gerados por WebAudio. É um sintetizador chiptune pequeno: ondas de
// pulso (12,5%, 25% e 50%), triângulo e ruído, tocadas por um sequenciador
// com as partituras de src/systems/musicas.js.
//
// As músicas do menu e das fases tocam de trilhas gravadas (arquivos em
// public/data/audio/, escolhidas em src/systems/trilhas.js). A sintetizada
// toca no lugar de uma trilha só se o arquivo não carregar, e na pausa.
//
// O contexto de áudio só nasce no primeiro clique ou tecla (regra dos
// navegadores). Antes disso, tocarMusica só guarda o pedido e efeito não faz
// nada; a música pedida começa assim que o contexto existe.
//
// Caminho do som:
//   faixa de música → barramento da música → filtro da pausa ┐
//   efeito ─────────→ barramento dos efeitos ────────────────┴→ compressor → saída

// ---------------------------------------------------------------------------
// Ajustes gerais

// troca de música: fade de saída e de entrada, em segundos
const FADE_MUSICA = 0.5;
// pausa: corte do filtro passa-baixa (Hz) e fração do volume da música
const PAUSA_CORTE = 650;
const PAUSA_VOLUME = 0.55;
const SEM_CORTE = 20000;
// sequenciador: de quanto em quanto tempo agenda (ms) e quanto adiante (s)
const INTERVALO_AGENDA = 25;
const ANTECEDENCIA = 0.15;
// com a aba escondida o navegador atrasa os timers: se o agendamento ficar
// mais atrasado que isto (s), a música pula para agora em vez de despejar
// as notas perdidas de uma vez
const ATRASO_MAXIMO = 0.25;
// curva do volume: o ouvido sente o volume mais ou menos ao quadrado
const curva = (v) => v * v;

// ---------------------------------------------------------------------------
// Timbres das músicas: onda, volume e envelope (segundos). sustentacao é a
// fração do volume que fica enquanto a nota dura; vibrato é a profundidade
// (fração da frequência); legato é a fração do passo que a nota ocupa.
const TIMBRES = {
    canto: { onda: "pulso25", volume: 0.15, ataque: 0.02, decaimento: 0.25, sustentacao: 0.6, soltura: 0.25, vibrato: 0.007, legato: 0.95 },
    heroi: { onda: "pulso50", volume: 0.13, ataque: 0.008, decaimento: 0.12, sustentacao: 0.65, soltura: 0.06, vibrato: 0.005, legato: 0.9 },
    dobra: { onda: "pulso12", volume: 0.06, ataque: 0.008, decaimento: 0.1, sustentacao: 0.6, soltura: 0.05, vibrato: 0.004, legato: 0.9 },
    fantasma: { onda: "pulso25", volume: 0.13, ataque: 0.01, decaimento: 0.2, sustentacao: 0.6, soltura: 0.1, vibrato: 0.012, legato: 0.92 },
    sombra: { onda: "pulso12", volume: 0.14, ataque: 0.04, decaimento: 0.4, sustentacao: 0.55, soltura: 0.35, vibrato: 0.01, legato: 0.95 },
    brilho: { onda: "pulso12", volume: 0.045, ataque: 0.005, decaimento: 0.2, sustentacao: 0.25, soltura: 0.15, legato: 0.9 },
    arpejo: { onda: "pulso12", volume: 0.05, ataque: 0.003, decaimento: 0.06, sustentacao: 0.3, soltura: 0.03, legato: 0.8 },
    tremolo: { onda: "pulso25", volume: 0.035, ataque: 0.003, decaimento: 0.05, sustentacao: 0.5, soltura: 0.02, legato: 0.7 },
    baixo: { onda: "triangulo", volume: 0.3, ataque: 0.004, decaimento: 0.08, sustentacao: 0.8, soltura: 0.04, legato: 0.85 },
    baixoMacio: { onda: "triangulo", volume: 0.26, ataque: 0.03, decaimento: 0.3, sustentacao: 0.75, soltura: 0.3, legato: 0.97 },
};

// ---------------------------------------------------------------------------
// Notas e acordes

const CLASSES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACIDENTES = { "": 0, "#": 1, b: -1 };

// intervalos de cada tipo de acorde, em semitons
const QUALIDADES = {
    "": [0, 4, 7],
    m: [0, 3, 7],
    7: [0, 4, 7, 10],
    m7: [0, 3, 7, 10],
    maj7: [0, 4, 7, 11],
    sus4: [0, 5, 7],
    sus2: [0, 2, 7],
    dim: [0, 3, 6],
};

// graus fixos do baixo (os outros vêm do acorde)
const GRAUS_FIXOS = { 1: 0, b2: 1, 2: 2, 4: 5, b6: 8, 6: 9, 8: 12 };

function frequencia(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// "F#5" → 78
function midiDaNota(nome) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(nome);
    if (m === null) {
        throw new Error(`som: nota inválida "${nome}"`);
    }
    return 12 * (Number(m[3]) + 1) + CLASSES[m[1]] + ACIDENTES[m[2]];
}

// "F#m7" → { raiz: 6, intervalos: [0, 3, 7, 10] }
function lerAcorde(nome) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(nome);
    const intervalos = m === null ? undefined : QUALIDADES[m[3]];
    if (intervalos === undefined) {
        throw new Error(`som: acorde inválido "${nome}"`);
    }
    return { raiz: (CLASSES[m[1]] + ACIDENTES[m[2]] + 12) % 12, intervalos };
}

// "E5:4 .:2 | A4" → [["E5", 4], [".", 2], ["A4", 1]]
function lerTokens(texto, padrao = 1) {
    const tokens = [];
    for (const parte of texto.split(/\s+/)) {
        if (parte === "" || parte === "|") {
            continue;
        }
        const [valor, passos] = parte.split(":");
        tokens.push([valor, passos === undefined ? padrao : Number(passos)]);
    }
    return tokens;
}

// Semitons de um grau do baixo acima da fundamental do acorde.
function semitonsDoGrau(grau, acorde) {
    const m = /^(b?\d)(['",]*)$/.exec(grau);
    if (m === null) {
        throw new Error(`som: grau inválido "${grau}"`);
    }
    let base;
    const [, nome, marcas] = m;
    if (nome === "3") {
        base = acorde.intervalos[1];
    } else if (nome === "5") {
        base = acorde.intervalos[2];
    } else if (nome === "7") {
        base = acorde.intervalos[3] ?? 12;
    } else if (Object.hasOwn(GRAUS_FIXOS, nome)) {
        base = GRAUS_FIXOS[nome];
    } else {
        throw new Error(`som: grau inválido "${grau}"`);
    }
    for (const marca of marcas) {
        base += marca === "," ? -12 : 12;
    }
    return base;
}

// Monta a lista de eventos por passo de uma música (uma vez por música).
function compilar(musica) {
    // acordes: um por passo
    const acordes = [];
    for (const [nome, passos] of lerTokens(musica.acordes, 16)) {
        const acorde = lerAcorde(nome);
        for (let i = 0; i < passos; i++) {
            acordes.push(acorde);
        }
    }
    const total = acordes.length;
    const passos = Array.from({ length: total }, () => []);

    for (const canal of musica.canais) {
        if (canal.tipo === "melodia") {
            const tokens = lerTokens(canal.notas);
            let p = 0;
            while (p < total) {
                for (const [valor, duracao] of tokens) {
                    if (p >= total) {
                        break;
                    }
                    if (valor !== ".") {
                        const midi = midiDaNota(valor) + (canal.transpor ?? 0);
                        passos[p].push({ timbre: canal.timbre, eco: canal.eco === true, freq: frequencia(midi), passos: duracao });
                    }
                    p += duracao;
                }
            }
        } else if (canal.tipo === "baixo" || canal.tipo === "arpejo") {
            const tokens = lerTokens(canal.padrao);
            const base = 12 * (canal.oitava + 1);
            let p = 0;
            while (p < total) {
                for (const [valor, duracao] of tokens) {
                    if (p >= total) {
                        break;
                    }
                    if (valor !== ".") {
                        const acorde = acordes[p];
                        let semitons;
                        if (canal.tipo === "baixo") {
                            semitons = semitonsDoGrau(valor, acorde);
                        } else {
                            const i = Number(valor);
                            const n = acorde.intervalos.length;
                            semitons = acorde.intervalos[i % n] + 12 * Math.floor(i / n);
                        }
                        const midi = base + acorde.raiz + semitons;
                        passos[p].push({ timbre: canal.timbre, eco: false, freq: frequencia(midi), passos: duracao });
                    }
                    p += duracao;
                }
            }
        } else if (canal.tipo === "bateria") {
            const tokens = lerTokens(canal.padrao);
            let p = 0;
            while (p < total) {
                for (const [valor, duracao] of tokens) {
                    if (p >= total) {
                        break;
                    }
                    if (valor !== ".") {
                        passos[p].push({ bateria: valor, volume: canal.volume ?? 1 });
                    }
                    p += duracao;
                }
            }
        }
    }
    return { bpm: musica.bpm, loop: musica.loop, eco: musica.eco ?? null, total, passos };
}

const compiladas = new Map();
function musicaCompilada(nome) {
    let c = compiladas.get(nome);
    if (c === undefined) {
        c = compilar(MUSICAS[nome]);
        compiladas.set(nome, c);
    }
    return c;
}

// ---------------------------------------------------------------------------
// Contexto e barramentos

let ctx = null;
let compressor = null;
let barramentoMusica = null;
let filtroPausa = null;
let barramentoEfeitos = null;
let ruido = null;
const ondas = {};
let emPausa = false;

// faixa sintetizada tocando agora e o nome pedido (mesmo antes do contexto existir)
let faixaAtual = null;
let musicaPedida = null;
// nome da música em curso (o último tocarMusica) e a trilha gravada dela, se
// tiver: { id, buffer, fonte, ganho, inicio, offset }
let musicaNome = null;
let trilha = null;
// buffers já decodificados (ou em decodificação) de cada trilha
const buffersDasTrilhas = new Map();
let agenda = null;
// faixas saindo (fade): continuam soando até o fim do fade
const faixasSaindo = new Set();

// Onda de pulso com o ciclo dado (0,125 = 12,5%), pela série de Fourier.
function criarPulso(ciclo) {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
        real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * ciclo);
    }
    return ctx.createPeriodicWave(real, imag);
}

function criarContexto() {
    const Contexto = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (Contexto === undefined) {
        return false;
    }
    ctx = new Contexto();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);

    filtroPausa = ctx.createBiquadFilter();
    filtroPausa.type = "lowpass";
    filtroPausa.frequency.value = abafarNaPausa() ? PAUSA_CORTE : SEM_CORTE;
    filtroPausa.Q.value = 0.7;
    filtroPausa.connect(compressor);

    barramentoMusica = ctx.createGain();
    barramentoMusica.gain.value = alvoDaMusica();
    barramentoMusica.connect(filtroPausa);

    barramentoEfeitos = ctx.createGain();
    barramentoEfeitos.gain.value = curva(volumeEfeitos());
    barramentoEfeitos.connect(compressor);

    // um segundo de ruído branco, reaproveitado por todos os toques
    ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const dados = ruido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) {
        dados[i] = Math.random() * 2 - 1;
    }
    ondas.pulso12 = criarPulso(0.125);
    ondas.pulso25 = criarPulso(0.25);
    ondas.pulso50 = criarPulso(0.5);
    return true;
}

// Na pausa a música sintetizada fica abafada e mais baixa. Quando a música em
// curso é uma trilha, a pausa troca de música (toca a da pausa), sem abafar.
function abafarNaPausa() {
    return emPausa && !Object.hasOwn(TRILHA_DA_MUSICA, musicaNome);
}

function alvoDaMusica() {
    return curva(volumeMusica()) * (abafarNaPausa() ? PAUSA_VOLUME : 1);
}

// Primeiro gesto: cria o contexto; depois, acorda se o navegador suspendeu.
function destravar() {
    if (ctx === null) {
        if (!criarContexto()) {
            return;
        }
        if (musicaPedida !== null) {
            const nome = musicaPedida;
            musicaPedida = null;
            tocarMusica(nome);
        }
    }
    if (ctx.state !== "running") {
        ctx.resume().catch(() => {
            // o navegador recusou; o próximo gesto tenta de novo
        });
    }
}

if (typeof globalThis.addEventListener === "function") {
    for (const tipo of ["pointerdown", "keydown", "touchstart"]) {
        globalThis.addEventListener(tipo, destravar, { capture: true, passive: true });
    }
}

// ---------------------------------------------------------------------------
// Vozes

function conectarFim(no, ...outros) {
    no.onended = () => {
        no.disconnect();
        for (const o of outros) {
            o.disconnect();
        }
    };
}

function aplicarOnda(osc, onda) {
    if (onda === "triangulo") {
        osc.type = "triangle";
    } else if (onda === "seno") {
        osc.type = "sine";
    } else if (onda === "serra") {
        osc.type = "sawtooth";
    } else {
        osc.setPeriodicWave(ondas[onda] ?? ondas.pulso50);
    }
}

// Uma nota com envelope ADSR em `destino`, começando em t e durando dur (s).
function tocarNota(destino, t, freq, dur, timbre, volume = 1) {
    const osc = ctx.createOscillator();
    aplicarOnda(osc, timbre.onda);
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    const pico = timbre.volume * volume;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pico, t + timbre.ataque);
    g.gain.setTargetAtTime(pico * timbre.sustentacao, t + timbre.ataque, timbre.decaimento / 3);
    const fim = t + Math.max(dur, timbre.ataque);
    g.gain.setTargetAtTime(0, fim, timbre.soltura / 3);
    osc.connect(g);
    g.connect(destino);
    const extras = [g];
    if (timbre.vibrato) {
        // vibrato que entra devagar depois do começo da nota
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        const profundidade = ctx.createGain();
        profundidade.gain.setValueAtTime(0, t);
        profundidade.gain.linearRampToValueAtTime(freq * timbre.vibrato, t + Math.min(0.35, dur));
        lfo.connect(profundidade);
        profundidade.connect(osc.frequency);
        lfo.start(t);
        lfo.stop(fim + timbre.soltura * 2);
        conectarFim(lfo, profundidade);
    }
    osc.start(t);
    osc.stop(fim + timbre.soltura * 2 + 0.05);
    conectarFim(osc, ...extras);
}

// Ruído filtrado com envelope de ataque rápido e queda exponencial.
function tocarRuido(destino, t, { duracao, volume, filtro = "highpass", freq = 1000, q = 0.7, freqFinal, ataque = 0.002 }) {
    const fonte = ctx.createBufferSource();
    fonte.buffer = ruido;
    fonte.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filtro;
    f.frequency.setValueAtTime(freq, t);
    if (freqFinal !== undefined) {
        f.frequency.exponentialRampToValueAtTime(freqFinal, t + duracao);
    }
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(duracao, ataque + 0.01));
    fonte.connect(f);
    f.connect(g);
    g.connect(destino);
    // começa num ponto sorteado do buffer: cada toque soa um pouco diferente
    fonte.start(t, Math.random() * 0.5);
    fonte.stop(t + duracao + 0.05);
    conectarFim(fonte, f, g);
}

// Tom com a frequência deslizando de `de` para `ate` (bumbo, surdo, efeitos).
function tocarDeslize(destino, t, { onda = "seno", de, ate, duracao, volume, ataque = 0.002, curvaExp = true }) {
    const osc = ctx.createOscillator();
    aplicarOnda(osc, onda);
    osc.frequency.setValueAtTime(de, t);
    if (curvaExp) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, ate), t + duracao);
    } else {
        osc.frequency.linearRampToValueAtTime(ate, t + duracao);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
    osc.connect(g);
    g.connect(destino);
    osc.start(t);
    osc.stop(t + duracao + 0.05);
    conectarFim(osc, g);
}

// Um toque de bateria; `pecas` pode juntar letras ("kc" = bumbo e prato).
function tocarBateria(destino, t, pecas, volume) {
    for (const peca of pecas) {
        switch (peca) {
            case "k":
                tocarDeslize(destino, t, { de: 150, ate: 42, duracao: 0.22, volume: 0.6 * volume });
                tocarRuido(destino, t, { duracao: 0.015, volume: 0.12 * volume, freq: 2500 });
                break;
            case "s":
                tocarRuido(destino, t, { duracao: 0.16, volume: 0.32 * volume, filtro: "bandpass", freq: 1900, q: 0.6 });
                tocarDeslize(destino, t, { onda: "triangulo", de: 220, ate: 160, duracao: 0.08, volume: 0.25 * volume });
                break;
            case "h":
                tocarRuido(destino, t, { duracao: 0.035, volume: 0.09 * volume, freq: 7500 });
                break;
            case "o":
                tocarRuido(destino, t, { duracao: 0.22, volume: 0.08 * volume, freq: 6500 });
                break;
            case "t":
                tocarDeslize(destino, t, { de: 120, ate: 62, duracao: 0.34, volume: 0.55 * volume });
                tocarRuido(destino, t, { duracao: 0.08, volume: 0.1 * volume, filtro: "lowpass", freq: 900 });
                break;
            case "m":
                tocarDeslize(destino, t, { de: 190, ate: 105, duracao: 0.24, volume: 0.55 * volume });
                break;
            case "c":
                tocarRuido(destino, t, { duracao: 1.3, volume: 0.13 * volume, freq: 4200 });
                break;
            case "r":
                tocarRuido(destino, t, { duracao: 0.03, volume: 0.1 * volume, filtro: "bandpass", freq: 3200, q: 2 });
                tocarDeslize(destino, t, { onda: "triangulo", de: 820, ate: 760, duracao: 0.03, volume: 0.06 * volume });
                break;
            case "w":
                // o mar: ruído grave que sobe e desce devagar
                tocarRuido(destino, t, {
                    duracao: 4.5,
                    volume: 0.11 * volume,
                    filtro: "lowpass",
                    freq: 380,
                    freqFinal: 1300,
                    ataque: 1.6,
                });
                break;
            default:
                break;
        }
    }
}

// ---------------------------------------------------------------------------
// Faixas de música

function criarFaixa(nome) {
    const musica = musicaCompilada(nome);
    const ganho = ctx.createGain();
    ganho.gain.setValueAtTime(0, ctx.currentTime);
    ganho.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_MUSICA);
    ganho.connect(barramentoMusica);
    let eco = null;
    if (musica.eco !== null) {
        // eco do canto: atraso de alguns passos que volta mais fraco
        const passo = 60 / musica.bpm / 4;
        const atraso = ctx.createDelay(2);
        atraso.delayTime.value = passo * musica.eco.passos;
        const retorno = ctx.createGain();
        retorno.gain.value = musica.eco.retorno;
        const volume = ctx.createGain();
        volume.gain.value = musica.eco.volume;
        const corte = ctx.createBiquadFilter();
        corte.type = "lowpass";
        corte.frequency.value = 2400;
        atraso.connect(corte);
        corte.connect(retorno);
        retorno.connect(atraso);
        corte.connect(volume);
        volume.connect(ganho);
        eco = { entrada: atraso, nos: [atraso, retorno, volume, corte] };
    }
    return {
        nome,
        musica,
        ganho,
        eco,
        passo: 0,
        // pequeno respiro antes da primeira nota
        tempo: ctx.currentTime + 0.06,
        duracaoPasso: 60 / musica.bpm / 4,
        acabou: false,
    };
}

function agendarFaixa(faixa) {
    const agora = ctx.currentTime;
    if (faixa.tempo < agora - ATRASO_MAXIMO) {
        faixa.tempo = agora + 0.02;
    }
    const { musica } = faixa;
    while (!faixa.acabou && faixa.tempo < agora + ANTECEDENCIA) {
        for (const ev of musica.passos[faixa.passo]) {
            if (ev.bateria !== undefined) {
                tocarBateria(faixa.ganho, faixa.tempo, ev.bateria, ev.volume);
            } else {
                const timbre = TIMBRES[ev.timbre];
                const dur = ev.passos * faixa.duracaoPasso * timbre.legato;
                tocarNota(faixa.ganho, faixa.tempo, ev.freq, dur, timbre);
                if (ev.eco && faixa.eco !== null) {
                    tocarNota(faixa.eco.entrada, faixa.tempo, ev.freq, dur, timbre);
                }
            }
        }
        faixa.tempo += faixa.duracaoPasso;
        faixa.passo++;
        if (faixa.passo >= musica.total) {
            if (musica.loop) {
                faixa.passo = 0;
            } else {
                faixa.acabou = true;
            }
        }
    }
}

function tique() {
    if (ctx === null || ctx.state !== "running") {
        return;
    }
    if (faixaAtual !== null) {
        agendarFaixa(faixaAtual);
    }
}

function ligarAgenda() {
    if (agenda === null) {
        agenda = setInterval(tique, INTERVALO_AGENDA);
    }
}

// Tira a faixa com fade e desliga os nós no fim.
function soltarFaixa(faixa) {
    const agora = ctx.currentTime;
    faixa.acabou = true;
    faixa.ganho.gain.cancelScheduledValues(agora);
    faixa.ganho.gain.setValueAtTime(faixa.ganho.gain.value, agora);
    faixa.ganho.gain.linearRampToValueAtTime(0, agora + FADE_MUSICA);
    faixasSaindo.add(faixa);
    setTimeout(
        () => {
            faixasSaindo.delete(faixa);
            faixa.ganho.disconnect();
            if (faixa.eco !== null) {
                for (const no of faixa.eco.nos) {
                    no.disconnect();
                }
            }
        },
        (FADE_MUSICA + 2) * 1000,
    );
}

// ---------------------------------------------------------------------------
// Trilhas gravadas

const urlDaTrilha = (id) => `${import.meta.env.BASE_URL}${TRILHAS[id].arquivo}`;

// Baixa e decodifica a trilha uma vez; as próximas chamadas reaproveitam.
// Se falhar, esquece o resultado para tentar de novo no próximo pedido.
function carregarTrilha(id) {
    let promessa = buffersDasTrilhas.get(id);
    if (promessa === undefined) {
        promessa = fetch(urlDaTrilha(id))
            .then((resposta) => {
                if (!resposta.ok) {
                    throw new Error(`HTTP ${resposta.status}`);
                }
                return resposta.arrayBuffer();
            })
            .then((bytes) => ctx.decodeAudioData(bytes));
        promessa.catch(() => buffersDasTrilhas.delete(id));
        buffersDasTrilhas.set(id, promessa);
    }
    return promessa;
}

// Liga a trilha a partir do ponto offset (s), em laço e com fade de entrada.
function iniciarTrilha(t, offset) {
    const agora = ctx.currentTime;
    const fonte = ctx.createBufferSource();
    fonte.buffer = t.buffer;
    fonte.loop = true;
    const ganho = ctx.createGain();
    ganho.gain.setValueAtTime(0, agora);
    ganho.gain.linearRampToValueAtTime(TRILHAS[t.id].volume, agora + FADE_MUSICA);
    fonte.connect(ganho);
    ganho.connect(barramentoMusica);
    fonte.start(0, offset % t.buffer.duration);
    t.fonte = fonte;
    t.ganho = ganho;
    t.inicio = agora - offset;
}

// Tira a trilha com fade e guarda onde ela parou (t.offset), para a pausa
// poder devolvê-la do mesmo ponto.
function soltarTrilha(t, fade = FADE_MUSICA) {
    if (t.fonte === null) {
        return;
    }
    const agora = ctx.currentTime;
    t.offset = (agora - t.inicio) % t.buffer.duration;
    t.ganho.gain.cancelScheduledValues(agora);
    t.ganho.gain.setValueAtTime(t.ganho.gain.value, agora);
    t.ganho.gain.linearRampToValueAtTime(0, agora + fade);
    const { fonte, ganho } = t;
    fonte.stop(agora + fade + 0.05);
    fonte.onended = () => {
        fonte.disconnect();
        ganho.disconnect();
    };
    t.fonte = null;
    t.ganho = null;
}

// ---------------------------------------------------------------------------
// Efeitos (nome → função que toca em t no barramento dos efeitos)

const variar = (valor, fracao) => valor * (1 + (Math.random() * 2 - 1) * fracao);

// sequência rápida de notas (arpejo de efeito)
function notasRapidas(destino, t, notas, { onda = "pulso25", passo = 0.06, volume = 0.18, duracao = passo } = {}) {
    const timbre = { onda, volume, ataque: 0.003, decaimento: 0.05, sustentacao: 0.7, soltura: 0.04 };
    notas.forEach((nota, i) => {
        tocarNota(destino, t + i * passo, frequencia(midiDaNota(nota)), i === notas.length - 1 ? duracao * 2 : duracao, timbre);
    });
}

const EFEITOS = {
    pulo(d, t) {
        tocarDeslize(d, t, { onda: "pulso25", de: 240, ate: 620, duracao: 0.13, volume: 0.16 });
    },
    passo(d, t) {
        tocarRuido(d, t, { duracao: 0.045, volume: 0.07, filtro: "lowpass", freq: variar(900, 0.2) });
    },
    lanternaLiga(d, t) {
        tocarRuido(d, t, { duracao: 0.018, volume: 0.15, freq: 3000 });
        tocarDeslize(d, t + 0.01, { onda: "pulso12", de: 600, ate: 980, duracao: 0.07, volume: 0.09 });
    },
    lanternaDesliga(d, t) {
        tocarRuido(d, t, { duracao: 0.018, volume: 0.13, freq: 2600 });
        tocarDeslize(d, t + 0.01, { onda: "pulso12", de: 760, ate: 380, duracao: 0.08, volume: 0.08 });
    },
    bateriaVazia(d, t) {
        tocarDeslize(d, t, { onda: "pulso50", de: 220, ate: 210, duracao: 0.09, volume: 0.13 });
        tocarDeslize(d, t + 0.13, { onda: "pulso50", de: 165, ate: 150, duracao: 0.14, volume: 0.13 });
    },
    recarga(d, t) {
        notasRapidas(d, t, ["C5", "E5", "G5", "C6", "E6", "G6"], { onda: "pulso12", passo: 0.05, volume: 0.12 });
    },
    dano(d, t) {
        tocarDeslize(d, t, { onda: "pulso50", de: variar(420, 0.05), ate: 70, duracao: 0.22, volume: 0.2 });
        tocarRuido(d, t, { duracao: 0.12, volume: 0.18, filtro: "lowpass", freq: 1800 });
    },
    batimento(d, t) {
        // tum-tum surdo da vida baixa
        tocarDeslize(d, t, { onda: "seno", de: 70, ate: 45, duracao: 0.1, volume: 0.32 });
        tocarDeslize(d, t + 0.17, { onda: "seno", de: 60, ate: 40, duracao: 0.12, volume: 0.24 });
    },
    morte(d, t) {
        notasRapidas(d, t, ["E5", "C5", "A4", "F4", "D4"], { onda: "pulso25", passo: 0.14, volume: 0.15, duracao: 0.13 });
        tocarRuido(d, t + 0.6, { duracao: 0.8, volume: 0.12, filtro: "lowpass", freq: 600, freqFinal: 120 });
    },
    coleta(d, t) {
        notasRapidas(d, t, ["B5", "E6"], { onda: "pulso12", passo: 0.07, volume: 0.15, duracao: 0.08 });
    },
    bau(d, t) {
        // rangido da tampa e um brilho subindo
        const osc = { onda: "serra", de: 110, ate: 150, duracao: 0.25, volume: 0.06, curvaExp: false };
        tocarDeslize(d, t, osc);
        notasRapidas(d, t + 0.22, ["G5", "B5", "D6", "G6", "B6"], { onda: "pulso12", passo: 0.045, volume: 0.1 });
    },
    conserto(d, t) {
        // martelada: pancada seca e um tinido de metal
        tocarDeslize(d, t, { onda: "triangulo", de: 340, ate: 110, duracao: 0.09, volume: 0.35 });
        tocarRuido(d, t, { duracao: 0.04, volume: 0.22, filtro: "bandpass", freq: 2200, q: 1.5 });
        tocarDeslize(d, t + 0.005, { onda: "seno", de: variar(1850, 0.03), ate: 1800, duracao: 0.35, volume: 0.06 });
    },
    canhao(d, t) {
        tocarDeslize(d, t, { de: 130, ate: 35, duracao: 0.5, volume: 0.6 });
        tocarRuido(d, t, { duracao: 0.7, volume: 0.32, filtro: "lowpass", freq: 900, freqFinal: 120 });
    },
    explosao(d, t) {
        tocarRuido(d, t, { duracao: 1.0, volume: 0.4, filtro: "lowpass", freq: 2400, freqFinal: 150 });
        tocarDeslize(d, t, { de: 90, ate: 28, duracao: 0.8, volume: 0.5 });
    },
    respingo(d, t) {
        tocarRuido(d, t, { duracao: 0.35, volume: 0.16, filtro: "bandpass", freq: 2200, freqFinal: 500, q: 0.9 });
        for (let i = 0; i < 3; i++) {
            const inicio = t + 0.05 + Math.random() * 0.2;
            const f = 1100 + Math.random() * 900;
            tocarDeslize(d, inicio, { onda: "seno", de: f, ate: f * 1.5, duracao: 0.05, volume: 0.05 });
        }
    },
    // piranha parada na areia, prestes a saltar: bicada aguda e curta
    "piranha-salto"(d, t) {
        tocarDeslize(d, t, { onda: "pulso25", de: 900, ate: 1500, duracao: 0.15, volume: 0.12 });
    },
    // vampiro parado com os olhos brilhando, antes do dash: sibilo agudo
    "vampiro-dash"(d, t) {
        tocarRuido(d, t, { duracao: 0.25, volume: 0.1, filtro: "highpass", freq: 5200, freqFinal: 3600 });
        tocarDeslize(d, t, { onda: "pulso12", de: 1900, ate: 2600, duracao: 0.2, volume: 0.05 });
    },
    // traço dos tentáculos: chiado curto, repetido enquanto o traço avança
    traco(d, t) {
        tocarRuido(d, t, { duracao: 0.12, volume: 0.06, filtro: "bandpass", freq: variar(3200, 0.1), q: 1.2 });
    },
    // traço perdido: nota grave e seca
    "traco-falha"(d, t) {
        tocarDeslize(d, t, { onda: "pulso50", de: 150, ate: 110, duracao: 0.2, volume: 0.14 });
    },
    // tentáculo queimando: ruído descendente
    "tentaculo-queima"(d, t) {
        tocarRuido(d, t, { duracao: 0.4, volume: 0.2, filtro: "lowpass", freq: 4000, freqFinal: 300 });
        tocarDeslize(d, t, { onda: "pulso12", de: 700, ate: 180, duracao: 0.35, volume: 0.07 });
    },
    rugido(d, t) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(62, t);
        osc.frequency.linearRampToValueAtTime(48, t + 1.4);
        const tremor = ctx.createOscillator();
        tremor.frequency.value = 9;
        const fundo = ctx.createGain();
        fundo.gain.value = 6;
        tremor.connect(fundo);
        fundo.connect(osc.frequency);
        const filtro = ctx.createBiquadFilter();
        filtro.type = "lowpass";
        filtro.frequency.setValueAtTime(300, t);
        filtro.frequency.linearRampToValueAtTime(900, t + 0.4);
        filtro.frequency.linearRampToValueAtTime(250, t + 1.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        osc.connect(filtro);
        filtro.connect(g);
        g.connect(d);
        osc.start(t);
        tremor.start(t);
        osc.stop(t + 1.7);
        tremor.stop(t + 1.7);
        conectarFim(osc, filtro, g);
        conectarFim(tremor, fundo);
        tocarRuido(d, t, { duracao: 1.4, volume: 0.12, filtro: "lowpass", freq: 500, ataque: 0.3 });
    },
    disparo(d, t) {
        tocarDeslize(d, t, { onda: "pulso12", de: 1700, ate: 420, duracao: 0.16, volume: 0.13 });
        tocarDeslize(d, t, { onda: "seno", de: 2400, ate: 1900, duracao: 0.22, volume: 0.05 });
        tocarRuido(d, t, { duracao: 0.1, volume: 0.06, freq: 5000 });
    },
    engrenagem(d, t) {
        for (let i = 0; i < 6; i++) {
            tocarRuido(d, t + i * 0.04, { duracao: 0.02, volume: 0.12, filtro: "bandpass", freq: 3200, q: 3 });
        }
        notasRapidas(d, t + 0.26, ["A5", "E6"], { onda: "triangulo", passo: 0.07, volume: 0.2, duracao: 0.1 });
    },
    hora(d, t) {
        // sino: parciais fora da série harmônica, com queda longa
        const base = 523.25;
        const parciais = [
            [1, 0.16, 2.6],
            [2, 0.07, 1.8],
            [2.76, 0.05, 1.3],
            [5.4, 0.025, 0.7],
        ];
        for (const [razao, volume, duracao] of parciais) {
            tocarDeslize(d, t, { onda: "seno", de: base * razao, ate: base * razao * 0.998, duracao, volume, ataque: 0.004 });
        }
    },
    clique(d, t) {
        tocarDeslize(d, t, { onda: "pulso25", de: 1250, ate: 1150, duracao: 0.045, volume: 0.11 });
        tocarDeslize(d, t + 0.035, { onda: "pulso25", de: 1680, ate: 1600, duracao: 0.06, volume: 0.09 });
    },
    navegar(d, t) {
        tocarDeslize(d, t, { onda: "pulso12", de: 880, ate: 860, duracao: 0.035, volume: 0.07 });
    },
    faisca(d, t) {
        // faísca de luz chegando ao farol: um pingo agudo e curto
        const f = variar(2100, 0.12);
        tocarDeslize(d, t, { onda: "pulso12", de: f, ate: f * 1.25, duracao: 0.04, volume: 0.05 });
    },
    energiaCheia(d, t) {
        // barra de energia do farol cheia: arpejo subindo e um brilho no fim
        notasRapidas(d, t, ["E5", "G#5", "B5", "E6"], { onda: "pulso12", passo: 0.06, volume: 0.13 });
        tocarDeslize(d, t + 0.24, { onda: "seno", de: 2640, ate: 2600, duracao: 0.4, volume: 0.05 });
    },
};

// ---------------------------------------------------------------------------
// API

// Toca a sintetizada `nome`, tirando a que estava (com fade).
function tocarSintetizada(nome) {
    if (faixaAtual !== null) {
        soltarFaixa(faixaAtual);
    }
    faixaAtual = criarFaixa(nome);
    ligarAgenda();
}

// Troca a música com fade de 0,5 s; o mesmo nome não reinicia, e nomes
// seguidos com a mesma trilha (menu → Fase 1) seguem sem cortar.
export function tocarMusica(nome) {
    if (!Object.hasOwn(MUSICAS, nome)) {
        throw new Error(`som: música desconhecida "${nome}"`);
    }
    musicaNome = nome;
    if (ctx === null) {
        musicaPedida = nome;
        return;
    }
    const id = Object.hasOwn(TRILHA_DA_MUSICA, nome) ? TRILHA_DA_MUSICA[nome] : null;

    if (id === null) {
        if (trilha !== null) {
            soltarTrilha(trilha);
            trilha = null;
        }
        if (faixaAtual !== null && faixaAtual.nome === nome && !faixaAtual.pausa) {
            return;
        }
        tocarSintetizada(nome);
        return;
    }

    if (trilha !== null && trilha.id === id) {
        return;
    }
    if (trilha !== null) {
        soltarTrilha(trilha);
    }
    if (faixaAtual !== null) {
        soltarFaixa(faixaAtual);
        faixaAtual = null;
    }
    const nova = { id, buffer: null, fonte: null, ganho: null, inicio: 0, offset: 0 };
    trilha = nova;
    carregarTrilha(id).then(
        (buffer) => {
            if (trilha !== nova) {
                return;
            }
            nova.buffer = buffer;
            // em pausa, a trilha espera: modoPausa(false) a liga
            if (!emPausa) {
                iniciarTrilha(nova, 0);
            }
        },
        (erro) => {
            console.warn(`som: a trilha "${id}" não carregou (${erro.message}); toca a sintetizada`);
            if (trilha !== nova) {
                return;
            }
            trilha = null;
            if (!emPausa) {
                tocarSintetizada(nome);
            }
        },
    );
}

// Para a música atual com fade.
export function pararMusica() {
    musicaPedida = null;
    musicaNome = null;
    if (ctx !== null) {
        if (trilha !== null) {
            soltarTrilha(trilha);
        }
        if (faixaAtual !== null) {
            soltarFaixa(faixaAtual);
        }
    }
    trilha = null;
    faixaAtual = null;
}

// Nome da música tocando (ou pedida antes do primeiro gesto), ou null.
export function musicaAtual() {
    return musicaNome;
}

// Pausa. Com uma trilha tocando, ela sai (guardando o ponto) e entra a
// música sintetizada da pausa; ao despausar, a trilha volta do mesmo ponto.
// Sem trilha, a música sintetizada só fica abafada (passa-baixa) e mais baixa.
export function modoPausa(ligado) {
    const novo = Boolean(ligado);
    const mudou = novo !== emPausa;
    emPausa = novo;
    if (ctx === null) {
        return;
    }
    const agora = ctx.currentTime;
    filtroPausa.frequency.cancelScheduledValues(agora);
    filtroPausa.frequency.setTargetAtTime(abafarNaPausa() ? PAUSA_CORTE : SEM_CORTE, agora, 0.12);
    barramentoMusica.gain.setTargetAtTime(alvoDaMusica(), agora, 0.12);
    if (!mudou) {
        return;
    }
    if (emPausa) {
        if (trilha !== null) {
            soltarTrilha(trilha, 0.15);
            tocarSintetizada(MUSICA_DA_PAUSA);
            faixaAtual.pausa = true;
        }
        return;
    }
    if (faixaAtual?.pausa) {
        soltarFaixa(faixaAtual);
        faixaAtual = null;
        // a trilha não carregou durante a pausa: volta a sintetizada da música
        if (trilha === null && musicaNome !== null) {
            tocarSintetizada(musicaNome);
        }
    }
    // se a trilha ainda estava carregando, quem a liga é o carregamento
    if (trilha !== null && trilha.buffer !== null && trilha.fonte === null) {
        iniciarTrilha(trilha, trilha.offset);
    }
}

// Toca um efeito curto (lista em EFEITOS).
export function efeito(nome) {
    const tocar = EFEITOS[nome];
    if (tocar === undefined) {
        throw new Error(`som: efeito desconhecido "${nome}"`);
    }
    if (ctx === null || ctx.state !== "running") {
        return;
    }
    tocar(barramentoEfeitos, ctx.currentTime + 0.005);
}

// Volume da música (0 a 1), salvo em opcoes.js; devolve o valor que ficou.
export function definirVolumeMusica(v) {
    const valor = salvarVolumeMusica(v);
    if (ctx !== null) {
        barramentoMusica.gain.setTargetAtTime(alvoDaMusica(), ctx.currentTime, 0.05);
    }
    return valor;
}

// Volume dos efeitos (0 a 1), salvo em opcoes.js; devolve o valor que ficou.
export function definirVolumeEfeitos(v) {
    const valor = salvarVolumeEfeitos(v);
    if (ctx !== null) {
        barramentoEfeitos.gain.setTargetAtTime(curva(valor), ctx.currentTime, 0.05);
    }
    return valor;
}

// Nomes das músicas e dos efeitos (para testes e o modo de depuração).
export const NOMES_DAS_MUSICAS = Object.keys(MUSICAS);
export const NOMES_DOS_EFEITOS = Object.keys(EFEITOS);

// Estado do áudio para depuração: "sem contexto", "suspended", "running".
export function estadoDoAudio() {
    return ctx === null ? "sem contexto" : ctx.state;
}
