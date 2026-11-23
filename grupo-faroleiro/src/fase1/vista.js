import { CONFIG } from "../config.js";

// Área do mundo que a câmera mostra agora, em pixels do mundo. Lida da
// posição e do zoom da câmera (e não de camera.worldView, que dentro do
// desenho de uma câmera com zoom devolve o tamanho errado, porque o
// Camera2d troca width/height durante o passe).
const vista = { x: 0, y: 0, largura: CONFIG.largura, altura: CONFIG.altura, zoom: 1 };

export function lerVista(camera) {
    const zoom = camera.zoom;
    vista.zoom = zoom;
    vista.largura = CONFIG.largura / zoom;
    vista.altura = CONFIG.altura / zoom;
    // o MelonJS começa a vista num pixel inteiro (ver Camera2d._viewOrigin)
    vista.x = Math.round(camera.pos.x + camera.offset.x);
    vista.y = Math.round(camera.pos.y + camera.offset.y);
    return vista;
}