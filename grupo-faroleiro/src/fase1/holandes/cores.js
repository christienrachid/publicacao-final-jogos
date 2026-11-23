import { estiloAtual } from "../../systems/estilo.js";

// Cores de tempo de execução do Holandês por estilo, tiradas dos papéis de
// tools/arte/paletas.mjs (mesmos valores):
//   fantasma, fantasmaClaro  brilho das lanternas, névoa, prancha, fogo-fátuo
//   apagada                  vidro da lanterna apagada (papel contorno)
//   fogo, fogoClaro, fogoEscuro  bala, rastro, explosão e o X piscando
//   espuma                   espuma na linha d'água e bolhas
//   fumaca                   fumaça da explosão (papel pedraClara)
const CORES = {
    mare: {
        fantasma: "#3fbf9f",
        fantasmaClaro: "#a8ffe0",
        apagada: "#0b0e1a",
        fogo: "#f2a541",
        fogoClaro: "#fff1b8",
        fogoEscuro: "#b45a1e",
        espuma: "#7fd1d8",
        fumaca: "#4f6a8c",
    },
};

export function coresDoHolandes() {
    return CORES[estiloAtual()] ?? CORES.mare;
}