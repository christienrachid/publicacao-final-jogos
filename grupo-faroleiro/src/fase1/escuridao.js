import { Color, Light2d } from "melonjs";
import { desenharBrilhos } from "../systems/brilhos.js";
import { dadosDoEstilo } from "../systems/estilo.js";
import { relogio } from "../systems/relogio.js";
import { AreaVisivel, ConeVisivel } from "../systems/visibilidade.js";
import { FASE1 } from "./config.js";

// Escuridão da Fase 1 e as luzes que recortam ela, como na versão 1
// (PlayStage.desenharLuzes): anéis de escuridão em que cada luz abre um
// buraco que para no terreno, e por cima o brilho de cada luz, recortado
// pela própria área. Depois vêm os brilhos registrados (brilhos.js): lua,
// estrelas, partículas acesas.
//
// Só desenho: quem decide se um monstro está na luz é a lanterna
// (lanterna.js), com a mesma caminhada pela grade.
//
// Uma luz é qualquer objeto com:
//   ativa()                     se ilumina agora
//   calcular(mapa)              refaz a área (uma vez por quadro)
//   poligono(escala)            área encolhida para os anéis (1 = inteira)
//   luz                         Light2d (fora do mundo) para o brilho
//   alcance()                   raio para saber se está perto da vista
//   x, y                        centro

// anéis: do de fora para o de dentro (ver alfaDoAnel)
const ESCALAS_ANEL = [1.0, 0.82, 0.64, 0.46];
// o cone estreita até esta fração da abertura no anel mais de dentro
const ESTREITAR_CONE = 0.55;

// opacidade de cada anel para N anéis iguais somarem `longe`
function alfaDoAnel(longe) {
    return 1 - Math.pow(1 - longe, 1 / ESCALAS_ANEL.length);
}

// Escuridão do mundo na hora m (0 a FASE1.tempo.escuridaoMaxima).
export function escuridaoNaHora(m = relogio.minutos()) {
    const t = FASE1.tempo;
    const f = Math.min(1, Math.max(0, (m - t.escuridaoInicio) / (t.escuridaoFim - t.escuridaoInicio)));
    return t.escuridaoMaxima * f * f * (3 - 2 * f);
}

// Luz redonda que para no terreno (postes, janela, aura do jogador).
export class LuzRedonda {
    constructor(mapa, x, y, { raio, cor, intensidade }) {
        this.x = x;
        this.y = y;
        this.raio = raio;
        this.intensidade = intensidade;
        // 0 a 1: acendendo ou apagando (multiplica raio e brilho)
        this.forca = 1;
        this.tremor = { lenta: Math.random() * Math.PI * 2, rapida: Math.random() * Math.PI * 2 };
        this.area = new AreaVisivel({ fracaoAteParede: mapa.fracaoAteSolido, entradaNaParede: FASE1.luzes.entradaNoChao });
        this.luz = new Light2d(x, y, raio, raio, cor, intensidade);
        this.raioAtual = raio;
    }

    ativa() {
        return this.forca > 0.01;
    }

    alcance() {
        return this.raio;
    }

    calcular(_mapa, tempo) {
        const onda = 0.6 * Math.sin(tempo * 8.6 + this.tremor.lenta) + 0.4 * Math.sin(tempo * 23 + this.tremor.rapida);
        this.raioAtual = Math.max(1, (this.raio + FASE1.luzes.tremor * onda) * this.forca);
        this.area.calcular(this.x, this.y, this.raioAtual);
        this.luz.pos.set(this.x, this.y);
        this.luz.setRadii(this.raioAtual);
        this.luz.intensity = this.intensidade * this.forca;
    }

    poligono(escala) {
        return this.area.poligono(escala);
    }

    // pode ser chamado mais de uma vez (a escuridão e o dono destroem)
    destroy() {
        if (!this.destruida) {
            this.destruida = true;
            this.luz.destroy();
        }
    }
}

// Luz em cone que para no terreno (a lanterna).
export class LuzCone {
    constructor(mapa, { cor, intensidade }) {
        this.x = 0;
        this.y = 0;
        this.angulo = 0;
        this.abertura = 0;
        this.raio = 0;
        this.intensidade = intensidade;
        this.forca = 0;
        this.area = new ConeVisivel({ fracaoAteParede: mapa.fracaoAteSolido, entradaNaParede: FASE1.luzes.entradaNoChao });
        this.luz = new Light2d(0, 0, 10, 10, cor, intensidade);
    }

