import { Color, loader, Renderable } from "melonjs";
import { desenharBrilhos } from "../systems/brilhos.js";
import { imagem } from "../systems/estilo.js";
import { FACHO, FAROL, MAR, MUNDO } from "./config.js";
import { coresDaFase2 } from "./cores.js";
import { distanciaDaCosta, naIlha } from "./ilha.js";
import { brilhoRedondo } from "./kraken/desenho.js";

// Camadas de desenho da Fase 2, em ordem (z em Fase2Stage):
//   Cenario        a ilha de cima (farol-ilha-<tema>) e o mar vivo
//   CamadaMonstros sombras, respingos e monstros comuns (embaixo da noite)
//   (Particulas)   src/systems/particulas.js
//   (Noite)        src/fase2/noite.js
//   CamadaAcima    topo do farol, arco de recarga, mini-chefes, engrenagens,
//                  faíscas de energia, brilho do conserto e da melhoria e
//                  tudo o que brilha por cima da noite
// Só desenho: a lógica anda em Fase2Stage.atualizarFase, que para na pausa.

// cores CSS → Color, uma vez
const CORES = new Map();
function cor(css) {
    let c = CORES.get(css);
    if (c === undefined) {
        c = new Color().parseCSS(css);
        CORES.set(css, c);
    }
    return c;
}

// retângulo de cor com opacidade, sem vazar estado para o resto
function pintar(renderer, css, x, y, largura, altura, alfa) {
    if (alfa <= 0.004) {
        return;
    }
    renderer.save();
    renderer.setGlobalAlpha(alfa);
    renderer.setColor(cor(css));
    renderer.fillRect(x, y, largura, altura);
    renderer.restore();
}

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

// Camada de largura e altura do mundo, desenhada em pixels do mundo.
class Camada extends Renderable {
    constructor() {
        super(0, 0, MUNDO.largura, MUNDO.altura);
        this.anchorPoint.set(0, 0);
        this.alwaysUpdate = true;
    }
}

// A ilha e o mar vivo: espuma indo e vindo junto à areia, brilhos na água e
// riscos de onda passando devagar no mar aberto.
export class Cenario extends Camada {
    constructor() {
        super();
        this.tempo = 0;
        this.cristas = [];
        for (let i = 0; i < MAR.cristas; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = distanciaDaCosta(a) + sortear(MAR.cristaDistancia[0], MAR.cristaDistancia[1]);
            const x = FAROL.x + Math.cos(a) * d;
            const y = FAROL.y + Math.sin(a) * d;
            if (naIlha(x, y) || x < 0 || y < 0 || x >= MUNDO.largura || y >= MUNDO.altura) {
                continue;
            }
            this.cristas.push({
                x,
                y,
                // normal para fora da ilha: a espuma vai e volta nela
                nx: Math.cos(a),
                ny: Math.sin(a),
                largura: Math.round(sortear(MAR.cristaLargura[0], MAR.cristaLargura[1])),
                fase: Math.random() * Math.PI * 2,
                ritmo: sortear(0.0012, 0.0022),
            });
        }
        this.brilhos = [];
        while (this.brilhos.length < MAR.brilhos) {
            const x = Math.random() * MUNDO.largura;
            const y = Math.random() * MUNDO.altura;
            const a = Math.atan2(y - FAROL.y, x - FAROL.x);
            if (Math.hypot(x - FAROL.x, y - FAROL.y) < distanciaDaCosta(a) + 22) {
                continue;
            }
            this.brilhos.push({ x: Math.round(x), y: Math.round(y), fase: Math.random() * Math.PI * 2, ritmo: sortear(0.0015, 0.003) });
        }
        this.riscos = [];
        for (let i = 0; i < 26; i++) {
            this.riscos.push({
                x: Math.random() * MUNDO.largura,
                y: Math.random() * MUNDO.altura,
                largura: Math.round(sortear(4, 9)),
                vx: sortear(0.004, 0.009),
                fase: Math.random() * Math.PI * 2,
            });
        }
    }

    update(dt) {
        this.tempo += dt;
        for (const r of this.riscos) {
            r.x += r.vx * dt;
            if (r.x > MUNDO.largura + 10) {
                r.x = -10;
                r.y = Math.random() * MUNDO.altura;
            }
        }
        return true;
    }

