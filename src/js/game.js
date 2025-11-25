import * as me from "../lib/melonjs.module.js";
import { MenuScreen } from "./ui/menu.js";
import { PlayScreen } from "./play.js";
import { resources } from "./stage/resources.js";

me.device.onReady(() => {
  me.video.init(256, 256, { parent: "screen", scale: 2.8 });

  me.audio.init("mp3");

  document.fonts.ready.then(() => {
    me.loader.preload(resources, () => {
      me.state.set(me.state.MENU, new MenuScreen());
      me.state.set(me.state.PLAY, new PlayScreen());
      me.state.change(me.state.MENU);
    });
  });

  me.input.bindKey(me.input.KEY.W, "up");
  me.input.bindKey(me.input.KEY.S, "down");
  me.input.bindKey(me.input.KEY.A, "left");
  me.input.bindKey(me.input.KEY.D, "right");

  me.input.bindKey(me.input.KEY.UP, "up");
  me.input.bindKey(me.input.KEY.DOWN, "down");
  me.input.bindKey(me.input.KEY.LEFT, "left");
  me.input.bindKey(me.input.KEY.RIGHT, "right");

  me.input.bindKey(me.input.KEY.SPACE, "attack");
  me.input.bindKey(me.input.KEY.J, "attack");
});
