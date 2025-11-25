import * as me from "../../lib/melonjs.module.js";
import { mostrarMenu, esconderMenu } from "./overlays.js";

export class MenuScreen extends me.Stage {
  onResetEvent() {
    me.video.renderer.setAntiAlias(false);

    mostrarMenu();

    const handleStart = (event) => {
      if (event.key === "Enter") {
        window.removeEventListener("keydown", handleStart);
        esconderMenu();
        me.state.change(me.state.PLAY);
      }
    };

    window.addEventListener("keydown", handleStart);
  }

  onDestroyEvent() {
    esconderMenu();
  }
}
