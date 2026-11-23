// Imagem RGBA em memória e codificação PNG, sem dependências (node:zlib).
// Usado por todos os geradores de arte em tools/.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// pseudoaleatório com semente (mulberry32): a mesma semente dá sempre a mesma arte
export function criarAleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "#rrggbb" ou "#rrggbbaa" -> [r, g, b, a]
export function hex(cor) {
  return [
    parseInt(cor.slice(1, 3), 16),
    parseInt(cor.slice(3, 5), 16),
    parseInt(cor.slice(5, 7), 16),
    cor.length >= 9 ? parseInt(cor.slice(7, 9), 16) : 255,
  ];
}

export class Imagem {
  constructor(largura, altura) {
    this.largura = largura;
    this.altura = altura;
    this.pixels = new Uint8Array(largura * altura * 4);
  }

  // cor: [r, g, b, a]; fora da imagem é ignorado
  pintar(x, y, cor) {
    if (x < 0 || y < 0 || x >= this.largura || y >= this.altura) return;
    this.pixels.set(cor, (y * this.largura + x) * 4);
  }

  ler(x, y) {
    const i = (y * this.largura + x) * 4;
    return Array.from(this.pixels.subarray(i, i + 4));
  }

  retangulo(x, y, largura, altura, cor) {
    for (let yy = y; yy < y + altura; yy++) {
      for (let xx = x; xx < x + largura; xx++) this.pintar(xx, yy, cor);
    }
  }

  // copia outra imagem para (x, y), pulando pixels transparentes; escala inteira opcional
  colar(origem, x, y, escala = 1) {
    for (let yy = 0; yy < origem.altura; yy++) {
      for (let xx = 0; xx < origem.largura; xx++) {
        const cor = origem.ler(xx, yy);
        if (cor[3] === 0) continue;
        for (let ey = 0; ey < escala; ey++) {
          for (let ex = 0; ex < escala; ex++) {
            this.pintar(x + xx * escala + ex, y + yy * escala + ey, cor);
          }
        }
      }
    }
  }

  codificar() {
    const cabecalho = Buffer.alloc(13);
    cabecalho.writeUInt32BE(this.largura, 0);
    cabecalho.writeUInt32BE(this.altura, 4);
    cabecalho[8] = 8; // 8 bits por canal
    cabecalho[9] = 6; // RGBA
    const linha = this.largura * 4;
    const bruto = Buffer.alloc((linha + 1) * this.altura);
    for (let y = 0; y < this.altura; y++) {
      // cada linha começa com o byte de filtro 0
      bruto[y * (linha + 1)] = 0;
      Buffer.from(this.pixels.buffer, y * linha, linha).copy(
        bruto,
        y * (linha + 1) + 1,
      );
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      bloco("IHDR", cabecalho),
      bloco("IDAT", deflateSync(bruto)),
      bloco("IEND", Buffer.alloc(0)),
    ]);
  }

  salvar(caminho) {
    mkdirSync(dirname(caminho), { recursive: true });
    writeFileSync(caminho, this.codificar());
  }
}

// Desenho em texto: uma linha por fileira de pixels, um caractere por pixel.
// "." é transparente; cada outro caractere é procurado em `legenda`, que diz
// o papel de cor (ver paletas.mjs). Devolve {largura, altura, papeis[]},
// com papeis[y][x] = número do papel ou 0.
export function lerDesenho(texto, legenda) {
  const linhas = texto
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .map((l) => l.trim());
  const largura = Math.max(...linhas.map((l) => l.length));
  const papeis = linhas.map((l, y) =>
    Array.from(l.padEnd(largura, ".")).map((c, x) => {
      if (c === ".") return 0;
      const papel = legenda[c];
      if (papel === undefined) {
        throw new Error(
          `desenho: caractere '${c}' sem papel na legenda (linha ${y}, coluna ${x})`,
        );
      }
      return papel;
    }),
  );
  return { largura, altura: linhas.length, papeis };
}

// ---- PNG ----
const tabelaCrc = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  tabelaCrc[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = tabelaCrc[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const t = Buffer.from(tipo, "ascii");
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tamanho, t, dados, crc]);
}
