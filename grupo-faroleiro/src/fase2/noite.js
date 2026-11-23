import { Ellipse, Polygon, Renderable, Vector2d } from "melonjs";
import { CONFIG } from "../config.js";
import { FAROL, FACHO, MELHORIA, MUNDO, NIVEL_MAXIMO, NOITE } from "./config.js";
import { coresDaFase2 } from "./cores.js";

// A noite da Fase 2: escurece o mapa e deixa o facho e o halo do farol
// clarearem o que tocam. A escuridão vem em anéis (como na versão 1): cada
// anel escurece tudo menos as luzes encolhidas para ele, e a soma dos anéis
// dá NOITE.escuridao longe de qualquer luz. O facho em guia clareia os anéis
// de fora; disparando, clareia todos e ganha um brilho forte (aditivo).
// Com o Facho duplo, o cone oposto recorta a noite do mesmo jeito e brilha
// na força dele (MELHORIA.duplo).
//
// Só desenho: a regra do facho fica em src/fase2/facho.js.

// pontos do arco de cada cone (mais pontos = borda mais redonda)
const PONTOS_DO_ARCO = 10;
// camadas do brilho aditivo: cones do mesmo ângulo com alcances crescentes,
// somados o miolo fica mais claro que a ponta
const CAMADAS_DA_GUIA = 4;
const CAMADAS_DO_DISPARO = 5;
const CAMADAS_DO_MIOLO = 3;
// opacidade de cada camada (antes do reforço por nível)
const ALFA_GUIA = 0.03;
const ALFA_DISPARO = 0.11;
const ALFA_MIOLO = 0.12;
// o miolo do disparo ocupa esta fração da abertura
const ABERTURA_DO_MIOLO = 0.38;
// reforço do brilho por engrenagem (fração)
const REFORCO_POR_NIVEL = 0.2;
// halo aditivo em volta da lanterna: raio e opacidade
const HALO_RAIO = 44;
const HALO_ALFA = 0.05;

// opacidade de cada anel para que todos somem `longe`
function alfaDoAnel(longe, aneis) {
    return 1 - Math.pow(1 - longe, 1 / aneis);
}

// Cone reaproveitável: um Polygon com o farol e o arco.
class Cone {
    constructor() {
        this.pontos = [];
        for (let i = 0; i < PONTOS_DO_ARCO + 1; i++) {
            this.pontos.push(new Vector2d(0, 0));
        }
        this.poligono = new Polygon(0, 0, this.pontos);
    }

    // cone com ápice no farol, na direção `angulo`, abertura total e alcance
    definir(angulo, abertura, alcance, boca = 0) {
        const p = this.pontos;
        p[0].set(FAROL.x + Math.cos(angulo) * boca, FAROL.y + Math.sin(angulo) * boca);
        const n = PONTOS_DO_ARCO;
        for (let i = 0; i < n; i++) {
            const a = angulo - abertura / 2 + (abertura * i) / (n - 1);
            p[i + 1].set(FAROL.x + Math.cos(a) * alcance, FAROL.y + Math.sin(a) * alcance);
        }
        this.poligono.setVertices(p);
        return this.poligono;
    }
}

export class Noite extends Renderable {
    // fase: a Fase2Stage (facho)
    constructor(fase) {
        super(0, 0, MUNDO.largura, MUNDO.altura);
        this.anchorPoint.set(0, 0);
        this.alwaysUpdate = true;
        this.fase = fase;
        this.cones = NOITE.aneisDoFacho.map(() => new Cone());
        this.conesOpostos = NOITE.aneisDoFacho.map(() => new Cone());
        this.brilho = new Cone();
        this.halos = NOITE.halo.map((r) => new Ellipse(FAROL.x, FAROL.y, r * 2, r * 2));
        this.alfaAnel = alfaDoAnel(NOITE.escuridao, NOITE.halo.length);
        this.tempo = 0;
    }

    update(dt) {
        this.tempo += dt;
        return true;
    }

    // intensidade do disparo (0 a 1): sobe rápido, segura e apaga no fim
    intensidadeDoDisparo(facho) {
        if (!facho.disparando) {
            return 0;
        }
        const t = facho.tempo;
        return Math.min(1, t / 0.04) * Math.min(1, Math.max(0, facho.duracao - t) / 0.09 + 0.25);
    }

