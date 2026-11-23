import { Application, FILLMODE_FILL_WINDOW, Keyboard, Mouse, RESOLUTION_AUTO } from 'playcanvas';
import './flight.css';
import { startFlightSim } from './flight/game';
import { createLoadingScreen } from './flight/ui/loading';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const loadingScreen = createLoadingScreen(ui);
loadingScreen.setStage('engine', 'Inicializando PlayCanvas 2.x…', false);

const app = new Application(canvas, {
  keyboard: new Keyboard(window),
  mouse: new Mouse(canvas),
});
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());
app.start();
loadingScreen.setStage('engine', 'Motor PlayCanvas pronto', true);

// Deixa o navegador pintar a tela de carregamento antes de gerar as malhas do mundo
const boot = () => startFlightSim(app, ui, { loadingScreen });
if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(() => boot());
} else {
  boot();
}
