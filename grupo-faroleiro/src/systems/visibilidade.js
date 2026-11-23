import { Polygon, Vector2d } from "melonjs";
import { fracaoAteParede } from "./caminho.js";

// Área que uma luz enxerga, para o DESENHO da luz: o recorte na escuridão e
// o brilho param na primeira parede, como a regra de gameplay de luz.js
// (as duas usam a mesma caminhada pela grade, fracaoAteParede).
//
// De cada luz saem RAIOS raios igualmente espaçados; cada um vai até a
// primeira parede ou até o raio da luz, o que vier antes. As pontas formam
// um polígono em volta do centro.
//
// ConeVisivel é a mesma ideia para um cone (a lanterna da Fase 1): raios só
// entre o ângulo de início e o de fim. As duas classes aceitam a caminhada
// pela grade como opção; sem ela usam a grade de caminho.js, como na
// versão 1. fracaoNaGrade faz a caminhada numa grade qualquer.

// quantidade de raios por luz
export const RAIOS = 96;
// raios de um cone (ConeVisivel), de uma borda à outra
export const RAIOS_DO_CONE = 24;
// quanto, em pixels, a ponta de um raio entra na parede que ele atinge, para
// a face da parede virada para a luz aparecer acesa
const ENTRADA_NA_PAREDE = 2;

// direção de cada raio (fixa)
const COSSENOS = new Float64Array(RAIOS);
const SENOS = new Float64Array(RAIOS);
for (let i = 0; i < RAIOS; i++) {
    const angulo = (i / RAIOS) * Math.PI * 2;
    COSSENOS[i] = Math.cos(angulo);
    SENOS[i] = Math.sin(angulo);
}

// Polígono em leque: o vértice 0 é o centro da luz, depois vem a ponta de
// cada raio e, fechado, a primeira ponta de novo. Toda ponta é visível do
// centro, então os triângulos (centro, ponta i, ponta i + 1) cobrem o
// polígono sem sobrepor. Esses índices são fixos e substituem a triangulação
// genérica (earcut) que os renderizadores de GPU fariam a cada máscara. No
// Canvas o contorno passa duas vezes pelo segmento centro → primeira ponta,
// que não tem área e não muda o recorte.
class PoligonoEmLeque extends Polygon {
    // pontas: quantidade de raios; fechado: a última ponta volta à primeira
    constructor(pontas = RAIOS, fechado = true) {
        const total = fechado ? pontas + 2 : pontas + 1;
        const pontos = [];
        for (let i = 0; i < total; i++) {
            pontos.push(new Vector2d(0, 0));
        }
        super(0, 0, pontos);
        this.leque = [];
        for (let i = 1; i < total - 1; i++) {
            this.leque.push(0, i, i + 1);
        }
    }

    getIndices() {
        return this.leque;
    }
}

// Caminha pela grade de (x0, y0) até (x1, y1), em pixels do mundo (DDA de
// Amanatides-Woo), e devolve a fração do segmento (0..1) em que ele entra no
// primeiro tile sólido: 0 se já começa num sólido, Infinity se nenhum fica
// no caminho. grade = { lado, ehSolido(tx, ty) }.
export function fracaoNaGrade(grade, x0, y0, x1, y1) {
    const lado = grade.lado;
    let tx = Math.floor(x0 / lado);
    let ty = Math.floor(y0 / lado);
    const txFim = Math.floor(x1 / lado);
    const tyFim = Math.floor(y1 / lado);
    if (grade.ehSolido(tx, ty)) {
        return 0;
    }
    const dx = x1 - x0;
    const dy = y1 - y0;
    const passoX = Math.sign(dx);
    const passoY = Math.sign(dy);
    const deltaX = passoX !== 0 ? lado / Math.abs(dx) : Infinity;
    const deltaY = passoY !== 0 ? lado / Math.abs(dy) : Infinity;
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
    let passos = Math.abs(txFim - tx) + Math.abs(tyFim - ty);
    while (passos-- > 0) {
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
        if (grade.ehSolido(tx, ty)) {
            return entrada;
        }
    }
    return Infinity;
}