    ativa() {
        return this.forca > 0.01 && this.raio > 0;
    }

    alcance() {
        return this.raio;
    }

    // a lanterna põe a posição, a direção, a abertura e o alcance aqui
    apontar(x, y, angulo, abertura, raio) {
        this.x = x;
        this.y = y;
        this.angulo = angulo;
        this.abertura = abertura;
        this.raio = raio;
    }

    calcular() {
        this.area.calcular(this.x, this.y, this.angulo, this.abertura, this.raio);
        this.luz.pos.set(this.x, this.y);
        this.luz.setRadii(this.raio);
        this.luz.intensity = this.intensidade * this.forca;
    }

    poligono(escala) {
        return this.area.poligono(escala, ESTREITAR_CONE);
    }

    // pode ser chamado mais de uma vez (a escuridão e o dono destroem)
    destroy() {
        if (!this.destruida) {
            this.destruida = true;
            this.luz.destroy();
        }
    }
}

// O passe de luz da fase: chamado pelo drawLighting da Fase1Stage.
export class Escuridao {
    constructor(mapa) {
        this.mapa = mapa;
        this.luzes = new Set();
        this.doQuadro = [];
        this.cor = new Color();
        this.tempo = 0;
    }

    adicionar(luz) {
        this.luzes.add(luz);
        return luz;
    }

    remover(luz) {
        this.luzes.delete(luz);
    }

    atualizar(dt) {
        this.tempo += dt / 1000;
    }

    // vista: { x, y, largura, altura } em pixels do mundo
    desenhar(renderer, camera, translateX, translateY, vista) {
        renderer.save();
        if (translateX !== 0 || translateY !== 0) {
            renderer.translate(-translateX, -translateY);
        }
        // margem como no Stage#drawLighting do MelonJS
        const margem = Math.ceil(camera.zoom) / camera.zoom;
        const x = translateX - margem;
        const y = translateY - margem;
        const largura = vista.largura + margem * 2;
        const altura = vista.altura + margem * 2;

        // só as luzes acesas perto da vista, calculadas uma vez
        const luzes = this.doQuadro;
        luzes.length = 0;
        for (const luz of this.luzes) {
            if (!luz.ativa()) {
                continue;
            }
            const r = luz.alcance();
            if (luz.x + r < vista.x || luz.x - r > vista.x + vista.largura || luz.y + r < vista.y || luz.y - r > vista.y + vista.altura) {
                continue;
            }
            luz.calcular(this.mapa, this.tempo);
            luzes.push(luz);
        }

        // anéis de escuridão, cada um com um buraco por luz
        const longe = escuridaoNaHora();
        if (longe > 0.001) {
            const { jogo } = dadosDoEstilo();
            this.cor.parseCSS(jogo.escuridao);
            this.cor.alpha = alfaDoAnel(longe);
            renderer.setBlendMode("normal");
            for (const escala of ESCALAS_ANEL) {
                for (const luz of luzes) {
                    renderer.setMask(luz.poligono(escala), true);
                }
                // save/restore em volta da cor: na GPU o setColor multiplica a
                // opacidade pela anterior, e no Canvas ela vale para o resto
                renderer.save();
                renderer.setColor(this.cor);
                renderer.fillRect(x, y, largura, altura);
                renderer.restore();
                renderer.clearMask();
            }
        }

        // brilho de cada luz, recortado pela própria área
        for (const luz of luzes) {
            renderer.setMask(luz.poligono(1), false);
            luz.luz.preDraw(renderer);
            renderer.drawLight(luz.luz);
            luz.luz.postDraw(renderer);
            renderer.clearMask();
        }
        renderer.setBlendMode("normal");

        // lua, estrelas, faíscas e o que mais brilha no escuro
        desenharBrilhos(renderer);
        renderer.restore();
    }

    destroy() {
        for (const luz of this.luzes) {
            luz.destroy?.();
        }
        this.luzes.clear();
    }
}