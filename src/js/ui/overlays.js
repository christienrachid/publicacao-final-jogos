// Overlays HTML para Game Over e Vitória (sem usar me.Text)

export function mostrarMenu() {
  const overlay = document.getElementById("menuOverlay");
  overlay.classList.add("show");
}

export function esconderMenu() {
  const overlay = document.getElementById("menuOverlay");
  overlay.classList.remove("show");
}

export function mostrarGameOver(horda, pontos) {
  const overlay = document.getElementById("gameOverOverlay");
  const hordaText = document.getElementById("gameOverHorda");
  const pontosText = document.getElementById("gameOverPontos");

  hordaText.textContent = `Horda: ${horda}`;
  pontosText.textContent = `Pontos: ${pontos}`;

  overlay.classList.add("show");
}

export function mostrarVitoria(maxHordas, pontos) {
  const overlay = document.getElementById("victoryOverlay");
  const hordasText = document.getElementById("victoryHordas");
  const pontosText = document.getElementById("victoryPontos");

  hordasText.textContent = `Completou ${maxHordas} Hordas!`;
  pontosText.textContent = `Pontos: ${pontos}`;

  overlay.classList.add("show");
}

export function esconderOverlays() {
  document.getElementById("gameOverOverlay").classList.remove("show");
  document.getElementById("victoryOverlay").classList.remove("show");
  document.getElementById("menuOverlay").classList.remove("show");
}
