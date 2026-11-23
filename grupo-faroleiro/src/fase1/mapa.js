import { loader, TMXTileMap } from "melonjs";
import { CONFIG } from "../config.js";
import { nomeDaFase } from "../systems/estilo.js";
import { fracaoNaGrade } from "../systems/visibilidade.js";

// Mapa da ilha (public/data/map/ilha-<tema>.tmj, gerado por
// tools/gerar-ilha.mjs). As camadas de tiles vão para o mundo; os objetos
// NÃO viram Renderables: este módulo lê do JSON do mapa a grade sólida
// (camada "terreno"), as tábuas de mão única (camada "plataformas") e os
// pontos (camada de objetos "pontos").
//
// API para as entidades da fase (jogador, monstros, peças, chefe):
//   mapa.solido(tx, ty), mapa.plataforma(tx, ty)   tiles (colunas/linhas)
//   mapa.solidoEm(x, y), mapa.plataformaEm(x, y)    pixels do mundo
//   mapa.ponto("Casa")       o primeiro ponto com esse nome: { x, y, largura, altura, propriedades }
//   mapa.pontos("Poste")     todos os pontos com esse nome
//   mapa.alturaDoChao(x, yDe) y do topo do primeiro sólido/tábua abaixo de yDe
//   mapa.largura, mapa.altura, mapa.limiteEsquerdo, mapa.limiteDireito, mapa.marY
//   mapa.fracaoAteSolido(x0, y0, x1, y1)  caminhada na grade (luz, visão)

// camadas de tiles e a ordem de desenho de cada uma (z no mundo); os
// números do meio ficam para as entidades (ver Z em Fase1Stage)
export const Z_CAMADAS = {
    fundo: 3,
    mar: 4,
    decoracao: 5,
    terreno: 8,
    plataformas: 9,
    frente: 14,
};

function lerPropriedades(lista) {
    const props = {};
    for (const p of lista ?? []) {
        props[p.name] = p.value;
    }
    return props;
}

export class MapaDaIlha {
    constructor() {
        this.tmx = null;
        this.camadas = [];
        this.colunas = 0;
        this.linhas = 0;
        this.lado = CONFIG.tile;
        this.solidos = new Uint8Array(0);
        this.tabuas = new Uint8Array(0);
        this.objetos = [];
        this.propriedades = {};
        // topo (y em px) da silhueta de cada coluna: o que fica na frente do
        // céu (terreno, tábuas, decoração e objetos grandes), para as
        // estrelas e a lua não passarem por cima (ver silhueta)
        this.topoDaSilhueta = new Float64Array(0);
        // a caminhada da luz e da visão usa este objeto
        this.grade = {
            lado: this.lado,
            ehSolido: (tx, ty) => this.solido(tx, ty),
        };
        this.fracaoAteSolido = (x0, y0, x1, y1) => fracaoNaGrade(this.grade, x0, y0, x1, y1);
    }

    get largura() {
        return this.colunas * this.lado;
    }

    get altura() {
        return this.linhas * this.lado;
    }

    get limiteEsquerdo() {
        return this.propriedades.limiteEsquerdo ?? 0;
    }

    get limiteDireito() {
        return this.propriedades.limiteDireito ?? this.largura;
    }

    get marY() {
        return this.propriedades.marY ?? this.altura;
    }

    // Lê o mapa do estilo atual: grade, pontos e as camadas de tiles (ainda
    // fora do mundo; ver colocarNoMundo).
    carregar(base = "ilha") {
        const id = nomeDaFase(base);
        const dados = loader.getTMX(id);
        if (!dados) {
            throw new Error(`mapa da ilha: "${id}" não foi carregado (src/recursos.js)`);
        }
        this.tmx = new TMXTileMap(id, dados);
        this.colunas = dados.width;
        this.linhas = dados.height;
        this.lado = dados.tilewidth;
        this.grade.lado = this.lado;
        this.propriedades = lerPropriedades(dados.properties);

        const camadaDeDados = (nome) => dados.layers.find((l) => l.name === nome);
        const grade = (nome) => {
            const camada = camadaDeDados(nome);
            const g = new Uint8Array(this.colunas * this.linhas);
            if (camada) {
                camada.data.forEach((gid, i) => {
                    g[i] = gid > 0 ? 1 : 0;
                });
            }
            return g;
        };
        this.solidos = grade("terreno");
        this.tabuas = grade("plataformas");

        this.objetos = [];
        for (const camada of dados.layers) {
            if (camada.type !== "objectgroup") {
                continue;
            }
            for (const o of camada.objects) {
                this.objetos.push({
                    camada: camada.name,
                    nome: o.name,
                    x: o.x,
                    y: o.y,
                    largura: o.width,
                    altura: o.height,
                    propriedades: lerPropriedades(o.properties),
                });
            }
        }
        this.calcularSilhueta(dados);
        this.camadas = this.tmx.getLayers();
        return this;
    }

