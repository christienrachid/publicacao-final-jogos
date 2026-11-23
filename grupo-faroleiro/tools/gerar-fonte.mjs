// Gera a fonte de pixel do jogo: public/data/fnt/pixel.png + pixel.fnt
// (AngelCode BMFont em texto) e a prévia previas/previa-fonte.png.
//   node tools/gerar-fonte.mjs
//
// Métrica:
//   - linha de 11 px; cada glifo ocupa a célula inteira (altura 11, yoffset 0)
//   - linhas 0..1: acentos das maiúsculas; maiúsculas nas linhas 2..8 (7 px)
//   - linha de base em y = 9; descendentes nas linhas 9..10
//   - minúsculas: altura x de 5 px (linhas 4..8), acentos nas linhas 1..2
//   - maiúscula acentuada perde uma linha (fica com 6 px, linhas 3..8) para o
//     acento caber com 1 px de folga dentro dos 11 px da linha
//   - 1 px entre letras (xadvance = largura + 1); espaço avança 3 px
//
// Por que a célula inteira: no MelonJS 20.12 o BitmapText usa a altura do glifo
// "M" como altura de linha (BitmapTextData.capHeight), não o lineHeight do .fnt.
// Com todos os glifos em 11 px de altura, a linha fica com 11 px como o esperado.
//
// Uso no jogo (conferido em node_modules/melonjs/build/index.js):
//   loader.preload([
//       { name: "pixel", type: "binary", src: "data/fnt/pixel.fnt" },
//       { name: "pixel", type: "image",  src: "data/fnt/pixel.png" },
//   ], aoCarregar);
//   const t = new BitmapText(x, y, { font: "pixel", text: "Óleo: 30", fillStyle: "#f2a541", size: 2 });
import { Imagem, hex } from "./arte/png.mjs";
import { ESTILOS } from "./arte/paletas.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const ALTURA = 11;
const BASE = 9;
const TOPO_MAIUSCULA = 2;
const LARGURA_DA_PAGINA = 128;
const AVANCO_DO_ESPACO = 3;

