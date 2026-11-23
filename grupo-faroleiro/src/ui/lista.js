import { efeito } from "../systems/som.js";
import { eh } from "./entrada.js";

// Lista vertical de controles (src/ui/controles.js) com um foco só para o
// teclado e o mouse: ↑/↓ mudam o foco, o mouse passando por cima também; as
// outras teclas vão para o controle em foco. Esc chama aoVoltar.
//
// A Lista é um receptor de src/ui/entrada.js: quem a mostra repassa
// teclar/moverPonteiro/apertarPonteiro/soltarPonteiro para ela.
export class Lista {
    constructor(controles, { aoVoltar = null } = {}) {
        this.controles = controles;
        this.aoVoltar = aoVoltar;
        this.foco = this.proximoFocavel(-1, 1);
        // controle que recebeu o clique (recebe o arrastar e o soltar)
        this.segurado = null;
    }

    proximoFocavel(de, direcao) {
        const n = this.controles.length;
        for (let i = 1; i <= n; i++) {
            const j = (((de + direcao * i) % n) + n) % n;
            if (this.controles[j].focavel) {
                return j;
            }
        }
        return -1;
    }

    // Empilha os controles centrados em xCentro, a partir de yTopo, com
    // `espaco` px entre o topo de um e o do próximo.
    posicionar(xCentro, yTopo, espaco) {
        this.controles.forEach((c, i) => {
            c.x = Math.round(xCentro - c.largura / 2);
            c.y = Math.round(yTopo + i * espaco);
        });
    }

    // Foco no controle i (sem som); usado ao abrir uma tela.
    focar(i = this.proximoFocavel(-1, 1)) {
        this.foco = i;
    }

    controleEm(px, py) {
        return this.controles.findIndex((c) => c.focavel && c.contem(px, py));
    }

    teclar(codigo, repeticao) {
        if (eh("voltar", codigo)) {
            if (!repeticao && this.aoVoltar !== null) {
                efeito("clique");
                this.aoVoltar();
            }
            return;
        }
        const atual = this.controles[this.foco];
        if (atual?.teclar?.(codigo, repeticao)) {
            return;
        }
        if (eh("cima", codigo) || eh("baixo", codigo)) {
            const novo = this.proximoFocavel(this.foco, eh("cima", codigo) ? -1 : 1);
            if (novo !== this.foco) {
                this.foco = novo;
                efeito("navegar");
            }
        }
    }

    moverPonteiro(px, py) {
        if (this.segurado !== null) {
            this.segurado.arrastar?.(px, py);
            return;
        }
        const i = this.controleEm(px, py);
        if (i !== -1 && i !== this.foco) {
            this.foco = i;
            efeito("navegar");
        }
    }

    apertarPonteiro(px, py) {
        const i = this.controleEm(px, py);
        if (i === -1) {
            return;
        }
        this.foco = i;
        this.segurado = this.controles[i];
        this.segurado.apertar?.(px, py);
    }

    soltarPonteiro(px, py) {
        const c = this.segurado;
        this.segurado = null;
        c?.soltar?.(px, py);
    }

    desenhar(renderer) {
        this.controles.forEach((c, i) => c.desenhar(renderer, i === this.foco));
    }

    destroy() {
        for (const c of this.controles) {
            c.destroy();
        }
    }
}
