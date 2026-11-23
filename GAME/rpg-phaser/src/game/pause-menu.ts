import { Scene } from "phaser"
import { menuButton } from "./title"

export class PauseMenu extends Scene {
  constructor() {
    super("PauseMenu")
  }

  create({ onResume }: { onResume: () => void }): void {
    this.add.rectangle(400, 320, 800, 640, 0x090810, 0.72)
    this.add.text(400, 262, "Jogo pausado", {
      fontFamily: "Georgia, serif", fontSize: "36px", fontStyle: "bold", color: "#ffedc6",
    }).setOrigin(0.5)

    let resumed = false
    const resume = () => {
      if (resumed) return
      resumed = true
      this.scene.stop()
      onResume()
    }
    menuButton(this, 352, "Continuar", resume)

    const keyboard = this.input.keyboard
    const resumeWithKey = (event: KeyboardEvent) => {
      if (!event.repeat) resume()
    }
    keyboard?.on("keydown-ESC", resumeWithKey)
    this.events.once("shutdown", () => keyboard?.off("keydown-ESC", resumeWithKey))
  }
}
