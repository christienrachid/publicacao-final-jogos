import { CONFIG } from "../config.js";

// Grade de paredes da fase, lida da camada "paredes" do Tiled.
// Também é usada por systems/luz.js e systems/visibilidade.js para saber onde
// uma parede bloqueia a luz (ver fracaoAteParede).

let colunas = 0;
let linhas = 0;
// 1 = parede, 0 = livre; índice = y * colunas + x
let paredes = new Uint8Array(0);

// cache da BFS: distâncias até o último tile de destino pedido
let destinoEmCache = -1;
let distancias = new Int16Array(0);
let fila = new Int32Array(0);

// os quatro vizinhos (4 direções)
const VIZINHOS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];

// Lê a camada "paredes" do mapa carregado (TMXTileMap) e monta a grade.
export function carregarGrade(mapa) {
    const camada = mapa.getLayers().find((l) => l.name === "paredes");
    if (!camada) {
        throw new Error("caminho: o mapa não tem a camada 'paredes'");
    }
    colunas = camada.cols;
    linhas = camada.rows;
    paredes = new Uint8Array(colunas * linhas);
    for (let y = 0; y < linhas; y++) {
        for (let x = 0; x < colunas; x++) {
            // cellAt devolve null onde não há tile
            paredes[y * colunas + x] = camada.cellAt(x, y) ? 1 : 0;
        }
    }
    distancias = new Int16Array(colunas * linhas);
    fila = new Int32Array(colunas * linhas);
    destinoEmCache = -1;
}

// Converte uma coordenada em pixels para a coluna/linha do tile.
export function tileDe(px) {
    return Math.floor(px / CONFIG.tile);
}

// Centro, em pixels, do tile de coluna/linha dada.
export function centroDoTile(t) {
    return t * CONFIG.tile + CONFIG.tile / 2;
}

// Fora do mapa conta como parede.
export function ehParede(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= colunas || ty >= linhas) {
        return true;
    }
    return paredes[ty * colunas + tx] === 1;
}

// Caminha pela grade de (x0, y0) até (x1, y1), em pixels do mundo (DDA de
// Amanatides-Woo), e devolve a fração do segmento (0..1) em que ele entra no
// primeiro tile de parede: 0 se já começa numa parede, Infinity se nenhuma
// parede fica no caminho. Usada pela regra de luz (systems/luz.js) e pelo
// desenho da área iluminada (systems/visibilidade.js), para os dois
// concordarem sobre onde a luz para.
export function fracaoAteParede(x0, y0, x1, y1) {
    const lado = CONFIG.tile;
    let tx = Math.floor(x0 / lado);
    let ty = Math.floor(y0 / lado);
    const txFim = Math.floor(x1 / lado);
    const tyFim = Math.floor(y1 / lado);
    if (ehParede(tx, ty)) {
        return 0;
    }

    const dx = x1 - x0;
    const dy = y1 - y0;
    const passoX = Math.sign(dx);
    const passoY = Math.sign(dy);
    // quanto do segmento (0..1) é preciso andar para cruzar um tile inteiro
    const deltaX = passoX !== 0 ? lado / Math.abs(dx) : Infinity;
    const deltaY = passoY !== 0 ? lado / Math.abs(dy) : Infinity;
    // fração do segmento até a próxima borda vertical/horizontal de tile
    let limiteX = Infinity;
    if (passoX > 0) {
        limiteX = ((tx + 1) * lado - x0) / dx;
    } else if (passoX < 0) {
        limiteX = (tx * lado - x0) / dx;
    }
    let limiteY = Infinity;
    if (passoY > 0) {
        limiteY = ((ty + 1) * lado - y0) / dy;
    } else if (passoY < 0) {
        limiteY = (ty * lado - y0) / dy;
    }

    // cada passo muda um tile em um eixo, então o total é a distância de Manhattan
    let passos = Math.abs(txFim - tx) + Math.abs(tyFim - ty);
    while (passos-- > 0) {
        // fração em que o segmento cruza a borda e entra no próximo tile
        let entrada;
        if (limiteX < limiteY) {
            entrada = limiteX;
            limiteX += deltaX;
            tx += passoX;
        } else {
            entrada = limiteY;
            limiteY += deltaY;
            ty += passoY;
        }
        if (ehParede(tx, ty)) {
            return entrada;
        }
    }
    return Infinity;
}

// BFS a partir do destino: distância (em passos) de cada tile livre até ele.
function calcularDistancias(destino) {
    distancias.fill(-1);
    let inicio = 0;
    let fim = 0;
    distancias[destino] = 0;
    fila[fim++] = destino;
    while (inicio < fim) {
        const atual = fila[inicio++];
        const ax = atual % colunas;
        const ay = (atual - ax) / colunas;
        for (const [dx, dy] of VIZINHOS) {
            const nx = ax + dx;
            const ny = ay + dy;
            if (ehParede(nx, ny)) {
                continue;
            }
            const indice = ny * colunas + nx;
            if (distancias[indice] !== -1) {
                continue;
            }
            distancias[indice] = distancias[atual] + 1;
            fila[fim++] = indice;
        }
    }
    destinoEmCache = destino;
}

// Próximo tile para ir de `deTile` até `paraTile` (ambos { x, y } em tiles).
// Devolve { x, y } ou null se já chegou, se não há caminho ou se algum está numa parede.
// A BFS só é refeita quando o destino muda de tile; as paredes não mudam durante a fase.
export function proximoPasso(deTile, paraTile) {
    if (ehParede(deTile.x, deTile.y) || ehParede(paraTile.x, paraTile.y)) {
        return null;
    }
    if (deTile.x === paraTile.x && deTile.y === paraTile.y) {
        return null;
    }
    const destino = paraTile.y * colunas + paraTile.x;
    if (destino !== destinoEmCache) {
        calcularDistancias(destino);
    }
    const distanciaAtual = distancias[deTile.y * colunas + deTile.x];
    if (distanciaAtual === -1) {
        return null;
    }
    for (const [dx, dy] of VIZINHOS) {
        const nx = deTile.x + dx;
        const ny = deTile.y + dy;
        if (ehParede(nx, ny)) {
            continue;
        }
        if (distancias[ny * colunas + nx] === distanciaAtual - 1) {
            return { x: nx, y: ny };
        }
    }
    return null;
}