// Desenho da interface em pixels da tela, por cima de tudo.
//
// As stages desenham a interface no próprio draw(), depois do passe da
// câmera, como o Container faz com filhos "floating": assim a escuridão das
// fases e os pós-efeitos da câmera (vinheta) não passam
// por cima dela. Os efeitos da câmera (fades da troca de estado, flash) são
// pintados de novo no fim, para a cortina cobrir também a interface.
//
// Uso numa Stage:
//   draw(renderer, world) {
//       super.draw(renderer, world);
//       desenharNaTela(this, renderer, (r) => this.hud.desenhar(r));
//   }
export function desenharNaTela(stage, renderer, desenhar) {
    const camera = stage.cameras.get("default");
    if (camera === undefined) {
        return;
    }
    renderer.save();
    renderer.resetTransform();
    renderer.setProjection(camera.screenProjection);
    renderer.setBlendMode("normal");
    renderer.setGlobalAlpha(1);
    desenhar(renderer);
    camera.drawFX(renderer);
    renderer.setProjection(camera.projectionMatrix);
    renderer.restore();
}
