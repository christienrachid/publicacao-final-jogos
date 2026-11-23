// Papéis de cor e a paleta do estilo do jogo ("Maré noturna").
// A arte é desenhada com papéis; o estilo diz a cor de cada papel.
import {
  ESTILOS as ESTILOS_DO_JOGO,
  ORDEM_DOS_ESTILOS,
} from "../../src/estilos.js";
import { hex } from "./png.mjs";

export { ORDEM_DOS_ESTILOS };

// número de cada papel (0 é transparente)
export const PAPEL = {
  contorno: 1, // o mais escuro: contorno de personagens e objetos
  sombra: 2, // sombra projetada, topo das paredes, juntas
  pedraEscura: 3, // face da parede, chão no escuro
  pedra: 4, // chão, face da parede iluminada
  pedraClara: 5, // realce do chão e da parede
  brilhoFrio: 6, // luz da lua: quinas e bordas de cima
  madeiraEscura: 7,
  madeira: 8,
  aguaEscura: 9,
  agua: 10,
  espuma: 11, // brilho da água, espuma, vidro
  folhaEscura: 12,
  folha: 13,
  pele: 14,
  capa: 15, // capa de chuva do faroleiro: a cor de destaque do herói
  fogoEscuro: 16,
  fogo: 17,
  fogoClaro: 18, // miolo da chama, o ponto mais claro da tela
  olho: 19, // olhos do Rondador
  // versão 2 (ilha de lado, fase do farol, chefes)
  ceuAlto: 20, // céu no alto: noite chegando
  ceuMeio: 21, // faixa do meio do pôr do sol
  ceuBaixo: 22, // horizonte do pôr do sol
  sol: 23,
  solClaro: 24, // miolo do sol e reflexo dele na água
  areia: 25,
  areiaEscura: 26,
  fantasma: 27, // Holandês Voador, piratas fantasmas, fogo-fátuo
  fantasmaClaro: 28,
  kraken: 29,
  krakenClaro: 30,
  metal: 31, // ferro, canhão, engrenagem
  gramaClara: 32, // topo da grama ao sol, ilha vista de cima
};

export const QUANTIDADE_DE_PAPEIS = 33;

// Cores por papel do estilo (índice = número do papel; o 0 fica sem uso).
// O nome do estilo e as cores que o jogo usa em tempo de execução (`jogo`)
// vêm de src/estilos.js e são juntados abaixo, em ESTILOS.
const CORES = {
  mare: {
    cores: [
      null,
      "#0b0e1a", // contorno
      "#151c30", // sombra
      "#24304a", // pedraEscura
      "#36486a", // pedra
      "#4f6a8c", // pedraClara
      "#8fb3c9", // brilhoFrio
      "#3a2a2e", // madeiraEscura
      "#6b4a3a", // madeira
      "#10324a", // aguaEscura
      "#1f5f7a", // agua
      "#7fd1d8", // espuma
      "#1d3b34", // folhaEscura
      "#3f6e4a", // folha
      "#e0a77a", // pele
      "#c2413b", // capa
      "#b45a1e", // fogoEscuro
      "#f2a541", // fogo
      "#fff1b8", // fogoClaro
      "#d8f5ff", // olho
      "#1b1838", // ceuAlto
      "#5a2d5c", // ceuMeio
      "#d9613f", // ceuBaixo
      "#ffb347", // sol
      "#ffe7a3", // solClaro
      "#c9a26b", // areia
      "#8a6a45", // areiaEscura
      "#3fbf9f", // fantasma
      "#a8ffe0", // fantasmaClaro
      "#5b2a4e", // kraken
      "#9b4f7a", // krakenClaro
      "#7d8a99", // metal
      "#6fae55", // gramaClara
    ],
  },
};

// o estilo com nome, cores e jogo; confere que as cores que o jogo usa
// por conta própria (olho, chama) batem com os papéis desenhados
export const ESTILOS = {};
for (const id of ORDEM_DOS_ESTILOS) {
  const { nome, jogo } = ESTILOS_DO_JOGO[id];
  const { cores } = CORES[id];
  if (
    jogo.olho !== cores[PAPEL.olho] ||
    jogo.chama !== cores[PAPEL.fogoClaro]
  ) {
    throw new Error(
      `paleta ${id}: olho/chama de src/estilos.js diferentes dos papéis`,
    );
  }
  ESTILOS[id] = { nome, cores, jogo };
}

// cor [r, g, b, a] de um papel num estilo (papel 0 = transparente)
export function corDoPapel(estilo, papel) {
  if (papel === 0) return [0, 0, 0, 0];
  const cor = ESTILOS[estilo].cores[papel];
  if (!cor) throw new Error(`paleta ${estilo}: papel ${papel} sem cor`);
  return hex(cor);
}
