import { HOLANDES } from "../config.js";
import { coresDoHolandes } from "./cores.js";
import { cor } from "./efeitos.js";

// Névoa verde baixa do Holandês: flocos achatados derivando rente ao chão
// do morro e das encostas (HOLANDES.nevoa.meiaLargura px para cada lado do
// x do morro), por cima da escuridão. `densidade` vai de 0 (sem névoa) a 1
// (a da entrada) e 2 (a da etapa 3, mais alta e mais opaca); muda aos poucos
// até `alvo`.

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

// y do chão do terreno (topo do primeiro tile sólido) na coluna de x: os
// andaimes não contam (a névoa e a sombra do navio ficam no chão embaixo
// deles); no mar, a linha do mar.
export function chaoDoTerreno(mapa, x) {
    const tx = Math.floor(x / mapa.lado);
    for (let ty = 0; ty < mapa.linhas; ty++) {
        if (mapa.solido(tx, ty)) {
            return Math.min(ty * mapa.lado, mapa.marY);
        }
    }
    return mapa.marY;
}

export class Nevoa {
    // centroX: x do morro (px do mundo)
    constructor(mapa, centroX) {
        const n = HOLANDES.nevoa;
        this.mapa = mapa;
        this.x0 = Math.max(0, centroX - n.meiaLargura);
        this.x1 = Math.min(mapa.largura, centroX + n.meiaLargura);
        this.densidade = 0;
        this.alvo = 0;
        this.tempo = 0;
        this.flocos = [];
        for (let i = 0; i < n.flocos; i++) {
            this.flocos.push({
                x: sortear(this.x0, this.x1),
                // 0 a 1: altura dentro da faixa (normal ou densa)
                altura: Math.random(),
                raio: sortear(n.raio[0], n.raio[1]),
                vx: sortear(n.deriva[0], n.deriva[1]) * (Math.random() < 0.5 ? -1 : 1),
                fase: Math.random() * Math.PI * 2,
            });
        }
    }

    // dt em segundos
    atualizar(dt) {
        const n = HOLANDES.nevoa;
        this.tempo += dt;
        const passo = (dt / n.transicao) * 2;
        if (this.densidade < this.alvo) {
            this.densidade = Math.min(this.alvo, this.densidade + passo);
        } else if (this.densidade > this.alvo) {
            this.densidade = Math.max(this.alvo, this.densidade - passo);
        }
        const largura = this.x1 - this.x0;
        for (const f of this.flocos) {
            f.x += f.vx * dt;
            if (f.x > this.x1) {
                f.x -= largura;
            } else if (f.x < this.x0) {
                f.x += largura;
            }
        }
    }

    // vista: { x, y, largura, altura } (px do mundo)
    desenhar(renderer, vista) {
        const d = this.densidade;
        if (d <= 0.01) {
            return;
        }
        const n = HOLANDES.nevoa;
        const densa = Math.max(0, Math.min(1, d - 1));
        const alfa = d <= 1 ? n.opacidade * d : n.opacidade + (n.opacidadeDensa - n.opacidade) * densa;
        const alturaMax = n.altura[1] + (n.alturaDensa[1] - n.altura[1]) * densa;
        const cores = coresDoHolandes();
        const fundo = cor(cores.fantasma);
        const claro = cor(cores.fantasmaClaro);
        renderer.save();
        for (const f of this.flocos) {
            const r = f.raio * (1 + densa * 0.4);
            if (f.x + r < vista.x || f.x - r > vista.x + vista.largura) {
                continue;
            }
            const chao = chaoDoTerreno(this.mapa, f.x);
            const ondula = Math.sin(this.tempo * 0.7 + f.fase) * 3;
            const y = Math.round(chao - f.altura * alturaMax - r * 0.2 + ondula);
            const x = Math.round(f.x);
            renderer.setGlobalAlpha(alfa);
            renderer.setColor(fundo);
            renderer.fillEllipse(x, y, r, Math.max(3, r * 0.42));
            renderer.setGlobalAlpha(alfa * 0.6);
            renderer.setColor(claro);
            renderer.fillEllipse(x, y - 1, r * 0.55, Math.max(2, r * 0.2));
        }
        renderer.restore();
    }
}