// Glifos: linhas separadas por "/", a partir da linha 2 da célula; "#" acende o
// pixel e uma linha vazia é uma linha em branco.
const GLIFOS = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#",
  B: "####./#...#/#...#/####./#...#/#...#/####.",
  C: ".###./#...#/#..../#..../#..../#...#/.###.",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####",
  F: "#####/#..../#..../####./#..../#..../#....",
  G: ".###./#...#/#..../#.###/#...#/#...#/.####",
  H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: "###/.#./.#./.#./.#./.#./###",
  J: "...#/...#/...#/...#/...#/#..#/.##.",
  K: "#...#/#..#./#.#../##.../#.#../#..#./#...#",
  L: "#.../#.../#.../#.../#.../#.../####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#",
  N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#",
  O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
  R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".###./#...#/#..../.###./....#/#...#/.###.",
  T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/.#.#./.#.#./..#..",
  W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#",
  X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..",
  Z: "#####/....#/...#./..#../.#.../#..../#####",

  a: "//.##./...#/.###/#..#/.###",
  b: "#.../#.../###./#..#/#..#/#..#/###.",
  c: "//.###/#.../#.../#.../.###",
  d: "...#/...#/.###/#..#/#..#/#..#/.###",
  e: "//.##./#..#/####/#.../.###",
  f: ".##/#../###/#../#../#../#..",
  g: "//.###/#..#/#..#/#..#/.###/...#/###.",
  h: "#.../#.../###./#..#/#..#/#..#/#..#",
  i: "#//#/#/#/#/#",
  j: ".#//.#/.#/.#/.#/.#/.#/#.",
  k: "#.../#.../#..#/#.#./##../#.#./#..#",
  l: "#./#./#./#./#./#./.#",
  m: "//##.#./#.#.#/#.#.#/#.#.#/#.#.#",
  n: "//###./#..#/#..#/#..#/#..#",
  o: "//.##./#..#/#..#/#..#/.##.",
  p: "//###./#..#/#..#/#..#/###./#.../#...",
  q: "//.###/#..#/#..#/#..#/.###/...#/...#",
  r: "//#.##/##../#.../#.../#...",
  s: "//.###/#.../.##./...#/###.",
  t: "/.#./###/.#./.#./.#./..#",
  u: "//#..#/#..#/#..#/#..#/.###",
  v: "//#...#/#...#/.#.#./.#.#./..#..",
  w: "//#...#/#...#/#.#.#/#.#.#/.#.#.",
  x: "//#...#/.#.#./..#../.#.#./#...#",
  y: "//#..#/#..#/#..#/#..#/.###/...#/.##.",
  z: "//####/...#/.##./#.../####",

  0: ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
  1: "..#../.##../..#../..#../..#../..#../.###.",
  2: ".###./#...#/....#/...#./..#../.#.../#####",
  3: ".###./#...#/....#/..##./....#/#...#/.###.",
  4: "...#./..##./.#.#./#..#./#####/...#./...#.",
  5: "#####/#..../####./....#/....#/#...#/.###.",
  6: ".###./#..../#..../####./#...#/#...#/.###.",
  7: "#####/....#/...#./..#../..#../..#../..#..",
  8: ".###./#...#/#...#/.###./#...#/#...#/.###.",
  9: ".###./#...#/#...#/.####/....#/....#/.###.",

  "!": "#/#/#/#/#//#",
  '"': "#.#/#.#",
  "#": "/.#.#./#####/.#.#./#####/.#.#.",
  $: "..#../.####/#.#../.###./..#.#/####./..#..",
  "%": "##..#/##.#./...#./..#../.#.../.#.##/#..##",
  "&": ".##../#..#./#.#../.#.../#.#.#/#..#./.##.#",
  "'": "#/#",
  "(": ".#/#./#./#./#./#./.#",
  ")": "#./.#/.#/.#/.#/.#/#.",
  "*": "//#.#/.#./#.#",
  "+": "//.#./###/.#.",
  ",": "/////.#/.#/#.",
  "-": "///###",
  ".": "//////#",
  "/": "....#/...#./...#./..#../.#.../.#.../#....",
  ":": "///#///#",
  ";": "///.#///.#/#.",
  "<": "/..#/.#./#../.#./..#",
  "=": "//####//####",
  ">": "/#../.#./..#/.#./#..",
  "?": ".###./#...#/....#/...#./..#..//..#..",
  "@": ".###./#...#/#.###/#.#.#/#.##./#..../.###.",
  "[": "##/#./#./#./#./#./##",
  "\\": "#..../.#.../.#.../..#../...#./...#./....#",
  "]": "##/.#/.#/.#/.#/.#/##",
  "^": ".#./#.#",
  _: "///////####",
  "`": "#./.#",
  "{": "..#/.#./.#./#../.#./.#./..#",
  "|": "#/#/#/#/#/#/#/#/#",
  "}": "#../.#./.#./..#/.#./.#./#..",
  "~": "//.#.#/#.#.",

  "—": "///#######",
  "·": "///#",
  "…": "//////#.#.#",
};

// acentos (2 linhas)
const ACENTOS = {
  agudo: [".#", "#."],
  grave: ["#.", ".#"],
  circunflexo: [".#.", "#.#"],
  til4: [".#.#", "#.#."],
  til5: [".##.#", "#.##."],
};

// letra acentuada: [base, acento]
const ACENTUADAS = {
  Á: ["A", "agudo"],
  À: ["A", "grave"],
  Â: ["A", "circunflexo"],
  Ã: ["A", "til5"],
  É: ["E", "agudo"],
  Ê: ["E", "circunflexo"],
  Í: ["I", "agudo"],
  Ó: ["O", "agudo"],
  Ô: ["O", "circunflexo"],
  Õ: ["O", "til5"],
  Ú: ["U", "agudo"],
  á: ["a", "agudo"],
  à: ["a", "grave"],
  â: ["a", "circunflexo"],
  ã: ["a", "til4"],
  é: ["e", "agudo"],
  ê: ["e", "circunflexo"],
  í: ["ı", "agudo"],
  ó: ["o", "agudo"],
  ô: ["o", "circunflexo"],
  õ: ["o", "til4"],
  ú: ["u", "agudo"],
};
// "i" sem pingo, só para montar o í
const I_SEM_PINGO = "///#/#/#/#/#";

