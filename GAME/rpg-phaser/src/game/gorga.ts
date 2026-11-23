import { gameplayNow } from "./gameplay-clock"
export const gorgaSheets = {
  "elara-idle": "idle.png",
  "gorga-walk": "Gorga/walk.png",
  "gorga-hurt": "Gorga/hurt.png",
  "gorga-cast": "Gorga/spellcast.png",
  "gorga-combat": "Gorga/fase2/combat.png",
  "gorga-emote": "Gorga/fase2/emote.png",
  "gorga-slash": "Gorga/fase2/1h_slash.png",
}

type State = "intro" | "rise" | "pursue" | "cast" | "hurt" | "combat" | "slash"

export class Gorga {
  private static readonly damageCooldown = 1000
  readonly sprite: Phaser.Physics.Arcade.Sprite
  private readonly label: Phaser.GameObjects.Text
  private state: State = "intro"
  private phase = 1
  private readonly maxHealth = 10
  private health = this.maxHealth
  private startedAt: number
  private nextAttackAt = 0
  private invulnerableUntil = 0
  private row = 2
  private attackResolved = false

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly castSpell: (x: number, y: number, dx: number, dy: number) => void,
    private readonly damagePlayer: () => void,
  ) {
    this.startedAt = gameplayNow(scene)
    this.sprite = scene.physics.add.sprite(x, y, "elara-idle", 26)
      .setScale(1.5)
      .setCollideWorldBounds(true)
    this.label = scene.add.text(400, 22, "", {
      fontSize: "15px", color: "#ffffff", backgroundColor: "#291633",
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    this.updateLabel()
  }

  get locksParty(): boolean {
    return this.sprite.active && (
      this.state === "intro" || this.state === "rise" ||
      this.state === "combat"
    )
  }

  private updateLabel(): void {
    this.label.setText(`Gorga · Fase ${this.phase} · ${this.health}/${this.maxHealth}`)
      .setVisible(!this.locksParty)
  }

  private enter(state: State): void {
    this.state = state
    this.startedAt = gameplayNow(this.scene)
    this.attackResolved = false
    this.sprite.setVelocity(0, 0)
    this.sprite.setImmovable(state === "hurt" || state === "combat")
    this.sprite.setAngle(0)
    this.sprite.setOrigin(0.5)
    this.sprite.setOffset(0, 0)
    this.updateLabel()
  }

  private show(key: string, frame: number): void {
    if (this.sprite.texture.key === key) {
      this.sprite.setFrame(frame)
    } else {
      this.sprite.setTexture(key, frame)
    }
  }

  update(player: Phaser.Physics.Arcade.Sprite): void {
    const now = gameplayNow(this.scene)
    const elapsed = now - this.startedAt
    if (this.invulnerableUntil !== 0) {
      const remaining = this.invulnerableUntil - now
      const blinkFrame = Math.floor((Gorga.damageCooldown - remaining) / 100)
      this.sprite.setAlpha(remaining > 0 && blinkFrame % 2 === 0 ? 0.35 : 1)
      if (remaining <= 0) this.invulnerableUntil = 0
    }
    const dx = player.x - this.sprite.x
    const dy = player.y - this.sprite.y
    const distance = Math.hypot(dx, dy)

    switch (this.state) {
      case "intro":
        this.show("elara-idle", 26 + Math.floor(elapsed / 160) % 2)
        this.sprite.setAngle(90 * Math.max(0, Math.min(1, (elapsed - 450) / 450)))
        if (elapsed >= 1050) this.enter("rise")
        return
      case "rise":
        this.show("gorga-hurt", Math.max(0, 5 - Math.floor(elapsed / 95)))
        if (elapsed >= 570) this.enter("pursue")
        return
      case "hurt":
        if (this.phase === 1 && elapsed < 510) {
          this.show("gorga-hurt", Math.floor(elapsed / 85))
        } else {
          this.show(this.phase === 1 ? "gorga-walk" : "gorga-combat", this.row * 13)
        }
        if (now >= this.invulnerableUntil) this.enter("pursue")
        return
      case "combat":
        this.show("gorga-combat", this.row * 13 + Math.floor(elapsed / 160) % 2)
        if (now >= this.invulnerableUntil) {
          this.nextAttackAt = now + 350
          this.enter("pursue")
        }
        return
      case "cast":
        this.show("gorga-cast", this.row * 13 + Math.min(6, Math.floor(elapsed / 85)))
        if (!this.attackResolved && elapsed >= 425) {
          this.attackResolved = true
          this.castSpell(this.sprite.x, this.sprite.y, dx, dy)
        }
        if (elapsed >= 595) this.enter("pursue")
        return
      case "slash":
        this.show("gorga-slash", this.row * 13 + Math.min(12, Math.floor(elapsed / 50)))
        if (!this.attackResolved && elapsed >= 300) {
          this.attackResolved = true
          const forward = this.row === 0 ? -dy : this.row === 1 ? -dx : this.row === 2 ? dy : dx
          const sideways = this.row % 2 === 0 ? Math.abs(dx) : Math.abs(dy)
          if (forward >= 0 && forward <= 105 && sideways <= 52) this.damagePlayer()
        }
        if (elapsed >= 650) this.enter("pursue")
        return
      case "pursue":
        this.row = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 0 : 2)
        if (now >= this.nextAttackAt && distance <= (this.phase === 1 ? 340 : 100)) {
          this.nextAttackAt = now + (this.phase === 1 ? 2300 : 1500)
          this.enter(this.phase === 1 ? "cast" : "slash")
          return
        }
        if (distance > 0) this.sprite.setVelocity(dx / distance * 140, dy / distance * 140)
        if (this.phase === 1) {
          this.show("gorga-walk", this.row * 13 + Math.floor(elapsed / 120) % 9)
        } else {
          this.show("gorga-emote", this.row * 13 + Math.floor(elapsed / 150) % 3)
          this.sprite.setDisplayOrigin(32, 36 + Math.sin(elapsed / 140) * 3)
          this.sprite.setOffset(0, this.sprite.displayOriginY - 32)
        }
        return
    }
  }

  takeDamage(): boolean {
    const now = gameplayNow(this.scene)
    if (!this.sprite.active || this.locksParty || now < this.invulnerableUntil) return false
    this.health -= 1
    this.invulnerableUntil = now + Gorga.damageCooldown
    this.sprite.setAlpha(0.35)
    if (this.health > 0) {
      this.enter("hurt")
    } else if (this.phase === 1) {
      this.phase = 2
      this.health = this.maxHealth
      this.enter("combat")
      this.show("gorga-combat", this.row * 13)
    } else {
      this.sprite.disableBody(true, true)
      this.label.destroy()
      return true
    }
    return false
  }
}
