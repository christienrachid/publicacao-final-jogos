import { emitirFaiscas, emitirFumaca } from "../../systems/particulas.js";
import { efeito } from "../../systems/som.js";
import { desenharIcone, ICONE } from "../../ui/Hud.js";
import { HOLANDES } from "../config.js";
import { coresDoHolandes } from "./cores.js";
import { retangulo } from "./efeitos.js";

// Balas de canhão do Holandês: numa rajada
// cada bala tem um X (itens 13) que pisca no chão HOLANDES.aviso segundos
// antes do impacto. A bala (itens 12) sai de um canhão do navio com som de
// canhão, voa em arco com rastro de fogo e explode no X: fumaça, faíscas,
// tremor e 1 de dano se o jogador estiver no raio.
//
// Tempo de cada bala (t desde o X aparecer):
//   0 ............ aviso - voo ........ aviso
//   X piscando     disparo (canhão)     impacto

const ICONE_BALA = 12;
const ICONE_X = 13;

function sortear(min, max) {
    return min + Math.random() * (max - min);
}

export class Balas {
    // holandes: o chefe (fase, navio, efeitos)
    constructor(holandes) {
        this.holandes = holandes;
        this.fase = holandes.fase;
        this.mapa = holandes.fase.mapa;
        this.lista = [];
    }

    get ativas() {
        return this.lista.length > 0;
    }

    // Chão (y) no x dado, perto da altura `perto` (os pés do jogador): o
    // primeiro chão abaixo de um pouco acima dele. Se esse ponto cai dentro
    // do terreno (o relevo sobe ali), sobe até o ar antes de procurar.
    chao(x, perto) {
        const mapa = this.mapa;
        const tx = Math.floor(x / mapa.lado);
        let ty = Math.floor(Math.max(0, perto - 40) / mapa.lado);
        while (ty > 0 && mapa.solido(tx, ty)) {
            ty--;
        }
        return Math.min(mapa.alturaDoChao(x, ty * mapa.lado), mapa.marY);
    }

    // Uma rajada de `quantidade` balas em volta do jogador, uma a cada
    // HOLANDES.entreBalas segundos. Os X só caem em volta do morro (entre
    // holandes.alvoMinimoX e alvoMaximoX): com o jogador longe dali, a fila
    // fica inteira na ponta do morro do lado dele.
    rajada(quantidade) {
        const jogador = this.fase.jogador;
        const pes = jogador.pes();
        const minimo = Math.max(this.holandes.alvoMinimoX, this.mapa.limiteEsquerdo + 8);
        const maximo = Math.min(this.holandes.alvoMaximoX, this.mapa.limiteDireito - 8);
        // os X em fila, centrada no jogador, numa ordem sorteada
        const meiaFila = ((quantidade - 1) / 2) * HOLANDES.espalhar;
        const centro = Math.min(maximo - meiaFila, Math.max(minimo + meiaFila, pes.x));
        const xs = [];
        for (let i = 0; i < quantidade; i++) {
            const deslocamento = (i - (quantidade - 1) / 2) * HOLANDES.espalhar;
            const x = centro + deslocamento + sortear(-HOLANDES.espalharSorteio, HOLANDES.espalharSorteio);
            xs.push(Math.min(maximo, Math.max(minimo, x)));
        }
        for (let i = xs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [xs[i], xs[j]] = [xs[j], xs[i]];
        }
        xs.forEach((x, i) => {
            this.lista.push({
                x,
                y: this.chao(x, pes.y),
                t: -i * HOLANDES.entreBalas,
                disparada: false,
                ox: 0,
                oy: 0,
                bx: 0,
                by: 0,
                rastro: [],
                canhao: HOLANDES.canhoes[i % HOLANDES.canhoes.length],
            });
        });
    }

