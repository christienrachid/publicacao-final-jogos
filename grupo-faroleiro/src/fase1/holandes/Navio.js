import { loader, Rect } from "melonjs";
import { imagem } from "../../systems/estilo.js";
import { HOLANDES } from "../config.js";
import { coresDoHolandes } from "./cores.js";
import { retangulo } from "./efeitos.js";

// O navio fantasma (navio-<estilo>.png): posição, escala,
// inclinação e o desenho. Quem decide para onde ele vai é o Holandês
// (Holandes.js); aqui ficam só a geometria e o desenho.
//
// O ponto de apoio é o meio da linha d'água do quadro (x 96, y 140), logo
// abaixo da quilha: (x, y) é onde esse ponto está no mundo, `escala` e
// `angulo` giram em volta dele. O quadro é desenhado só até a linha d'água
// (a água pintada abaixo dela não aparece).
//
// Com `naAgua` (chegando pelo horizonte e afundando no mar ao fundo), tudo
// abaixo de `agua` (y do mundo, o horizonte) não é desenhado (máscara em
// retângulo) e há espuma onde o casco corta a água. No ar, sobre o morro,
// o navio aparece inteiro.

const MEIO = HOLANDES.quadroLargura / 2;

export class Navio {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.escala = 1;
        this.angulo = 0;
        this.alfa = 0;
        // 0 inteiro, 1 avariado, 2 muito avariado
        this.quadro = 0;
        // corta o casco na água (chegada e naufrágio)
        this.naAgua = true;
        // y do mundo da superfície da água (corte do casco, com naAgua)
        this.agua = 0;
        // lanternas apagadas (índices), para pintar o vidro escuro
        this.apagadas = [false, false, false];
        this.tempo = 0;
        // espuma na linha d'água (0 a 1)
        this.espuma = 1;
        this.mascara = new Rect(0, 0, 1, 1);
    }

    // Ponto (fx, fy) do quadro em pixels do mundo.
    pontoDoQuadro(fx, fy, saida = { x: 0, y: 0 }) {
        const dx = (fx - MEIO) * this.escala;
        const dy = (fy - HOLANDES.linhaDagua) * this.escala;
        const c = Math.cos(this.angulo);
        const s = Math.sin(this.angulo);
        saida.x = this.x + dx * c - dy * s;
        saida.y = this.y + dx * s + dy * c;
        return saida;
    }

    // Borda esquerda e direita do quadro no mundo (sem a inclinação).
    get esquerda() {
        return this.x - MEIO * this.escala;
    }

    get direita() {
        return this.x + MEIO * this.escala;
    }

    // Ponta dos mastros no mundo (sem a inclinação).
    get topo() {
        return this.y - (HOLANDES.linhaDagua - HOLANDES.topoDoQuadro) * this.escala;
    }

    // vista: { x, y, largura, altura } (px do mundo)
    desenhar(renderer, vista) {
        if (this.alfa <= 0.004) {
            return;
        }
        const img = loader.getImage(imagem("navio"));
        const L = HOLANDES.quadroLargura;
        const A = HOLANDES.linhaDagua;
        const corte = Math.round(this.agua);
        if (this.naAgua) {
            const topo = vista.y - 64;
            if (corte <= topo) {
                return;
            }
            this.mascara.pos.set(vista.x - 64, topo);
            this.mascara.setSize(vista.largura + 128, corte - topo);
            renderer.setMask(this.mascara);
        }
        renderer.save();
        renderer.setGlobalAlpha(this.alfa);
        renderer.translate(Math.round(this.x), Math.round(this.y));
        if (this.angulo !== 0) {
            renderer.rotate(this.angulo);
        }
        if (this.escala !== 1) {
            renderer.scale(this.escala, this.escala);
        }
        renderer.drawImage(img, this.quadro * L, 0, L, A, -MEIO, -A, L, A);
        // vidro das lanternas apagadas
        const cores = coresDoHolandes();
        HOLANDES.lanternas.forEach((l, i) => {
            if (this.apagadas[i]) {
                retangulo(renderer, cores.apagada, l.x - 1 - MEIO, l.y - 1 - A, 3, 3, 1);
            }
        });
        renderer.restore();
        if (this.naAgua) {
            renderer.clearMask();
            // espuma só com o casco cortando a água
            if (this.y > corte) {
                this.desenharEspuma(renderer, corte);
            }
        }
    }

    // Espuma na linha d'água, de ponta a ponta do casco.
    desenharEspuma(renderer, y) {
        const forca = this.espuma * this.alfa;
        if (forca <= 0.01) {
            return;
        }
        const cores = coresDoHolandes();
        const margem = 14 * this.escala;
        const x0 = Math.round(this.esquerda + margem);
        const x1 = Math.round(this.direita - margem);
        for (let x = x0; x < x1; x += 3) {
            const onda = Math.sin(x * 0.21 + this.tempo * 4) + Math.sin(x * 0.07 - this.tempo * 2.5);
            if (onda > 0.3) {
                const dy = Math.round(Math.sin(x * 0.13 + this.tempo * 3) * 1.2);
                retangulo(renderer, cores.espuma, x, y - 1 + dy, onda > 1.1 ? 2 : 1, 1, 0.75 * forca);
            }
        }
    }
}