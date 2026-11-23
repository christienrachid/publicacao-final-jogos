import { gameplayNow } from "./gameplay-clock"
export class Slime {
  private static readonly damageCooldown = 1000
  readonly sprite: Phaser.Physics.Arcade.Sprite

  private readonly maxHealth = 3
  private health = this.maxHealth
  private readonly healthBar: Phaser.GameObjects.Container
  private readonly healthFill: Phaser.GameObjects.Rectangle
  private readonly healthLabel: Phaser.GameObjects.Text
  private readonly maxSpeed = 70
  private stoppedUntil = 0
  private invulnerableUntil = 0
  private slash?: { startedAt: number; row: number; didHit: boolean }
  private nextSlashAt = 0
  private hurtStartedAt?: number

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly strike?: () => void) {
    const statue = Boolean(strike)
    this.sprite = scene.physics.add.sprite(x, y, statue ? "statue-walk" : "slime", statue ? 26 : 0)

    this.sprite.setCollideWorldBounds(true)

    this.sprite.setOrigin(0.5, 0.5)
    this.sprite.setScale(statue ? 1.25 : 0.60)
    if (statue) this.sprite.setBodySize(38, 38)
    this.sprite.setVelocity(0, 0)

    const background = scene.add.rectangle(0, 0, 62, 11, 0x25171c)
    this.healthFill = scene.add.rectangle(-30, 0, 60, 11, 0xe32e3f)
      .setOrigin(0, 0.5)
    const frame = scene.add.image(0, 0, "enemy-health-frame").setDisplaySize(76, 51)
    this.healthLabel = scene.add.text(0, 0, "", {
      fontFamily: "Arial, sans-serif",
      fontSize: "9px",
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#26080c",
      strokeThickness: 2,
    }).setOrigin(0.5)
    this.healthBar = scene.add.container(x, y - 38, [background, this.healthFill, frame, this.healthLabel])
      .setDepth(10)
    this.updateHealthBar()
  }

  get dealsContactDamage(): boolean {
    return !this.strike
  }

  stopUntil(time: number): void {
    this.stoppedUntil = time
    this.sprite.setVelocity(0, 0)
    this.sprite.setImmovable(true)
  }

  update(player: Phaser.Physics.Arcade.Sprite): void {
    this.healthBar.setPosition(this.sprite.x, this.sprite.y - 38)
    const now = gameplayNow(this.sprite.scene)
    if (this.hurtStartedAt !== undefined) {
      const frame = Math.floor((now - this.hurtStartedAt) / 50)
      if (frame < 6) {
        this.sprite.setFrame(frame)
      } else {
        this.hurtStartedAt = undefined
        if (this.health <= 0) {
          this.defeat()
          return
        }
        this.sprite.setTexture("statue-walk", 26)
      }
    }
    if (this.invulnerableUntil !== 0) {
      const remaining = this.invulnerableUntil - now
      if (remaining > 0) {
        const elapsed = Slime.damageCooldown - remaining
        this.sprite.setAlpha(Math.floor(elapsed / 100) % 2 === 0 ? 0.35 : 1)
      } else {
        this.sprite.setAlpha(1)
        this.invulnerableUntil = 0
      }
    }

    if (this.stoppedUntil !== 0) {
      if (now < this.stoppedUntil) {
        return
      }
      this.stoppedUntil = 0
      this.sprite.setImmovable(false)
    }

    const distanceX = player.x - this.sprite.x
    const distanceY = player.y - this.sprite.y
    const distance = Math.hypot(distanceX, distanceY)

    if (this.strike) {
      const row = Math.abs(distanceX) > Math.abs(distanceY)
        ? (distanceX < 0 ? 1 : 3)
        : (distanceY < 0 ? 0 : 2)
      if (this.updateSlash(player, now, row, distance)) return
      this.sprite.setFrame(row * 13 + Math.floor(now / 130) % 9)
    }

    if (distance === 0) {
      this.sprite.setVelocity(0, 0)
      return
    }

    this.sprite.setVelocity(
      (distanceX / distance) * this.maxSpeed,
      (distanceY / distance) * this.maxSpeed,
    )
  }

  private updateSlash(player: Phaser.Physics.Arcade.Sprite, now: number, row: number, distance: number): boolean {
    if (!this.slash) {
      if (distance > 88 || now < this.nextSlashAt) return false
      this.slash = { startedAt: now, row, didHit: false }
      this.nextSlashAt = now + 1200
      this.sprite.setVelocity(0, 0)
      this.sprite.setTexture("statue-slash", row * 6)
      this.sprite.setOffset(45, 45)
    }

    const slash = this.slash
    const frame = Math.floor((now - slash.startedAt) / 65)
    if (frame >= 6) {
      this.slash = undefined
      this.sprite.setTexture("statue-walk", slash.row * 13)
      this.sprite.setOffset(13, 13)
      return false
    }

    this.sprite.setFrame(slash.row * 6 + frame)
    if (frame >= 3 && !slash.didHit) {
      slash.didHit = true
      const dx = player.x - this.sprite.x
      const dy = player.y - this.sprite.y
      const forward = [-dy, -dx, dy, dx][slash.row]
      const sideways = Math.abs(slash.row % 2 === 0 ? dx : dy)
      if (forward >= 0 && forward <= 88 && sideways <= 44) this.strike?.()
    }
    return true
  }

  takeDamage(amount = 1): boolean {
    const now = gameplayNow(this.sprite.scene)
    if (!this.sprite.active || this.health <= 0 || now < this.invulnerableUntil) {
      return false
    }

    this.health = Math.max(0, this.health - amount)

    if (this.strike) {
      this.slash = undefined
      this.hurtStartedAt = now
      this.sprite.setTexture("statue-hurt", 0)
      this.sprite.setOffset(13, 13)
      if (this.health === 0) this.sprite.disableBody(false, false)
    }

    if (this.health === 0 && !this.strike) {
      this.defeat()
      return true
    }

    this.updateHealthBar()
    this.invulnerableUntil = now + Slime.damageCooldown
    this.stopUntil(this.invulnerableUntil)
    this.sprite.setAlpha(0.35)
    return this.health === 0
  }

  private defeat(): void {
    this.sprite.disableBody(true, true)
    this.healthBar.destroy()
  }

  private updateHealthBar(): void {
    this.healthFill.setScale(this.health / this.maxHealth, 1)
    this.healthLabel.setText(`${this.health}/${this.maxHealth}`)
  }

  getHealth(): number {
    return this.health
  }
}
