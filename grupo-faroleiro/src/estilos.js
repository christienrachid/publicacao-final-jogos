// O estilo visual do jogo, "Maré noturna": nome mostrado e cores usadas em
// tempo de execução (escuridão, luz, interface). Só dados, sem imports: o
// jogo lê daqui e os geradores de arte também (tools/arte/paletas.mjs), para
// haver uma fonte só. As cores dos papéis de desenho ficam em
// tools/arte/paletas.mjs.
export const ESTILOS = {
  mare: {
    nome: "Maré noturna",
    jogo: {
      escuridao: "#070a14",
      // opacidade da escuridão longe de qualquer luz (0 a 1)
      escuridaoLonge: 0.86,
      luz: "#ffcf8a",
      texto: "#f4ead5",
      textoFraco: "#8fa3c0",
      destaque: "#f2a541",
      // olhos do Rondador (mesma cor do papel "olho" da paleta)
      olho: "#d8f5ff",
      // miolo da chama (mesma cor do papel "fogoClaro" da paleta)
      chama: "#fff1b8",
    },
  },
};

// estilos gerados pela arte e carregados pelo jogo
export const ORDEM_DOS_ESTILOS = ["mare"];
