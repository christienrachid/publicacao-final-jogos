import { CONFIG } from "../config.js";
import { FASE1 } from "./config.js";

// Câmera da Fase 1: zoom 2 seguindo o jogador com zona morta e suavização,
// presa aos limites do mapa. Para as cenas da torre e o Holandês (tarefas 7
// e 9) há duas funções exportadas:
//   focarCamera(x, y, zoom, ms)      leva o centro da vista a (x, y) com o
//                                    zoom dado em ms e fica lá; devolve uma
//                                    Promise que resolve ao chegar
//   voltarCameraAoJogador(ms)        volta ao jogador e ao zoom normal;
//                                    Promise que resolve ao chegar
//   seguirNaArea(area, ms)           (Holandês) vai até a área e fica nela:
//                                    a vista segue o alvo que area.alvo(jogador)
//                                    devolve, com o zoom de area.zoom
// Com uma área ativa (o Holandês), voltarCameraAoJogador volta para a área
// e não para o zoom 2: a cena da torre no meio da luta não tira a câmera do
// chefe.
// Zoom não inteiro só acontece durante a transição (pode borrar um pouco).
//
// Em qualquer modo a vista cabe no mapa e não desce mais que
// FASE1.camera.abaixoDoMar px abaixo da linha do mar (mapa.marY). Com uma
// área ativa que tem `topo` (y do mundo, pode ser negativo), a vista pode
// subir até ele, além do alto do mapa (lá só há céu; o céu e a escuridão
// cobrem a vista toda).
//
// A câmera do MelonJS (app.viewport) é a mesma em todas as stages: ao sair
// da fase, soltarCamera() devolve o zoom 1 e os limites da tela.

let ativa = null;