// texto do glifo -> matriz 11 × largura de booleanos (célula inteira)
function celula(definicao, linhaInicial = TOPO_MAIUSCULA) {
  const linhas = definicao.split("/");
  const largura = Math.max(...linhas.map((l) => l.length));
  const m = Array.from({ length: ALTURA }, () =>
    new Array(largura).fill(false),
  );
  linhas.forEach((l, i) => {
    const y = linhaInicial + i;
    if (y >= ALTURA && l.includes("#"))
      throw new Error(
        `fonte: glifo '${definicao}' passa da linha ${ALTURA - 1}`,
      );
    Array.from(l).forEach((c, x) => {
      if (c === "#") m[y][x] = true;
    });
  });
  return m;
}

function acentuada(base, nomeDoAcento) {
  const ehMaiuscula = base === base.toUpperCase() && base !== "ı";
  let definicao = base === "ı" ? I_SEM_PINGO : GLIFOS[base];
  let inicio = TOPO_MAIUSCULA;
  if (ehMaiuscula) {
    // tira a 2ª linha da letra (a mais repetitiva) e desce o topo 1 px
    const ls = definicao.split("/");
    ls.splice(1, 1);
    definicao = ls.join("/");
    inicio = TOPO_MAIUSCULA + 1;
  }
  const corpo = celula(definicao, inicio);
  const acento = ACENTOS[nomeDoAcento];
  const larguraDoAcento = acento[0].length;
  // no í o acento fica à direita da haste; em cima dela ele vira um pingo comprido
  const iSemPingo = base === "ı";
  const largura = iSemPingo ? 3 : Math.max(corpo[0].length, larguraDoAcento);
  const m = Array.from({ length: ALTURA }, () =>
    new Array(largura).fill(false),
  );
  const dxCorpo = iSemPingo ? 0 : Math.floor((largura - corpo[0].length) / 2);
  corpo.forEach((l, y) => l.forEach((v, x) => v && (m[y][x + dxCorpo] = true)));
  const dxAcento = Math.ceil((largura - larguraDoAcento) / 2);
  const yAcento = ehMaiuscula ? 0 : 1;
  acento.forEach((l, y) =>
    Array.from(l).forEach(
      (c, x) => c === "#" && (m[yAcento + y][dxAcento + x] = true),
    ),
  );
  return m;
}

function cedilha(base, gancho) {
  const m = celula(GLIFOS[base]);
  gancho.forEach((l, y) =>
    Array.from(l).forEach((c, x) => c === "#" && (m[BASE + y][x] = true)),
  );
  return m;
}

// todos os caracteres pedidos, na ordem do arquivo
const CARACTERES = [];
for (let c = 32; c <= 126; c++) CARACTERES.push(String.fromCharCode(c));
CARACTERES.push(..."ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç—·…");

function matrizDe(ch) {
  if (ch === " ") return null;
  if (ch in ACENTUADAS) return acentuada(...ACENTUADAS[ch]);
  if (ch === "Ç") return cedilha("C", ["..#..", ".##.."]);
  if (ch === "ç") return cedilha("c", ["..#.", ".##."]);
  if (!(ch in GLIFOS)) throw new Error(`fonte: falta o glifo '${ch}'`);
  return celula(GLIFOS[ch]);
}

// ---- monta a página e o descritor ----
const glifos = [];
let x = 0;
let y = 0;
for (const ch of CARACTERES) {
  const m = matrizDe(ch);
  if (!m) {
    glifos.push({
      ch,
      x: 0,
      y: 0,
      largura: 0,
      altura: 0,
      avanco: AVANCO_DO_ESPACO,
      m: null,
    });
    continue;
  }
  const largura = m[0].length;
  if (x + largura > LARGURA_DA_PAGINA) {
    x = 0;
    y += ALTURA + 1;
  }
  glifos.push({ ch, x, y, largura, altura: ALTURA, avanco: largura + 1, m });
  x += largura + 1;
}
const alturaDaPagina = (() => {
  const h = y + ALTURA;
  let p = 8;
  while (p < h) p *= 2;
  return p;
})();