// Área visível de uma luz. Cada luz guarda a sua (nada é alocado por quadro):
// `calcular` refaz os raios uma vez por quadro, e `poligono` monta o
// polígono para cada escala a partir desse mesmo cálculo.
//
// Opções (todas opcionais; sem elas vale o comportamento da versão 1):
//   fracaoAteParede(x0, y0, x1, y1)  caminhada pela grade (padrão: a grade
//                                    de caminho.js)
//   entradaNaParede                  quanto a ponta entra na parede, em px
export class AreaVisivel {
    constructor({ fracaoAteParede: fracao = fracaoAteParede, entradaNaParede = ENTRADA_NA_PAREDE } = {}) {
        this.fracaoAteParede = fracao;
        this.entradaNaParede = entradaNaParede;
        this.x = 0;
        this.y = 0;
        this.raio = 0;
        // distância do centro até a ponta de cada raio que bate numa parede
        // (já com a entrada na parede); Infinity se o raio não bate em nada
        this.alcance = new Float64Array(RAIOS);
        this.forma = new PoligonoEmLeque();
    }

    // Refaz os raios a partir de (x, y), em pixels do mundo, até `raio`.
    calcular(x, y, raio) {
        this.x = x;
        this.y = y;
        this.raio = raio;
        for (let i = 0; i < RAIOS; i++) {
            const fracao = this.fracaoAteParede(x, y, x + COSSENOS[i] * raio, y + SENOS[i] * raio);
            this.alcance[i] = fracao === Infinity ? Infinity : fracao * raio + this.entradaNaParede;
        }
    }

    // Polígono (em pixels do mundo) com cada raio limitado a raio * escala.
    // Devolve sempre o mesmo objeto: use antes de pedir outra escala.
    poligono(escala) {
        const limite = this.raio * escala;
        const pontos = this.forma.points;
        pontos[0].set(this.x, this.y);
        for (let i = 0; i < RAIOS; i++) {
            const distancia = Math.min(this.alcance[i], limite);
            pontos[i + 1].set(this.x + COSSENOS[i] * distancia, this.y + SENOS[i] * distancia);
        }
        pontos[RAIOS + 1].set(pontos[1].x, pontos[1].y);
        // recalcula arestas e limites; com um array de Vector2d não copia nada
        return this.forma.setVertices(pontos);
    }
}

// Cone visível: raios de `angulo - abertura / 2` a `angulo + abertura / 2`
// (radianos), cada um parando na primeira parede ou no alcance. Mesmas
// opções de AreaVisivel.
export class ConeVisivel {
    constructor({ fracaoAteParede: fracao = fracaoAteParede, entradaNaParede = ENTRADA_NA_PAREDE, raios = RAIOS_DO_CONE } = {}) {
        this.fracaoAteParede = fracao;
        this.entradaNaParede = entradaNaParede;
        this.raios = raios;
        this.x = 0;
        this.y = 0;
        this.angulo = 0;
        this.abertura = 0;
        this.alcanceMaximo = 0;
        // ângulo e distância até a parede de cada raio (Infinity: livre)
        this.angulos = new Float64Array(raios + 1);
        this.alcance = new Float64Array(raios + 1);
        this.forma = new PoligonoEmLeque(raios + 1, false);
    }

    // Refaz os raios a partir de (x, y) na direção `angulo`.
    calcular(x, y, angulo, abertura, alcance) {
        this.x = x;
        this.y = y;
        this.angulo = angulo;
        this.abertura = abertura;
        this.alcanceMaximo = alcance;
        for (let i = 0; i <= this.raios; i++) {
            const a = angulo - abertura / 2 + (abertura * i) / this.raios;
            this.angulos[i] = a;
            const fracao = this.fracaoAteParede(x, y, x + Math.cos(a) * alcance, y + Math.sin(a) * alcance);
            this.alcance[i] = fracao === Infinity ? Infinity : fracao * alcance + this.entradaNaParede;
        }
    }

    // Polígono com o alcance limitado a alcance * escala e a abertura
    // estreitada para abertura * (estreitar + (1 - estreitar) * escala): os
    // anéis da escuridão saem mais curtos E mais estreitos, e a borda do
    // cone fica suave dos lados também. Devolve sempre o mesmo objeto.
    poligono(escala, estreitar = 1) {
        const limite = this.alcanceMaximo * escala;
        const fator = estreitar + (1 - estreitar) * escala;
        const pontos = this.forma.points;
        pontos[0].set(this.x, this.y);
        for (let i = 0; i <= this.raios; i++) {
            const a = this.angulo + (this.angulos[i] - this.angulo) * fator;
            const distancia = Math.min(this.alcance[i], limite);
            pontos[i + 1].set(this.x + Math.cos(a) * distancia, this.y + Math.sin(a) * distancia);
        }
        return this.forma.setVertices(pontos);
    }
}