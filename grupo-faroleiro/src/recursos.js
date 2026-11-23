import { ORDEM_DOS_ESTILOS } from "./estilos.js";
import { imagem } from "./systems/estilo.js";

// Todos os assets do jogo para o loader.preload: as imagens geradas por
// tools/ (npm run arte), as que ainda servem da versão 1 e a fonte de pixel.
// Cada imagem se chama "<base>-<estilo>" (ver imagem() em
// src/systems/estilo.js) e fica em public/data/img/.

// imagens que existem uma vez por estilo
const IMAGENS_POR_TEMA = [
    // 4.1 ilha de lado e menu
    "ilha-tiles",
    "casa",
    "torre",
    "poste",
    "lua",
    "sol",
    "nuvens",
    "fundo-ilhas",
    "menu-fundo",
    // 4.2 personagens, inimigos e interface
    "jogador",
    "jogador-braco",
    "zumbi",
    "inimigos",
    "navio",
    "itens",
    "painel",
    "botao",
    // 4.3 farol e Kraken
    "farol-ilha",
    "farol-topo",
    "inimigos-mar",
    "kraken",
    "tentaculo",
    // da versão 1: partículas (src/systems/particulas.js) e logo do menu
    "fx",
    "logo",
];

function montarLista() {
    const lista = [];
    for (const tema of ORDEM_DOS_ESTILOS) {
        for (const base of IMAGENS_POR_TEMA) {
            const nome = imagem(base, tema);
            lista.push({ name: nome, type: "image", src: `data/img/${nome}.png` });
        }
        // mapa da ilha da Fase 1 (tools/gerar-ilha.mjs), com o tileset embutido
        lista.push({ name: `ilha-${tema}`, type: "tmx", src: `data/map/ilha-${tema}.tmj` });
    }
    // fonte de pixel (BMFont): descritor e página com o mesmo nome
    lista.push(
        { name: "pixel", type: "binary", src: "data/fnt/pixel.fnt" },
        { name: "pixel", type: "image", src: "data/fnt/pixel.png" },
    );
    return lista;
}

export const RECURSOS = montarLista();
