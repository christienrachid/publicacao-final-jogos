import { FAROL, ILHA, MAR } from "./config.js";

// Forma da ilha da Fase 2, igual à desenhada em farol-ilha-<tema>.png:
// cópia de naIlha() de tools/gerar-farol-arte.mjs e de criarRuido() de
// tools/arte/util-farol.mjs (o jogo não importa os geradores). Daqui saem a
// areia onde as piranhas saltam, a água das ondas e a grama dos vaga-lumes.

function criarRuido(semente) {
    const hash = (ix, iy) => {
        let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(semente, 982451653)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
    const suave = (t) => t * t * (3 - 2 * t);
    const valor = (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = suave(x - x0);
        const fy = suave(y - y0);
        const a = hash(x0, y0);
        const b = hash(x0 + 1, y0);
        const c = hash(x0, y0 + 1);
        const d = hash(x0 + 1, y0 + 1);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    return (x, y, oitavas = 3) => {
        let soma = 0;
        let amplitude = 1;
        let total = 0;
        let freq = 1;
        for (let i = 0; i < oitavas; i++) {
            soma += valor(x * freq + i * 17.3, y * freq - i * 9.1) * amplitude;
            total += amplitude;
            amplitude *= 0.5;
            freq *= 2;
        }
        return soma / total;
    };
}

// semente 11, a mesma do gerador
const ruidoBorda = criarRuido(11);

// true se o pixel (x, y) é terra (grama, caminho ou areia).
export function naIlha(x, y) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const dx = (px + 0.5 - ILHA.cx) / ILHA.rx;
    const dy = (py + 0.5 - ILHA.cy) / ILHA.ry;
    const a = Math.atan2(dy, dx);
    const r =
        1 +
        0.06 * Math.sin(3 * a + 0.8) +
        0.045 * Math.sin(5 * a + 2.3) +
        0.03 * Math.sin(7 * a + 4.1) +
        0.09 * (ruidoBorda(px / 26, py / 26, 3) - 0.5);
    return Math.hypot(dx, dy) < r;
}

// Distância do farol até a beira da água em cada direção, a cada
// MAR.passoDaCosta graus (calculada uma vez, na primeira consulta).
let costa = null;

function prepararCosta() {
    const passos = Math.round(360 / MAR.passoDaCosta);
    costa = new Float32Array(passos);
    for (let i = 0; i < passos; i++) {
        const a = (i * MAR.passoDaCosta * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        let d = 30;
        while (d < 400 && naIlha(FAROL.x + c * d, FAROL.y + s * d)) {
            d += 1;
        }
        costa[i] = d;
    }
}

// Distância do farol até a beira da água na direção `angulo` (radianos;
// 0 = direita, π/2 = baixo), interpolada entre as amostras.
export function distanciaDaCosta(angulo) {
    if (costa === null) {
        prepararCosta();
    }
    const passos = costa.length;
    let t = ((angulo * 180) / Math.PI / MAR.passoDaCosta) % passos;
    if (t < 0) {
        t += passos;
    }
    const i = Math.floor(t);
    const f = t - i;
    return costa[i] * (1 - f) + costa[(i + 1) % passos] * f;
}

// Ponto da beira da água na direção `angulo`, `fora` px mar adentro.
export function pontoDaCosta(angulo, fora = 0, saida = { x: 0, y: 0 }) {
    const d = distanciaDaCosta(angulo) + fora;
    saida.x = FAROL.x + Math.cos(angulo) * d;
    saida.y = FAROL.y + Math.sin(angulo) * d;
    return saida;
}