    // dt em segundos
    atualizar(dt) {
        const navio = this.holandes.navio;
        const disparo = HOLANDES.aviso - HOLANDES.voo;
        let j = 0;
        for (let i = 0; i < this.lista.length; i++) {
            const b = this.lista[i];
            b.t += dt;
            if (!b.disparada && b.t >= disparo) {
                b.disparada = true;
                const o = navio.pontoDoQuadro(b.canhao.x, b.canhao.y);
                b.ox = o.x;
                b.oy = o.y;
                efeito("canhao");
                this.holandes.efeitos.explodir(o.x, o.y, 6, ["fogoClaro", "fogo", "fumaca"], { velocidade: [15, 45], duracao: [0.3, 0.6], subida: -15 });
            }
            if (b.disparada) {
                const p = Math.min(1, (b.t - disparo) / HOLANDES.voo);
                b.bx = b.ox + (b.x - b.ox) * p;
                b.by = b.oy + (b.y - 6 - b.oy) * p - 4 * HOLANDES.alturaDoArco * p * (1 - p);
                b.rastro.unshift(b.bx, b.by);
                if (b.rastro.length > HOLANDES.rastro * 2) {
                    b.rastro.length = HOLANDES.rastro * 2;
                }
            }
            if (b.t >= HOLANDES.aviso) {
                this.explodir(b);
                continue;
            }
            this.lista[j++] = b;
        }
        this.lista.length = j;
    }

    explodir(b) {
        const y = b.y - 4;
        emitirFumaca(b.x, y, 8, 7, true);
        emitirFaiscas(b.x, y, 10);
        this.holandes.efeitos.explodir(b.x, y, 14, ["fogoClaro", "fogo", "fogoEscuro"], { velocidade: [40, 110], duracao: [0.3, 0.6], subida: -40, gravidade: 160 });
        efeito("explosao");
        this.fase.app.viewport.shake(HOLANDES.tremorDaExplosao, HOLANDES.tremorDaExplosaoMs);
        // dano: o ponto da caixa do jogador mais perto do impacto dentro do raio
        const jogador = this.fase.jogador;
        if (jogador.vivo) {
            const c = jogador.caixa();
            const px = Math.min(c.x + c.largura, Math.max(c.x, b.x));
            const py = Math.min(c.y + c.altura, Math.max(c.y, y));
            if (Math.hypot(px - b.x, py - y) <= HOLANDES.raioDaExplosao) {
                jogador.levarDano(HOLANDES.danoDaBala, { x: b.x, y });
            }
        }
    }

    // Tira tudo sem explodir (navio vencido).
    limpar() {
        this.lista.length = 0;
    }

    // Por cima da escuridão: X piscando, rastro e bala.
    desenhar(renderer) {
        if (this.lista.length === 0) {
            return;
        }
        const cores = coresDoHolandes();
        for (const b of this.lista) {
            if (b.t < 0) {
                continue;
            }
            // X: pisca mais rápido perto do impacto
            const falta = HOLANDES.aviso - b.t;
            const periodo = 0.06 + 0.12 * (falta / HOLANDES.aviso);
            if (Math.floor(b.t / periodo) % 2 === 0) {
                desenharIcone(renderer, ICONE_X, b.x - ICONE / 2, b.y - ICONE + 3);
            }
        }
        for (const b of this.lista) {
            if (!b.disparada) {
                continue;
            }
            const n = b.rastro.length / 2;
            for (let k = 1; k < n; k++) {
                const t = k / n;
                const lado = t < 0.4 ? 3 : t < 0.75 ? 2 : 1;
                const nome = t < 0.3 ? "fogoClaro" : t < 0.6 ? "fogo" : "fogoEscuro";
                retangulo(renderer, cores[nome], b.rastro[k * 2] - lado / 2, b.rastro[k * 2 + 1] - lado / 2, lado, lado, 0.9 * (1 - t));
            }
            desenharIcone(renderer, ICONE_BALA, b.bx - ICONE / 2, b.by - ICONE / 2);
        }
    }
}