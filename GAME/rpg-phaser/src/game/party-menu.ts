import { Scene } from "phaser"
import type { PlayerCharacter } from "./player"
import { menuButton } from "./title"

export class PartyMenu extends Scene {
  constructor() {
    super("PartyMenu")
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#101820")
    this.add.text(400, 120, "SELECIONE O PERSONAGEM", {
      color: "#ffffff", fontFamily: "Arial", fontSize: "28px",
    }).setOrigin(0.5)

    const characters: [PlayerCharacter, string, string][] = [
      ["kael", "ONE", "1 - Kael"],
      ["rian", "TWO", "2 - Rian"],
      ["lira", "THREE", "3 - Lira"],
    ]
    let selected = false
    const keyboard = this.input.keyboard
    characters.forEach(([character, key, label], index) => {
      const select = () => {
        if (selected) return
        selected = true
        this.registry.set("activeCharacter", character)
        this.scene.start("Dialogue", { id: "1_sonho_kael" })
      }
      menuButton(this, 230 + 70 * index, label, select)
      keyboard?.on(`keydown-${key}`, select)
      this.events.once("shutdown", () => keyboard?.off(`keydown-${key}`, select))
    })
    menuButton(this, 520, "Voltar", () => this.scene.start("Title"))
  }
}