    // Põe as camadas de tiles no container (o mundo), cada uma no seu z.
    colocarNoMundo(container) {
        for (const camada of this.camadas) {
            const z = Z_CAMADAS[camada.name];
            if (z === undefined) {
                continue;
            }
            container.addChild(camada, z);
        }
    }

    // ---- consultas ---------------------------------------------------------

    // Tile sólido (terreno ou caixa). Fora do mapa: sólido só embaixo.
    solido(tx, ty) {
        if (ty >= this.linhas) {
            return true;
        }
        if (tx < 0 || ty < 0 || tx >= this.colunas) {
            return false;
        }
        return this.solidos[ty * this.colunas + tx] === 1;
    }

    // Tábua de andaime (plataforma de mão única).
    plataforma(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= this.colunas || ty >= this.linhas) {
            return false;
        }
        return this.tabuas[ty * this.colunas + tx] === 1;
    }

    solidoEm(x, y) {
        return this.solido(Math.floor(x / this.lado), Math.floor(y / this.lado));
    }

    plataformaEm(x, y) {
        return this.plataforma(Math.floor(x / this.lado), Math.floor(y / this.lado));
    }

    // y (px) do topo do primeiro chão (sólido ou tábua) na coluna de x, a
    // partir de yDe para baixo; o fundo do mapa se não houver nenhum.
    alturaDoChao(x, yDe = 0) {
        const tx = Math.floor(x / this.lado);
        for (let ty = Math.max(0, Math.floor(yDe / this.lado)); ty < this.linhas; ty++) {
            if (this.solido(tx, ty) || this.plataforma(tx, ty)) {
                return ty * this.lado;
            }
        }
        return this.altura;
    }

    // O primeiro ponto (camada "pontos") com o nome dado, ou null.
    ponto(nome) {
        return this.objetos.find((o) => o.camada === "pontos" && o.nome === nome) ?? null;
    }

    // Todos os pontos com o nome dado.
    pontos(nome) {
        return this.objetos.filter((o) => o.camada === "pontos" && o.nome === nome);
    }

    // ---- silhueta contra o céu ----------------------------------------------

    calcularSilhueta(dados) {
        const topo = new Float64Array(this.colunas).fill(this.altura);
        // o mar não entra: o reflexo da lua desenha em cima dele
        for (const camada of dados.layers) {
            if (camada.type !== "tilelayer" || camada.name === "mar") {
                continue;
            }
            camada.data.forEach((gid, i) => {
                if (gid > 0) {
                    const tx = i % this.colunas;
                    const y = Math.floor(i / this.colunas) * this.lado;
                    topo[tx] = Math.min(topo[tx], y);
                }
            });
        }
        // casa (64×48), torre (48×128) e postes (16×48), de pé nos pontos
        const objetosAltos = [
            ["Casa", 64, 48],
            ["Torre", 48, 128],
            ["Poste", 16, 48],
        ];
        for (const [nome, largura, altura] of objetosAltos) {
            for (const p of this.objetos.filter((o) => o.camada === "pontos" && o.nome === nome)) {
                const c0 = Math.floor((p.x - largura / 2) / this.lado);
                const c1 = Math.floor((p.x + largura / 2 - 1) / this.lado);
                for (let c = Math.max(0, c0); c <= Math.min(this.colunas - 1, c1); c++) {
                    topo[c] = Math.min(topo[c], p.y - altura);
                }
            }
        }
        this.topoDaSilhueta = topo;
    }

    // Preenche `pontos` (array de Vector2d reaproveitado) com o polígono do
    // céu visível na vista [x0, x1] × [y0, y1]: tudo acima da silhueta.
    // Devolve quantos pontos foram usados.
    silhueta(x0, y0, x1, y1, pontos) {
        const lado = this.lado;
        const c0 = Math.max(0, Math.floor(x0 / lado));
        const c1 = Math.min(this.colunas - 1, Math.floor(x1 / lado));
        let n = 0;
        const por = (x, y) => {
            pontos[n++].set(x, Math.min(y1, Math.max(y0, y)));
        };
        por(x0, y0);
        por(x1, y0);
        // da direita para a esquerda, dois pontos por coluna
        for (let c = c1; c >= c0; c--) {
            const y = this.topoDaSilhueta[c];
            por(Math.min(x1, (c + 1) * lado), y);
            por(Math.max(x0, c * lado), y);
        }
        return n;
    }
}