    draw(renderer) {
        const facho = this.fase.facho;
        if (facho === null) {
            return;
        }
        const camera = this.parentApp.viewport;
        const x = camera.pos.x + camera.offset.x - 4;
        const y = camera.pos.y + camera.offset.y - 4;
        const largura = CONFIG.largura + 8;
        const altura = CONFIG.altura + 8;
        const cores = coresDaFase2();
        const disparo = this.intensidadeDoDisparo(facho);
        const anel = NOITE.aneisDoFacho;

        // escuridão em anéis, recortada pelo halo e pelo facho
        renderer.save();
        renderer.setBlendMode("normal");
        for (let i = 0; i < this.halos.length; i++) {
            renderer.setMask(this.halos[i], true);
            if (i < anel.length - 1 || disparo > 0) {
                const abertura = facho.abertura * anel[i].abertura;
                const alcance = facho.alcance * anel[i].alcance;
                renderer.setMask(this.cones[i].definir(facho.angulo, abertura, alcance), true);
                if (facho.duplo) {
                    renderer.setMask(this.conesOpostos[i].definir(facho.anguloOposto, abertura, alcance), true);
                }
            }
            renderer.save();
            renderer.setGlobalAlpha(this.alfaAnel);
            renderer.setColor(cores.noite);
            renderer.fillRect(x, y, largura, altura);
            renderer.restore();
            renderer.clearMask();
        }
        renderer.restore();

        // brilho aditivo: guia sempre, disparo forte por cima
        const reforco = 1 + REFORCO_POR_NIVEL * facho.nivel + facho.realce * 0.8;
        const tremula = 1 + Math.sin(this.tempo * 0.007) * 0.05 + Math.sin(this.tempo * 0.019) * 0.03;
        renderer.save();
        renderer.setBlendMode("additive");
        this.desenharBrilho(renderer, facho, facho.angulo, reforco * tremula, disparo, cores);
        if (facho.duplo) {
            this.desenharBrilho(renderer, facho, facho.anguloOposto, reforco * tremula * MELHORIA.duplo, disparo, cores);
        }
        // halo da lanterna, mais forte disparando
        renderer.setColor(cores.halo);
        const halo = HALO_ALFA * (1 + facho.nivel / NIVEL_MAXIMO) * tremula + disparo * 0.12 + facho.realce * 0.15;
        renderer.setGlobalAlpha(Math.min(1, halo));
        renderer.fillEllipse(FAROL.x, FAROL.y, HALO_RAIO, HALO_RAIO);
        renderer.setGlobalAlpha(Math.min(1, halo));
        renderer.fillEllipse(FAROL.x, FAROL.y, HALO_RAIO * 0.6, HALO_RAIO * 0.6);
        renderer.setBlendMode("normal");
        renderer.restore();
    }

    // Brilho aditivo de um cone na direção `angulo`: a guia sempre e, com
    // `disparo` > 0, o disparo forte e o miolo. `forca` multiplica tudo.
    desenharBrilho(renderer, facho, angulo, forca, disparo, cores) {
        renderer.setColor(cores.facho);
        const alfaGuia = ALFA_GUIA * forca * (1 - disparo * 0.5);
        for (let k = 1; k <= CAMADAS_DA_GUIA; k++) {
            renderer.setGlobalAlpha(alfaGuia);
            renderer.fill(this.brilho.definir(angulo, facho.abertura, (facho.alcance * k) / CAMADAS_DA_GUIA, FACHO.raioDaBoca));
        }
        if (disparo <= 0) {
            return;
        }
        renderer.setColor(cores.fachoForte);
        for (let k = 1; k <= CAMADAS_DO_DISPARO; k++) {
            renderer.setGlobalAlpha(Math.min(1, ALFA_DISPARO * disparo * forca));
            renderer.fill(this.brilho.definir(angulo, facho.abertura, (facho.alcance * k) / CAMADAS_DO_DISPARO, FACHO.raioDaBoca));
        }
        renderer.setColor(cores.fachoMiolo);
        for (let k = 1; k <= CAMADAS_DO_MIOLO; k++) {
            renderer.setGlobalAlpha(Math.min(1, ALFA_MIOLO * disparo * forca));
            renderer.fill(
                this.brilho.definir(
                    angulo,
                    facho.abertura * ABERTURA_DO_MIOLO,
                    (facho.alcance * 0.9 * k) / CAMADAS_DO_MIOLO,
                    FACHO.raioDaBoca,
                ),
            );
        }
    }
}
