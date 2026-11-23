import { Scene } from "phaser"
import { cover } from "./dialogue"

export function menuButton(scene: Scene, y: number, label: string, action: () => void): void {
  const button = scene.add.text(400, y, label, {
    fontFamily: "Arial", fontSize: "23px", color: "#ffffff", backgroundColor: "#211830",
    padding: { x: 20, y: 10 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true })
  button.on("pointerover", () => button.setBackgroundColor("#45345d"))
  button.on("pointerout", () => button.setBackgroundColor("#211830"))
  button.on("pointerup", action)
}

export class Title extends Scene {
  constructor() { super("Title") }

  preload(): void {
    this.load.image("home-screen", "assets/HomeScreen.jpeg")
    this.load.image("dialogue-panel", "assets/dialogos.png")
    this.load.image("dream", "assets/forest/cutscenes/1_sonho_kael.jpeg")
    this.load.image("elara-conversation", "assets/forest/cutscenes/3_conversa_elara.jpeg")
    this.load.image("gorga-defeat", "assets/mansion/cutscenes/derrota_gorga.jpeg")
  }

  create(): void {
    cover(this, "home-screen")
    this.add.text(400, 395, "Pixel Quest", {
      fontFamily: "Georgia, serif", fontSize: "48px", fontStyle: "bold",
      color: "#ffedc6", stroke: "#211830", strokeThickness: 5,
    }).setOrigin(0.5)
    menuButton(this, 474, "Iniciar", () => {
      this.registry.reset()
      this.scene.start("PartyMenu")
    })
    menuButton(this, 541, "Créditos", () => this.scene.start("Credits"))
  }
}

export class ChapterEnd extends Scene {
  constructor() { super("ChapterEnd") }

  create(): void {
    cover(this, "gorga-defeat")
    this.add.rectangle(400, 320, 800, 640, 0x090810, 0.78)
    this.add.text(400, 145, "PIXEL QUEST - FIM DO CAPÍTULO 1", {
      fontSize: "28px", color: "#f8edff", fontStyle: "bold", align: "center",
    }).setOrigin(0.5)
    this.add.text(400, 284,
      "Gorga foi derrotada e o Cristal Lunar foi recuperado.\nMas a marca negra no braço de Kael desperta um segredo maior...\nNo próximo capítulo, o cristal deverá ser forjado em sua verdadeira forma.", {
        fontSize: "19px", color: "#ffffff", align: "center", wordWrap: { width: 690 }, lineSpacing: 8,
      }).setOrigin(0.5)
    this.add.text(400, 417, "CONTINUA...", {
      fontSize: "30px", fontStyle: "bold", color: "#dac2ff",
    }).setOrigin(0.5)
    menuButton(this, 535, "Voltar ao Menu Principal", () => this.scene.start("Credits", { ending: true }))
    this.cameras.main.fadeIn(400)
  }
}

export class Credits extends Scene {
  constructor() { super("Credits") }

  create({ ending = false }: { ending?: boolean } = {}): void {
    this.cameras.main.setBackgroundColor("#100d1a")
    this.add.text(400, 195, ending ? "End Game" : "Créditos", {
      fontSize: "38px", color: "#f8edff", fontStyle: "bold",
    }).setOrigin(0.5)
    this.add.text(400, 313, "Santiago Rodrigues, Diego Ramos \n Jezrael Garcia e Arthur Perantoni",  { fontSize: "24px", color: "#dac2ff" }).setOrigin(0.5)
    menuButton(this, 495, "Voltar ao Menu Principal", () => this.scene.start("Title"))
  }
}