function suave(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraDaFase {
    constructor(camera, mapa, jogador) {
        this.camera = camera;
        this.mapa = mapa;
        this.jogador = jogador;
        this.zoom = FASE1.camera.zoom;
        // centro da vista (px do mundo)
        this.cx = 0;
        this.cy = 0;
        // "seguir", "transicao", "parada" ou "area"
        this.modo = "seguir";
        // área do Holandês: { zoom, suavizar, alvo(jogador) → { x, y }, topo? }
        this.area = null;
        this.transicao = null;
        camera.unfollow();
        camera.setBounds(0, 0, mapa.largura, mapa.altura);
        this.pularParaOJogador();
        ativa = this;
    }

    // alvo do jogador: um pouco acima dos pés
    alvoDoJogador() {
        const p = this.jogador.pes();
        return { x: p.x, y: p.y - FASE1.camera.alturaDoOlhar };
    }

    pularParaOJogador() {
        const alvo = this.alvoDoJogador();
        this.cx = alvo.x;
        this.cy = alvo.y;
        this.zoom = FASE1.camera.zoom;
        this.aplicar();
    }

    // Centro limitado para a vista caber no mapa com o zoom dado e não
    // mostrar mais que abaixoDoMar px abaixo da linha do mar. Com uma área
    // ativa que tem `topo`, o alto da vista pode subir até ele.
    limitar(x, y, zoom) {
        const meiaLargura = CONFIG.largura / zoom / 2;
        const meiaAltura = CONFIG.altura / zoom / 2;
        const topo = Math.min(0, this.area?.topo ?? 0);
        const fundo = Math.min(this.mapa.altura, this.mapa.marY + FASE1.camera.abaixoDoMar);
        const lx = this.mapa.largura <= meiaLargura * 2 ? this.mapa.largura / 2 : Math.min(this.mapa.largura - meiaLargura, Math.max(meiaLargura, x));
        const ly = fundo - topo <= meiaAltura * 2 ? topo + meiaAltura : Math.min(fundo - meiaAltura, Math.max(topo + meiaAltura, y));
        return { x: lx, y: ly };
    }

    aplicar() {
        const c = this.limitar(this.cx, this.cy, this.zoom);
        this.cx = c.x;
        this.cy = c.y;
        const camera = this.camera;
        camera.zoom = this.zoom;
        camera.pos.set(this.cx - CONFIG.largura / this.zoom / 2, this.cy - CONFIG.altura / this.zoom / 2, camera.pos.z);
        camera.isDirty = true;
    }

    atualizar(dtMs) {
        const dt = Math.min(dtMs, 50) / 1000;
        if (this.modo === "seguir") {
            const cfg = FASE1.camera;
            const alvo = this.alvoDoJogador();
            // zona morta: só anda o que passou da borda dela
            let tx = this.cx;
            let ty = this.cy;
            const mx = cfg.zonaMortaLargura / 2;
            const my = cfg.zonaMortaAltura / 2;
            if (alvo.x > this.cx + mx) {
                tx = alvo.x - mx;
            } else if (alvo.x < this.cx - mx) {
                tx = alvo.x + mx;
            }
            if (alvo.y > this.cy + my) {
                ty = alvo.y - my;
            } else if (alvo.y < this.cy - my) {
                ty = alvo.y + my;
            }
            const f = 1 - Math.exp(-cfg.suavizar * dt);
            this.cx += (tx - this.cx) * f;
            this.cy += (ty - this.cy) * f;
        } else if (this.modo === "area") {
            const alvo = this.limitar(...this.alvoDaArea(), this.zoom);
            const f = 1 - Math.exp(-this.area.suavizar * dt);
            this.cx += (alvo.x - this.cx) * f;
            this.cy += (alvo.y - this.cy) * f;
        } else if (this.modo === "transicao") {
            const t = this.transicao;
            t.tempo += dtMs;
            const p = t.duracao <= 0 ? 1 : Math.min(1, t.tempo / t.duracao);
            const s = suave(p);
            // o destino "jogador" se mexe: lido de novo a cada quadro
            let destino = t.destino;
            if (t.paraJogador) {
                destino = this.alvoDoJogador();
            } else if (t.modoFinal === "area") {
                const [x, y] = this.alvoDaArea();
                destino = { x, y };
            }
            const fim = this.limitar(destino.x, destino.y, t.zoomFinal);
            this.zoom = t.zoomInicial + (t.zoomFinal - t.zoomInicial) * s;
            this.cx = t.x0 + (fim.x - t.x0) * s;
            this.cy = t.y0 + (fim.y - t.y0) * s;
            if (p >= 1) {
                this.zoom = t.zoomFinal;
                this.modo = t.modoFinal ?? (t.paraJogador ? "seguir" : "parada");
                this.transicao = null;
                t.resolver();
            }
        }
        this.aplicar();
    }

    // [x, y] do centro que a área quer agora
    alvoDaArea() {
        const a = this.area.alvo(this.jogador);
        return [a.x, a.y];
    }

    iniciarTransicao(destino, zoomFinal, ms, paraJogador, modoFinal = null) {
        if (this.transicao !== null) {
            // a anterior é interrompida: quem esperava por ela segue
            this.transicao.resolver();
        }
        return new Promise((resolver) => {
            this.modo = "transicao";
            this.transicao = {
                tempo: 0,
                duracao: ms,
                x0: this.cx,
                y0: this.cy,
                zoomInicial: this.zoom,
                zoomFinal,
                destino,
                paraJogador,
                modoFinal,
                resolver,
            };
        });
    }

    destroy() {
        this.transicao?.resolver();
        this.transicao = null;
        if (ativa === this) {
            ativa = null;
        }
    }
}

// Leva a câmera a (x, y) com o zoom dado, em ms, e fica parada lá.
export function focarCamera(x, y, zoom = 1, ms = 800) {
    if (ativa === null) {
        return Promise.resolve();
    }
    return ativa.iniciarTransicao({ x, y }, zoom, ms, false);
}

// Leva a câmera até a área (zoom area.zoom) e fica seguindo area.alvo.
// area: { zoom, suavizar, alvo(jogador) → { x, y } (centro da vista),
// topo (opcional): y do mundo até onde o alto da vista pode subir }.
export function seguirNaArea(area, ms = 1000) {
    if (ativa === null) {
        return Promise.resolve();
    }
    ativa.area = area;
    return ativa.iniciarTransicao(null, area.zoom, ms, false, "area");
}

// Volta a seguir o jogador com o zoom normal da fase; com uma área ativa
// (o Holandês), volta para ela.
export function voltarCameraAoJogador(ms = 800) {
    if (ativa === null) {
        return Promise.resolve();
    }
    if (ativa.area !== null) {
        return ativa.iniciarTransicao(null, ativa.area.zoom, ms, false, "area");
    }
    return ativa.iniciarTransicao(null, FASE1.camera.zoom, ms, true);
}

// Devolve a câmera compartilhada ao estado das outras stages.
export function soltarCamera(camera) {
    camera.zoom = 1;
    camera.unfollow();
    camera.setBounds(0, 0, CONFIG.largura, CONFIG.altura);
    camera.pos.set(0, 0, camera.pos.z);
    camera.isDirty = true;
}