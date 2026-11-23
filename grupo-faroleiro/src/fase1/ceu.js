import { CanvasRenderTarget, Color, Light2d, loader, Polygon, Renderable, Vector2d } from "melonjs";
import { registrarBrilho, removerBrilho } from "../systems/brilhos.js";
import { estiloAtual, imagem } from "../systems/estilo.js";
import { relogio } from "../systems/relogio.js";
import { FASE1 } from "./config.js";
import { CORES_FASE1 } from "./cores.js";
import { lerVista } from "./vista.js";

// Céu da Fase 1, pintado por código conforme a hora: degradê em faixas com pontilhado, o sol descendo e sumindo no
// horizonte entre 18h e 19h, nuvens e ilhas distantes em paralaxe, o mar ao
// fundo e, por cima da escuridão (registro de brilhos), as estrelas, a lua
// nascendo às 19h e cruzando em arco e o reflexo dela na água. Quando a lua
// sai da tela, o reflexo continua mostrando onde ela está.
//
// O horizonte acompanha a câmera com um pouco de paralaxe vertical
// (FASE1.ceu.horizonteBase/Fator). O degradê é desenhado numa imagem de
// 64 px de largura, refeita quando a hora muda um minuto, e repetida na
// horizontal.

const C = FASE1.ceu;
const TEMPO = FASE1.tempo;

const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
].map((l) => l.map((v) => (v + 0.5) / 16));

// imagem do degradê: ALTURA_CEU linhas acima do horizonte e ALTURA_MAR
// abaixo dele (mar ao fundo)
const LARGURA_IMAGEM = 64;
const ALTURA_CEU = 400;
const ALTURA_MAR = 72;
// fração final de cada faixa que vira pontilhado até a próxima cor
const PONTILHADO = 0.4;
// imagem única, reaproveitada (na GPU, criar uma por fase vazaria texturas)
let imagemDoCeu = null;

// cores em [r, g, b], lidas uma vez
const cacheDeCores = new Map();
function rgb(hex) {
    let c = cacheDeCores.get(hex);
    if (c === undefined) {
        c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        cacheDeCores.set(hex, c);
    }
    return c;
}

function suave(t) {
    return t * t * (3 - 2 * t);
}