const pagina = new Imagem(LARGURA_DA_PAGINA, alturaDaPagina);
const branco = hex("#ffffff");
for (const g of glifos) {
  if (!g.m) continue;
  g.m.forEach((l, yy) =>
    l.forEach((v, xx) => v && pagina.pintar(g.x + xx, g.y + yy, branco)),
  );
}
pagina.salvar("public/data/fnt/pixel.png");

const linhasFnt = [
  `info face="Faroleiro Pixel" size=${ALTURA} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1 outline=0`,
  `common lineHeight=${ALTURA} base=${BASE} scaleW=${LARGURA_DA_PAGINA} scaleH=${alturaDaPagina} pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4`,
  `page id=0 file="pixel.png"`,
  `chars count=${glifos.length}`,
  ...glifos.map(
    (g) =>
      `char id=${g.ch.codePointAt(0)} x=${g.x} y=${g.y} width=${g.largura} height=${g.altura} xoffset=0 yoffset=0 xadvance=${g.avanco} page=0 chnl=15`,
  ),
];
mkdirSync("public/data/fnt", { recursive: true });
writeFileSync("public/data/fnt/pixel.fnt", linhasFnt.join("\n") + "\n", "utf8");

// ---- prévia: texto de exemplo desenhado com a própria fonte, a 3× ----
const porCaractere = new Map(glifos.map((g) => [g.ch, g]));

function larguraDoTexto(texto) {
  let w = 0;
  for (const ch of texto) w += porCaractere.get(ch).avanco;
  return w;
}

function escrever(img, texto, ox, oy, escala, corHex) {
  const cor = hex(corHex);
  let cx = ox;
  for (const ch of texto) {
    const g = porCaractere.get(ch);
    if (!g) throw new Error(`prévia: sem glifo para '${ch}'`);
    if (g.m) {
      g.m.forEach((l, yy) =>
        l.forEach(
          (v, xx) =>
            v &&
            img.retangulo(
              cx + xx * escala,
              oy + yy * escala,
              escala,
              escala,
              cor,
            ),
        ),
      );
    }
    cx += g.avanco * escala;
  }
}

const ESCALA = 3;
const amostras = [
  [
    "Óleo: 30 · Espaço: lamparina — Fase concluída! àéíõúç",
    ESTILOS.mare.jogo.texto,
  ],
  ["ÁÀÂÃ ÉÊ Í ÓÔÕ Ú Ç  áàâã éê í óôõ ú ç  … — ·", ESTILOS.mare.jogo.destaque],
  ["ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789", ESTILOS.mare.jogo.texto],
  ["abcdefghijklmnopqrstuvwxyz !?.,;:'\"()[]{}", ESTILOS.mare.jogo.texto],
  [
    "+-*/=<>#$%&@_^`~|\\  Faroleiro: acenda o farol.",
    ESTILOS.mare.jogo.textoFraco,
  ],
];
const margem = 12;
const larguraDaPrevia =
  Math.max(...amostras.map(([t]) => larguraDoTexto(t))) * ESCALA + margem * 2;
const previa = new Imagem(
  larguraDaPrevia,
  margem * 2 + amostras.length * (ALTURA + 3) * ESCALA,
);
previa.retangulo(
  0,
  0,
  previa.largura,
  previa.altura,
  hex(ESTILOS.mare.jogo.escuridao),
);
amostras.forEach(([texto, cor], i) =>
  escrever(
    previa,
    texto,
    margem,
    margem + i * (ALTURA + 3) * ESCALA,
    ESCALA,
    cor,
  ),
);
previa.salvar("previas/previa-fonte.png");

console.log(
  `fonte gerada: ${glifos.length} caracteres, página ${LARGURA_DA_PAGINA}×${alturaDaPagina}`,
);
