import { AUTO, Game } from "phaser"
import type { Types } from "phaser"
import { GameScene } from "./game"
import { PartyMenu } from "./party-menu"
import { Dialogue } from "./dialogue"
import { ChapterEnd, Credits, Title } from "./title"
import { PauseMenu } from "./pause-menu"

const config: Types.Core.GameConfig = {
  type: AUTO,
  width: 800,
  height: 640,
  parent: "game-container",
  backgroundColor: "#00aa00",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: {
        x: 0,
        y: 0,
      },
      debug: false,
    },
  },
  scene: [Title, PartyMenu, GameScene, PauseMenu, Dialogue, ChapterEnd, Credits],
}

const StartGame = (parent: string): Game => {
  return new Game({
    ...config,
    parent,
  })
}

export default StartGame