function limitar(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

// Chaves de cor em volta da hora m e a fração entre elas.
function chavesDaHora(tabela, m) {
    const chaves = tabela.chaves;
    if (m <= chaves[0].hora) {
        return [chaves[0], chaves[0], 0];
    }
    for (let i = 0; i < chaves.length - 1; i++) {
        const a = chaves[i];
        const b = chaves[i + 1];
        if (m < b.hora) {
            return [a, b, suave((m - a.hora) / (b.hora - a.hora))];
        }
    }
    const ultima = chaves[chaves.length - 1];
    return [ultima, ultima, 0];
}

// cor de uma pilha de paradas na altura h, com o pontilhado no pixel (x, y)
function corNaAltura(paradas, h, x, y) {
    if (h <= paradas[0][0]) {
        return rgb(paradas[0][1]);
    }
    for (let i = 0; i < paradas.length - 1; i++) {
        const [h0, c0] = paradas[i];
        const [h1, c1] = paradas[i + 1];
        if (h < h1) {
            const t = limitar(((h - h0) / (h1 - h0) - (1 - PONTILHADO)) / PONTILHADO, 0, 1);
            return BAYER4[y & 3][x & 3] < t ? rgb(c1) : rgb(c0);
        }
    }
    return rgb(paradas[paradas.length - 1][1]);
}

// mistura de duas cores [r, g, b] (f de 0 a 1)
function misturar(a, b, f, saida) {
    saida[0] = a[0] + (b[0] - a[0]) * f;
    saida[1] = a[1] + (b[1] - a[1]) * f;
    saida[2] = a[2] + (b[2] - a[2]) * f;
    return saida;
}

const corTemp = [0, 0, 0];

// cor final no pixel (x, y) para as duas chaves e a fração entre elas
function corEntreChaves(modo, a, b, f, paradasA, paradasB, h, x, y) {
    if (modo === "pontilhado") {
        const usarB = BAYER4[(y + 2) & 3][(x + 1) & 3] < f;
        return usarB ? corNaAltura(paradasB, h, x, y) : corNaAltura(paradasA, h, x, y);
    }
    return misturar(corNaAltura(paradasA, h, x, y), corNaAltura(paradasB, h, x, y), f, corTemp);
}

// paradas do mar ao fundo (profundidade abaixo do horizonte)
function paradasDoMar(chave) {
    return [
        [0, chave.mar[0]],
        [ALTURA_MAR * 0.6, chave.mar[1]],
    ];
}

// espuma fixa: pontinhos de 2 px em lugares sorteados da imagem
function temEspuma(x, d) {
    if (d < 2 || d % 3 !== 0) {
        return false;
    }
    const h = Math.sin(Math.floor(x / 2) * 12.9898 + d * 78.233) * 43758.5453;
    return h - Math.floor(h) < 0.06 + 0.04 * (1 - d / ALTURA_MAR);
}

export class Ceu extends Renderable {
    constructor(mapa) {
        super(0, 0, mapa.largura, mapa.altura);
        this.anchorPoint.set(0, 0);
        this.alwaysUpdate = true;
        this.mapa = mapa;
        this.tempo = 0;
        this.chaveDaImagem = "";
        this.corDoTopo = new Color();
        this.corDoFundo = new Color();
        this.tinta = new Color();
        this.corTemp = new Color();
        // halo da lua (Light2d fora do mundo, desenhado no brilho)
        this.halo = new Light2d(0, 0, 30, 30, "#d8e4ff", 0.28);
        // estrelas fixas: x (fração da tela), altura acima do horizonte,
        // fase da cintilação
        this.estrelas = [];
        for (let i = 0; i < C.estrelas; i++) {
            const s = (k) => {
                const v = Math.sin(i * 91.7 + k * 47.3) * 43758.5453;
                return v - Math.floor(v);
            };
            this.estrelas.push({ x: s(1), h: 30 + s(2) * 330, fase: s(3) * Math.PI * 2, grande: s(4) < 0.12 });
        }
        // nuvens: x no céu (px), altura acima do horizonte, quadro
        this.nuvens = [
            [40, 150, 0],
            [300, 205, 1],
            [520, 120, 2],
            [760, 175, 0],
            [980, 230, 2],
            [1180, 140, 1],
        ];
        // polígono do céu acima da silhueta (máscara dos brilhos)
        this.pontosDaSilhueta = [];
        for (let i = 0; i < 2 + 2 * (mapa.colunas + 2); i++) {
            this.pontosDaSilhueta.push(new Vector2d());
        }
        this.mascara = new Polygon(0, 0, [new Vector2d(), new Vector2d(1, 0), new Vector2d(0, 1)]);
        this.verticesDaMascara = [];
    }

    onActivateEvent() {
        registrarBrilho(this);
    }

    onDeactivateEvent() {
        removerBrilho(this);
    }

    update(dt) {
        this.tempo += dt / 1000;
        return true;
    }

    // y do horizonte (px do mundo) para a vista atual
    horizonte(vista) {
        return Math.round(C.horizonteBase + C.horizonteFator * (vista.y + vista.altura / 2));
    }

    // ---- degradê ----------------------------------------------------------

    refazerImagem(renderer, tabela, a, b, f) {
        if (imagemDoCeu === null) {
            imagemDoCeu = new CanvasRenderTarget(LARGURA_IMAGEM, ALTURA_CEU + ALTURA_MAR);
        }
        const ctx = imagemDoCeu.context;
        const dados = ctx.createImageData(LARGURA_IMAGEM, ALTURA_CEU + ALTURA_MAR);
        const px = dados.data;
        const modo = tabela.misturar;
        const marA = paradasDoMar(a);
        const marB = paradasDoMar(b);
        const espuma = misturar(rgb(a.espuma), rgb(b.espuma), modo === "pontilhado" ? (f < 0.5 ? 0 : 1) : f, [0, 0, 0]);
        for (let y = 0; y < ALTURA_CEU + ALTURA_MAR; y++) {
            for (let x = 0; x < LARGURA_IMAGEM; x++) {
                let cor;
                if (y < ALTURA_CEU) {
                    const h = ALTURA_CEU - 1 - y;
                    cor = corEntreChaves(modo, a, b, f, a.ceu, b.ceu, h, x, y);
                } else {
                    const d = y - ALTURA_CEU;
                    cor = temEspuma(x, d) ? espuma : corEntreChaves(modo, a, b, f, marA, marB, d, x, y);
                }
                const i = (y * LARGURA_IMAGEM + x) * 4;
                px[i] = cor[0];
                px[i + 1] = cor[1];
                px[i + 2] = cor[2];
                px[i + 3] = 255;
            }
        }
        ctx.putImageData(dados, 0, 0);
        imagemDoCeu.invalidate(renderer);

        // acima e abaixo da imagem: a última cor do céu e a do fundo do mar
        const topo = corEntreChaves(modo, a, b, f, a.ceu, b.ceu, 1e9, 0, 0);
        this.corDoTopo.setColor(Math.round(topo[0]), Math.round(topo[1]), Math.round(topo[2]));
        const fundo = corEntreChaves(modo, a, b, f, marA, marB, 1e9, 0, 0);
        this.corDoFundo.setColor(Math.round(fundo[0]), Math.round(fundo[1]), Math.round(fundo[2]));
    }

    // tinta (Color) entre duas cores hex das chaves
    tintaEntre(a, b, f) {
        const cor = misturar(rgb(a), rgb(b), f, corTemp);
        this.tinta.setColor(Math.round(cor[0]), Math.round(cor[1]), Math.round(cor[2]));
        return this.tinta;
    }

    draw(renderer) {
        const vista = lerVista(this.parentApp.viewport);
        const m = relogio.minutos();
        const tema = estiloAtual();
        const tabela = CORES_FASE1[tema];
        const [a, b, f] = chavesDaHora(tabela, m);
        const chave = `${tema}:${Math.floor(m)}`;
        if (chave !== this.chaveDaImagem || imagemDoCeu === null) {
            this.chaveDaImagem = chave;
            this.refazerImagem(renderer, tabela, a, b, f);
        }
        const horizonte = this.horizonte(vista);
        const topoDaImagem = horizonte - ALTURA_CEU;
        const fundoDaImagem = horizonte + ALTURA_MAR;
        const direita = vista.x + vista.largura;
        const baixo = vista.y + vista.altura;

        renderer.save();
        renderer.setGlobalAlpha(1);
        if (topoDaImagem > vista.y) {
            renderer.setColor(this.corDoTopo);
            renderer.fillRect(vista.x, vista.y, vista.largura, topoDaImagem - vista.y);
        }
        if (fundoDaImagem < baixo) {
            renderer.setColor(this.corDoFundo);
            renderer.fillRect(vista.x, fundoDaImagem, vista.largura, baixo - fundoDaImagem);
        }
        renderer.restore();
        if (topoDaImagem < baixo && fundoDaImagem > vista.y) {
            const inicio = Math.floor(vista.x / LARGURA_IMAGEM) * LARGURA_IMAGEM;
            for (let x = inicio; x < direita; x += LARGURA_IMAGEM) {
                renderer.drawImage(imagemDoCeu.canvas, x, topoDaImagem);
            }
        }

        this.desenharSol(renderer, vista, horizonte, m, tabela);
        const fracaoTinta = tabela.misturar === "pontilhado" ? 0 : f;
        // opacidade das nuvens: misturada, ou (pontilhado) trocada no meio
        const alfaA = a.nuvensAlfa ?? 1;
        const alfaB = b.nuvensAlfa ?? 1;
        const alfaNuvens = tabela.misturar === "pontilhado" ? (f < 0.5 ? alfaA : alfaB) : alfaA + (alfaB - alfaA) * f;
        this.desenharNuvens(renderer, vista, horizonte, a, b, fracaoTinta, alfaNuvens);
        this.desenharIlhas(renderer, vista, horizonte, a, b, fracaoTinta);
    }

    desenharSol(renderer, vista, horizonte, m, tabela) {
        if (m < TEMPO.solComeca || m >= TEMPO.solSome) {
            return;
        }
        const s = (m - TEMPO.solComeca) / (TEMPO.solSome - TEMPO.solComeca);
        const lado = 48;
        const cx = Math.round(vista.x + C.solX * vista.largura);
        // desce do alto até passar inteiro para baixo do horizonte
        const cy = Math.round(horizonte - C.solAltura * (1 - s) + (lado / 2) * s);
        const topo = cy - lado / 2;
        const visivel = Math.min(lado, horizonte - topo);
        if (visivel <= 0) {
            return;
        }
        renderer.drawImage(loader.getImage(imagem("sol")), 0, 0, lado, visivel, cx - lado / 2, topo, lado, visivel);
        // reflexo do sol no mar ao fundo: traços que tremem
        this.desenharReflexo(renderer, cx, horizonte + 2, 30, tabela.brilhoDoSol, 0.55 * (1 - s), 10);
    }

    // traços horizontais tremendo, descendo de (x, y)
    desenharReflexo(renderer, x, y, comprimento, cor, opacidade, largura) {
        if (opacidade <= 0) {
            return;
        }
        renderer.save();
        renderer.setColor(cor);
        for (let d = 0; d < comprimento; d += 3) {
            const onda = Math.sin(this.tempo * 2.3 + d * 0.9) * 0.5 + Math.sin(this.tempo * 3.7 + d * 1.7) * 0.5;
            const w = Math.max(1, Math.round(largura * (1 - d / comprimento) * (0.6 + 0.4 * onda)));
            const desvio = Math.round(Math.sin(this.tempo * 1.9 + d * 0.6) * 2);
            renderer.setGlobalAlpha(opacidade * (1 - d / comprimento));
            renderer.fillRect(Math.round(x - w / 2) + desvio, y + d, w, 1);
        }
        renderer.restore();
    }

    // Nuvens no céu, atrás do terreno (o céu é a camada de baixo do mundo),
    // em paralaxe lenta, com a tinta e a opacidade da hora.
    desenharNuvens(renderer, vista, horizonte, a, b, f, alfa) {
        if (alfa <= 0.01) {
            return;
        }
        const img = loader.getImage(imagem("nuvens"));
        const larguraDoCeu = Math.max(vista.largura + 160, 1300);
        renderer.save();
        renderer.setGlobalAlpha(renderer.globalAlpha() * alfa);
        renderer.setTint(this.tintaEntre(a.nuvens, b.nuvens, f));
        for (const [x0, altura, quadro] of this.nuvens) {
            let dx = (x0 + this.tempo * C.ventoNuvens - vista.x * C.paralaxeNuvens) % larguraDoCeu;
            if (dx < 0) {
                dx += larguraDoCeu;
            }
            dx -= 80;
            if (dx > vista.largura + 16) {
                continue;
            }
            const y = horizonte - altura;
            if (y + 32 < vista.y || y > vista.y + vista.altura) {
                continue;
            }
            renderer.drawImage(img, quadro * 64, 0, 64, 32, Math.round(vista.x + dx), y, 64, 32);
        }
        renderer.restore();
    }

    desenharIlhas(renderer, vista, horizonte, a, b, f) {
        const img = loader.getImage(imagem("fundo-ilhas"));
        const topo = horizonte - 64 + 1;
        if (topo > vista.y + vista.altura || horizonte < vista.y) {
            return;
        }
        let deslocamento = (-vista.x * C.paralaxeIlhas) % 640;
        if (deslocamento > 0) {
            deslocamento -= 640;
        }
        renderer.save();
        renderer.setTint(this.tintaEntre(a.ilhas, b.ilhas, f));
        for (let x = vista.x + deslocamento; x < vista.x + vista.largura; x += 640) {
            renderer.drawImage(img, Math.round(x), topo);
        }
        renderer.restore();
    }

    // ---- por cima da escuridão --------------------------------------------

    // Máscara: o céu acima da silhueta da ilha, na vista atual.
    prepararMascara(vista) {
        const n = this.mapa.silhueta(vista.x, vista.y - 1, vista.x + vista.largura, vista.y + vista.altura + 1, this.pontosDaSilhueta);
        const vertices = this.verticesDaMascara;
        vertices.length = n;
        for (let i = 0; i < n; i++) {
            vertices[i] = this.pontosDaSilhueta[i];
        }
        return this.mascara.setVertices(vertices);
    }

    desenharBrilho(renderer) {
        const vista = lerVista(this.parentApp.viewport);
        const m = relogio.minutos();
        const tabela = CORES_FASE1[estiloAtual()];
        const horizonte = this.horizonte(vista);
        const estrelas = limitar((m - TEMPO.estrelasComecam) / (TEMPO.estrelasCheias - TEMPO.estrelasComecam), 0, 1);
        const lua = (m - TEMPO.luaNasce) / (TEMPO.luaSePoe - TEMPO.luaNasce);
        if (estrelas <= 0 && (lua <= 0 || lua >= 1)) {
            return;
        }
        renderer.setMask(this.prepararMascara(vista), false);
        if (estrelas > 0) {
            this.desenharEstrelas(renderer, vista, horizonte, tabela.luar, estrelas);
        }
        if (lua > 0 && lua < 1) {
            this.desenharLua(renderer, vista, horizonte, lua, tabela.luar);
        }
        renderer.clearMask();
    }

    desenharEstrelas(renderer, vista, horizonte, cor, forca) {
        renderer.save();
        renderer.setColor(cor);
        for (const e of this.estrelas) {
            const y = Math.round(horizonte - e.h);
            if (y < vista.y || y > horizonte - 20) {
                continue;
            }
            const x = Math.round(vista.x + e.x * vista.largura);
            const brilho = 0.55 + 0.45 * Math.sin(this.tempo * 1.7 + e.fase);
            renderer.setGlobalAlpha(forca * brilho * (e.grande ? 1 : 0.7));
            renderer.fillRect(x, y, 1, 1);
            if (e.grande && brilho > 0.8) {
                renderer.setGlobalAlpha(forca * 0.35);
                renderer.fillRect(x - 1, y, 3, 1);
                renderer.fillRect(x, y - 1, 1, 3);
            }
        }
        renderer.restore();
    }

    desenharLua(renderer, vista, horizonte, t, cor) {
        const lado = 24;
        const cx = Math.round(vista.x + (0.08 + 0.84 * t) * vista.largura);
        const cy = Math.round(horizonte - C.luaAltura * Math.sin(Math.PI * t) + lado / 2);
        const topo = cy - lado / 2;
        // nascendo ou se pondo: só a parte acima do horizonte
        const visivel = Math.min(lado, horizonte - topo);
        const naTela = topo + lado > vista.y && visivel > 0;
        if (naTela) {
            this.halo.pos.set(cx, cy);
            this.halo.preDraw(renderer);
            renderer.drawLight(this.halo);
            this.halo.postDraw(renderer);
            renderer.setBlendMode("normal");
            renderer.drawImage(loader.getImage(imagem("lua")), 0, 0, lado, visivel, cx - lado / 2, topo, lado, visivel);
        }
        // reflexo no mar ao fundo e no mar da frente; fora da tela, mais forte
        const x = limitar(cx, vista.x + 6, vista.x + vista.largura - 6);
        const forca = naTela ? 0.45 : 0.75;
        this.desenharReflexo(renderer, x, horizonte + 2, C.reflexoComprimento, cor, forca, 9);
        this.desenharReflexo(renderer, x, this.mapa.marY + 4, C.reflexoComprimento * 0.7, cor, forca * 0.8, 11);
    }

    destroy() {
        this.halo.destroy();
        super.destroy();
    }
}