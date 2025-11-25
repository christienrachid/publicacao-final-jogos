import * as me from "../lib/melonjs.module.js";
import Player from "./player/player.js";
import HealthBar from "./ui/health.js";
import SistemaHorda from "./systems/sistemaHorda.js";
import HordaHUD from "./ui/hordaHUD.js";
import PlayerDeath from "./systems/playerDeath.js";

export class PlayScreen extends me.Stage {
  onResetEvent() {
    const map = new me.TMXTileMap("map", me.loader.getTMX("map"));
    map.addTo(me.game.world);

    for (const layer of map.getLayers()) {
      switch (layer.name) {
        case "floorANDwall":
          layer.pos.z = 1;
          break;
        case "prop":
          layer.pos.z = 2;
          break;
      }
    }

    me.game.world.sort(true);

    me.game.world.mapBounds = {
      margem: 16,
      largura: 270,
      altura: 265,
    };

    const jogador = new Player(128, 128);
    jogador.pos.z = 3;

    const camadaJogo =
      map.getLayers().find((l) => l.name === "game") ||
      map.getLayers().find((l) => l.name === "prop");
    const zCamadaJogo = camadaJogo ? camadaJogo.pos.z : 2;

    let entidadesJogo = me.game.world.getChildByName("gameEntities");
    if (!entidadesJogo || entidadesJogo.length === 0) {
      entidadesJogo = new me.Container(
        0,
        0,
        me.game.viewport.width,
        me.game.viewport.height
      );
      entidadesJogo.name = "gameEntities";
      entidadesJogo.pos.z = zCamadaJogo + 0.5;
      me.game.world.addChild(entidadesJogo);
      me.game.world.sort(true);
      entidadesJogo = me.game.world.getChildByName("gameEntities")[0];
    } else {
      entidadesJogo = entidadesJogo[0];
    }

    entidadesJogo.addChild(jogador);

    const barraVida = new HealthBar(jogador);
    me.game.world.addChild(barraVida);

    this.sistemaHorda = new SistemaHorda(jogador, entidadesJogo);
    this.sistemaHorda.gerarHorda();

    const hordaHUD = new HordaHUD(this.sistemaHorda, jogador);
    me.game.world.addChild(hordaHUD);

    this.sistemaMorte = new PlayerDeath(jogador, this.sistemaHorda);

    me.game.world.gravity.y = 0;

    me.audio.play("8bitMusic", true, null, 0.3);
  }

  update(dt) {
    if (this.sistemaMorte && this.sistemaMorte.verificarMorte()) {
      return super.update(dt);
    }

    if (this.sistemaHorda) {
      this.sistemaHorda.update(dt);
    }
    return super.update(dt);
  }
}
