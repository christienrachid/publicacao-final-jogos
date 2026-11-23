import { Scene } from "phaser"

const cutscenes = {
  "1_sonho_kael": {
    background: "dream",
    lines: [
      ["???", "O selo está enfraquecendo... e você sequer compreende o que carrega no sangue."],
      ["Kael", "Quem está aí?! Mostre o seu rosto!"],
      ["???", "Procure o Cristal Lunar antes que as sombras o consumam. O tempo está acabando..."],
      ["Narrador", "Kael desperta sobressaltado no meio da floresta sombria, enquanto uma tempestade se aproxima."],
    ],
  },
  "2_encontro_irmaos": {
    background: undefined,
    lines: [
      ["Rian", "Ei, cuidado! Mais monstros estavam vindo pela trilha. Você está bem?"],
      ["Lira", "A tempestade está piorando rápido demais... Olhem ali na frente, há uma mansão com as luzes acesas!"],
      ["Kael", "Eu sou Kael. Se ficarmos aqui fora, não vamos sobreviver à noite. Vamos pedir abrigo juntos."],
      ["Rian", "Sou Rian, e esta é minha irmã, Lira. Combinado — mas fiquem atentos, essas estátuas no pátio me dão arrepios."],
    ],
  },
  "3_conversa_elara": {
    background: "elara-conversation",
    lines: [
      ["Senhora Elara", "Oh, pobres viajantes! Entrem, fujam desta tempestade terrível. Podem descansar nos quartos lá em cima."],
      ["Lira", "Muito obrigada, senhora! A senhora mora sozinha neste lugar enorme?"],
      ["Senhora Elara", "Sim, apenas eu e minhas antigas coleções de pedra. Mas escutem bem o meu único aviso..."],
      ["Senhora Elara", "Sob hipótese alguma desçam até o porão. A porta está trancada por um motivo. O que há lá embaixo não perdoa curiosos."],
      ["Rian", "(Sussurrando) Vocês ouviram o tom dela? Tem alguma coisa muito errada escondida naquele porão..."],
    ],
  },
  "quarto_decisao": {
    background: undefined,
    lines: [
      ["Rian", "Não consigo dormir depois do que Elara disse sobre o porão."],
      ["Lira", "Também quero saber o que tem lá. Mas vamos juntos."],
      ["Kael", "Combinado. Vamos procurar a entrada do porão."],
    ],
  },
  "4_advertencia_gorga": {
    background: undefined,
    lines: [
      ["Gorga", "Tolos... Eu avisei para ficarem longe do porão! Agora verão a verdadeira dona desta mansão."],
      ["Kael", "A Senhora Elara... era um disfarce?! E aquilo no pedestal... é o Cristal Lunar do meu sonho!"],
      ["Gorga", "O Cristal me pertence! E vocês serão as novas estátuas da minha coleção!"],
      ["Lira", "Não olhem diretamente nos olhos dela! Preparem-se para lutar!"],
    ],
  },
  "5_ataque_cristal_lunar": {
    background: "gorga-defeat",
    lines: [
      ["Kael", "O Cristal Lunar está reagindo à minha arma! Ele está se fundindo a ela!"],
      ["Lira", "A energia é forte demais para uma pessoa só! Rian, segure comigo — vamos canalizar juntos!"],
      ["Rian", "AGORA! Com tudo que temos!"],
      ["Gorga", "NÃO! Essa luz... ela está me destruindo... Aaaaargh!!"],
      ["Narrador", "O impacto desintegra a maldição de Gorga, mas o excesso de energia drena {personagem} até o limite. {pronome} desaba inconsciente enquanto uma marca negra surge em seu braço..."],
    ],
  },
}

export type CutsceneId = keyof typeof cutscenes
type DialogueData = { id: CutsceneId; onComplete?: () => void }

export function cover(scene: Scene, texture: string): void {
  const image = scene.add.image(400, 320, texture)
  image.setScale(Math.max(800 / image.width, 640 / image.height))
}

export class Dialogue extends Scene {
  constructor() {
    super("Dialogue")
  }

  create({ id, onComplete }: DialogueData): void {
    const { background, lines } = cutscenes[id]
    if (background) cover(this, background)

    this.add.image(400, 518, "dialogue-panel").setDisplaySize(768, 330)
    const speaker = this.add.text(90, 445, "", { fontSize: "20px", color: "#ffe5ad", fontStyle: "bold" })
    const text = this.add.text(90, 475, "", {
      fontSize: "19px", color: "#ffffff", lineSpacing: 4, wordWrap: { width: 620 },
    })
    this.add.text(710, 563, "ESPAÇO / ENTER", { fontSize: "12px", color: "#c4bdd8" }).setOrigin(1, 0)
    let index = 0
    let finished = false
    const render = () => {
      const [name, line] = lines[index]
      speaker.setText(name)
      const character = this.registry.get("activeCharacter")
      const hero = character === "lira" ? "Lira" : character === "rian" ? "Rian" : "Kael"
      text.setText(line.replace("{personagem}", hero).replace("{pronome}", hero === "Lira" ? "Ela" : "Ele"))
    }
    render()

    const keyboard = this.input.keyboard
    const advance = (event: KeyboardEvent) => {
      if (finished || event.repeat) return
      index++
      if (index < lines.length) {
        render()
        return
      }
      finished = true
      if (onComplete) {
        this.scene.stop()
        onComplete()
      } else {
        this.scene.start("GameScene", { map: "forest1", spawn: "forest1Start" })
      }
    }
    keyboard?.on("keydown-SPACE", advance)
    keyboard?.on("keydown-ENTER", advance)
    this.events.once("shutdown", () => {
      keyboard?.off("keydown-SPACE", advance)
      keyboard?.off("keydown-ENTER", advance)
    })
  }
}
