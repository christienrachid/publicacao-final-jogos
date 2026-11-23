import { loader, Renderable } from "melonjs";
import { imagem } from "../systems/estilo.js";
import { partida } from "../systems/partida.js";
import { relogio } from "../systems/relogio.js";
import { FASE1 } from "./config.js";
import { LuzRedonda } from "./escuridao.js";

// Objetos grandes da ilha, desenhados nos pontos do mapa: a casa (com a luz
// da janela), a torre (o estágio vem de partida.pecas; quadro 5 com a
// lente) e os postes (acesos a partir das 19h, com luz quente).

// força da luz acendendo: 0 antes da hora, sobe em `duracao` minutos de jogo
function forcaDasLuzes(duracao = 4) {
    const m = relogio.minutos();
    return Math.min(1, Math.max(0, (m - FASE1.tempo.luzesAcendem) / duracao));
}

// Objeto de pé num ponto (x = meio, y = base), com a imagem do tema.
class ObjetoDePe extends Renderable {
    constructor(ponto, largura, altura) {
        super(ponto.x - largura / 2, ponto.y - altura, largura, altura);
        this.anchorPoint.set(0, 0);
        this.base = { x: ponto.x, y: ponto.y };
    }

    update() {
        return true;
    }
}

export class Casa extends ObjetoDePe {
    constructor(ponto, mapa) {
        super(ponto, 64, 48);
        const l = FASE1.luzes;
        this.luzDaJanela = new LuzRedonda(mapa, this.pos.x + l.janelaX + 0.5, this.pos.y + l.janelaY + 0.5, l.janela);
        this.luzDaJanela.forca = 0;
    }

    atualizar() {
        this.luzDaJanela.forca = forcaDasLuzes();
    }

    draw(renderer) {
        renderer.drawImage(loader.getImage(imagem("casa")), this.pos.x, this.pos.y);
    }
}

// Torre do farol: 6 quadros de 48×128 (0 ruína … 4, 5 com a lanterna).
// API para a cena de conserto (tarefa 7):
//   torre.estagioForcado = n   mostra o quadro n em vez do da partida
//                              (null volta ao automático)
//   torre.estagio              quadro mostrado agora
//   torre.lanterna()           { x, y } da lanterna no alto (quadro 5)
//   torre.centro()             { x, y } do meio da torre
export class Torre extends ObjetoDePe {
    constructor(ponto) {
        super(ponto, 48, 128);
        this.estagioForcado = null;
    }

    get estagio() {
        if (this.estagioForcado !== null) {
            return this.estagioForcado;
        }
        return partida.lente ? 5 : Math.min(4, Math.max(0, partida.pecas));
    }

    lanterna() {
        return { x: this.pos.x + 24, y: this.pos.y + 14 };
    }

    centro() {
        return { x: this.base.x, y: this.base.y - 64 };
    }

    draw(renderer) {
        renderer.drawImage(loader.getImage(imagem("torre")), this.estagio * 48, 0, 48, 128, this.pos.x, this.pos.y, 48, 128);
    }
}

export class Poste extends ObjetoDePe {
    constructor(ponto, mapa) {
        super(ponto, 16, 48);
        const l = FASE1.luzes;
        this.luz = new LuzRedonda(mapa, this.pos.x + l.lampadaX, this.pos.y + l.lampadaY, l.poste);
        this.luz.forca = 0;
    }

    get aceso() {
        return this.luz.forca > 0;
    }

    atualizar() {
        this.luz.forca = forcaDasLuzes();
    }

    draw(renderer) {
        const quadro = this.aceso ? 1 : 0;
        renderer.drawImage(loader.getImage(imagem("poste")), quadro * 16, 0, 16, 48, this.pos.x, this.pos.y, 16, 48);
    }
}