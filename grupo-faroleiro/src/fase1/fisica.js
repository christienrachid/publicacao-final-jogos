// Física de plataforma da Fase 1: uma caixa (AABB) andando na grade do mapa
// da ilha, sem o mundo de física do MelonJS. Serve para o jogador e para os
// monstros que andam no chão (tarefa 7).
//
// Um corpo é um objeto simples:
//   { x, y,              canto de cima à esquerda da caixa (px do mundo)
//     largura, altura,
//     vx, vy,            px/s
//     noChao,            pisando em algo (sólido ou tábua) depois de mover
//     naTabua,           pisando numa tábua (e não num sólido)
//     bateuX,            -1/1 se bateu numa parede andando, senão 0
//     bateuCabeca,       bateu num sólido subindo
//     atravessar }       > 0: ignora as tábuas de mão única por esse tempo (s)
//
// As tábuas só seguram quem vem de cima: o pé tinha que estar acima do topo
// da tábua antes do passo. Com `atravessar` > 0 o corpo passa por elas
// (descer do andaime com ↓).

// maior deslocamento num subpasso, para não atravessar um tile num quadro lento
const SUBPASSO = 6;
// folga para comparar bordas
const FOLGA = 0.001;

export function criarCorpo(x, y, largura, altura) {
    return {
        x,
        y,
        largura,
        altura,
        vx: 0,
        vy: 0,
        noChao: false,
        naTabua: false,
        bateuX: 0,
        bateuCabeca: false,
        atravessar: 0,
    };
}

// Move o corpo dt segundos pela velocidade dele, parando nos sólidos e nas
// tábuas. limites = { esquerdo, direito } opcionais (px), paredes invisíveis.
export function moverCorpo(corpo, dt, mapa, limites = null) {
    corpo.bateuX = 0;
    corpo.bateuCabeca = false;
    corpo.noChao = false;
    corpo.naTabua = false;
    corpo.atravessar = Math.max(0, corpo.atravessar - dt);

    const dx = corpo.vx * dt;
    const dy = corpo.vy * dt;
    const passos = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SUBPASSO));
    for (let i = 0; i < passos; i++) {
        moverX(corpo, dx / passos, mapa, limites);
        moverY(corpo, dy / passos, mapa);
    }
    // parado em cima de algo: confere o chão logo abaixo dos pés
    if (!corpo.noChao && corpo.vy >= 0) {
        const tipo = chaoAbaixo(corpo, mapa, corpo.y + corpo.altura);
        if (tipo !== null) {
            corpo.noChao = true;
            corpo.naTabua = tipo === "tabua";
        }
    }
}

function moverX(corpo, dx, mapa, limites) {
    if (dx === 0) {
        return;
    }
    const lado = mapa.lado;
    corpo.x += dx;
    const topo = Math.floor(corpo.y / lado);
    const base = Math.floor((corpo.y + corpo.altura - FOLGA) / lado);
    if (dx > 0) {
        const tx = Math.floor((corpo.x + corpo.largura - FOLGA) / lado);
        for (let ty = topo; ty <= base; ty++) {
            if (mapa.solido(tx, ty)) {
                corpo.x = tx * lado - corpo.largura;
                corpo.vx = 0;
                corpo.bateuX = 1;
                break;
            }
        }
    } else {
        const tx = Math.floor(corpo.x / lado);
        for (let ty = topo; ty <= base; ty++) {
            if (mapa.solido(tx, ty)) {
                corpo.x = (tx + 1) * lado;
                corpo.vx = 0;
                corpo.bateuX = -1;
                break;
            }
        }
    }
    if (limites !== null) {
        if (limites.esquerdo !== undefined && corpo.x < limites.esquerdo) {
            corpo.x = limites.esquerdo;
            corpo.vx = Math.max(0, corpo.vx);
            corpo.bateuX = -1;
        }
        if (limites.direito !== undefined && corpo.x + corpo.largura > limites.direito) {
            corpo.x = limites.direito - corpo.largura;
            corpo.vx = Math.min(0, corpo.vx);
            corpo.bateuX = 1;
        }
    }
}

function moverY(corpo, dy, mapa) {
    if (dy === 0) {
        return;
    }
    const lado = mapa.lado;
    const baseAntes = corpo.y + corpo.altura;
    corpo.y += dy;
    const esquerda = Math.floor(corpo.x / lado);
    const direita = Math.floor((corpo.x + corpo.largura - FOLGA) / lado);
    if (dy > 0) {
        const ty = Math.floor((corpo.y + corpo.altura - FOLGA) / lado);
        const topoDoTile = ty * lado;
        for (let tx = esquerda; tx <= direita; tx++) {
            const solido = mapa.solido(tx, ty);
            // tábua: só segura se o pé estava acima dela antes do passo
            const tabua = !solido && corpo.atravessar <= 0 && mapa.plataforma(tx, ty) && baseAntes <= topoDoTile + FOLGA;
            if (solido || tabua) {
                corpo.y = topoDoTile - corpo.altura;
                corpo.vy = 0;
                corpo.noChao = true;
                corpo.naTabua = !solido;
                return;
            }
        }
    } else {
        const ty = Math.floor(corpo.y / lado);
        for (let tx = esquerda; tx <= direita; tx++) {
            if (mapa.solido(tx, ty)) {
                corpo.y = (ty + 1) * lado;
                corpo.vy = 0;
                corpo.bateuCabeca = true;
                return;
            }
        }
    }
}

// "solido", "tabua" ou null: o que fica logo abaixo de y (pés) sob a caixa.
function chaoAbaixo(corpo, mapa, y) {
    const lado = mapa.lado;
    // só conta se os pés estão exatamente na borda de um tile
    if (Math.abs(y - Math.round(y / lado) * lado) > 0.01) {
        return null;
    }
    const ty = Math.round(y / lado);
    const esquerda = Math.floor(corpo.x / lado);
    const direita = Math.floor((corpo.x + corpo.largura - FOLGA) / lado);
    let tabua = false;
    for (let tx = esquerda; tx <= direita; tx++) {
        if (mapa.solido(tx, ty)) {
            return "solido";
        }
        if (corpo.atravessar <= 0 && mapa.plataforma(tx, ty)) {
            tabua = true;
        }
    }
    return tabua ? "tabua" : null;
}

// true se as duas caixas ({ x, y, largura, altura }) se tocam.
export function sobrepoe(a, b) {
    return a.x < b.x + b.largura && a.x + a.largura > b.x && a.y < b.y + b.altura && a.y + a.altura > b.y;
}