    draw(renderer) {
        renderer.drawImage(loader.getImage(imagem("farol-ilha")), 0, 0);
        const cores = coresDaFase2();
        const t = this.tempo;

        // riscos de onda no mar aberto (some quando passa por cima da ilha)
        for (const r of this.riscos) {
            const x = Math.round(r.x);
            const y = Math.round(r.y);
            const a = Math.atan2(y - FAROL.y, x - FAROL.x);
            if (Math.hypot(x - FAROL.x, y - FAROL.y) < distanciaDaCosta(a) + 10) {
                continue;
            }
            const alfa = 0.1 + 0.08 * Math.sin(t * 0.002 + r.fase);
            pintar(renderer, cores.espuma, x, y, r.largura, 1, alfa);
        }

        // espuma junto à areia, respirando para dentro e para fora
        for (const c of this.cristas) {
            const onda = Math.sin(t * c.ritmo + c.fase);
            const alfa = Math.max(0, onda) * Math.max(0, onda) * 0.6;
            const recuo = onda * 1.5;
            pintar(
                renderer,
                cores.espuma,
                Math.round(c.x + c.nx * recuo - c.largura / 2),
                Math.round(c.y + c.ny * recuo),
                c.largura,
                1,
                alfa,
            );
        }

        // brilhos curtos na água
        for (const b of this.brilhos) {
            const s = Math.sin(t * b.ritmo + b.fase);
            if (s < 0.6) {
                continue;
            }
            const alfa = Math.pow((s - 0.6) / 0.4, 2) * 0.85;
            pintar(renderer, cores.brilho, b.x, b.y, 1, 1, alfa);
            if (alfa > 0.5) {
                pintar(renderer, cores.brilho, b.x - 1, b.y, 3, 1, alfa * 0.4);
                pintar(renderer, cores.brilho, b.x, b.y - 1, 1, 3, alfa * 0.4);
            }
        }
    }
}

// Monstros comuns, sombras e respingos (embaixo da noite).
export class CamadaMonstros extends Camada {
    constructor(fase) {
        super();
        this.fase = fase;
    }

    draw(renderer) {
        this.fase.diretor?.desenharMonstros(renderer);
    }
}

// quadros de farol-topo-<tema>.png (2 de 64×64): apagado e aceso
const TOPO = 64;

// Por cima da noite: o topo do farol, o arco de recarga, os mini-chefes, as
// engrenagens, as faíscas de energia, o brilho do conserto passivo e o da
// melhoria escolhida e os brilhos (partículas, vaga-lumes, chuva).
export class CamadaAcima extends Camada {
    constructor(fase) {
        super();
        this.fase = fase;
        this.tempo = 0;
    }

    update(dt) {
        this.tempo += dt;
        return true;
    }

    draw(renderer) {
        const fase = this.fase;
        fase.diretor?.desenharChefes(renderer);
        this.desenharFarol(renderer);
        this.desenharAnelDoConserto(renderer);
        this.desenharArco(renderer);
        fase.diretor?.desenharBarrasDosChefes(renderer);
        fase.diretor?.desenharEngrenagens(renderer);
        fase.energia?.desenhar(renderer);
        this.desenharBrilhoDaMelhoria(renderer);
        desenharBrilhos(renderer);
    }

    // Um anel de pontos que se abre quando a torre se conserta (mini-chefe morto).
    desenharAnelDoConserto(renderer) {
        const k = this.fase.brilhoDoConserto;
        if (k > 0) {
            const cores = coresDaFase2();
            const raio = 30 + (1 - k) * 18;
            renderer.save();
            renderer.setGlobalAlpha(0.5 * k);
            renderer.setColor(cor(cores.espuma));
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2 + this.tempo * 0.001;
                renderer.fillRect(Math.round(FAROL.x + Math.cos(a) * raio) - 1, Math.round(FAROL.y + Math.sin(a) * raio) - 1, 2, 2);
            }
            renderer.restore();
        }
    }

    // Melhoria escolhida: clarão redondo no farol.
    desenharBrilhoDaMelhoria(renderer) {
        const k = this.fase.brilhoDaMelhoria;
        if (k > 0) {
            const cores = coresDaFase2();
            brilhoRedondo(renderer, cores.fachoMiolo, FAROL.x, FAROL.y, 26 + (1 - k) * 30, 0.22 * k);
        }
    }

    desenharFarol(renderer) {
        const facho = this.fase.facho;
        const quadro = facho?.aceso ? 1 : 0;
        renderer.drawImage(
            loader.getImage(imagem("farol-topo")),
            quadro * TOPO,
            0,
            TOPO,
            TOPO,
            FAROL.x - TOPO / 2,
            FAROL.y - TOPO / 2,
            TOPO,
            TOPO,
        );
    }

    // Arco de pontos em volta do farol que se enche durante a espera.
    desenharArco(renderer) {
        const facho = this.fase.facho;
        if (facho === null) {
            return;
        }
        const cores = coresDaFase2();
        const n = FACHO.arcoPontos;
        const lado = FACHO.arcoPonto;
        const cheios = Math.floor(facho.carga * n + 0.0001);
        const pronto = facho.pronto;
        const pulso = 0.55 + 0.25 * Math.sin(this.tempo * 0.006);
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const x = Math.round(FAROL.x + Math.cos(a) * FACHO.arcoRaio - lado / 2);
            const y = Math.round(FAROL.y + Math.sin(a) * FACHO.arcoRaio - lado / 2);
            if (pronto) {
                pintar(renderer, cores.arcoPronto, x, y, lado, lado, pulso);
            } else if (i < cheios) {
                pintar(renderer, cores.arcoCheio, x, y, lado, lado, 0.9);
            } else {
                pintar(renderer, cores.arcoVazio, x, y, lado, lado, 0.55);
            }
        }
    }
}
