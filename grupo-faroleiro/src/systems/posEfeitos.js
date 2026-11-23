import { VignetteEffect } from "melonjs";

// Pós-efeito da câmera principal: vinheta suave. Só existe nos
// renderizadores de GPU; no Canvas nada é criado e o jogo segue igual.
//
// A câmera padrão é a mesma em todas as Stages, então o efeito é criado uma
// vez só: removePostEffect destruiria o efeito, e recriar compila o shader
// de novo.

// vinheta bem suave: pouco escurecimento, só nos cantos
const VINHETA = { strength: 0.08, size: 25 };

let vinheta = null;

// Põe a vinheta na câmera (na primeira vez).
export function aplicarPosEfeitos(app) {
    if (app.renderer.shaderLanguage === null) {
        return;
    }
    if (vinheta === null) {
        vinheta = app.viewport.addPostEffect(new VignetteEffect(app.renderer, VINHETA));
    }
}
