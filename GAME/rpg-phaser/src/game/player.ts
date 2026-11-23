import { gameplayNow } from "./gameplay-clock"
import { Controls } from "./controls"
import type { FacingDirection } from "./bullets"

export type PlayerCharacter = "kael" | "rian" | "lira"
export const attackSheets = {
  kael: { path: "Kael/thrust_oversize.png", size: 192, frames: 8 },
  rian: { path: "Rian/halfslash_128.png", size: 128, frames: 6 },
  lira: { path: "Lira/thrust_oversize.png", size: 192, frames: 8 },
}
const attackRows = { up: 0, left: 1, down: 2, right: 3 }
const attackFrameDuration = 50

export class Player {
  static readonly hurtDuration = 325
  readonly sprite: Phaser.Physics.Arcade.Sprite
  character: PlayerCharacter

  private readonly controls: Controls
  private readonly speed = 200
  private hurtStartedAt = 0
  private invulnerableUntil = 0
  private facing: FacingDirection = "down"
  private attack?: { startedAt: number; impact: () => void }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    character: PlayerCharacter,
  ) {
    this.sprite = scene.physics.add.sprite(x, y, character)

    this.sprite.setOrigin(0.5, 0.5)
    this.sprite.setScale(1.5)

    this.sprite.setCollideWorldBounds(true)

    this.controls = new Controls(scene)

    this.character = character

    this.setCenteredFrame(0)
    this.sprite.setVelocity(0, 0)
  }

  getCharacter(): PlayerCharacter {
    return this.character
  }

  private setCenteredFrame(frame: number): void {
    this.sprite.setFrame(frame)
    this.sprite.setOrigin(0.5, 0.5)
  }

  playHurt(invulnerableUntil: number): void {
    this.attack = undefined
    this.sprite.setOffset(0, 0)
    this.hurtStartedAt = gameplayNow(this.sprite.scene)
    this.invulnerableUntil = invulnerableUntil
    this.sprite.setVelocity(0, 0)
    this.updateHurt()
  }

  private updateHurt(): boolean {
    const now = gameplayNow(this.sprite.scene)
    const elapsed = now - this.hurtStartedAt

    if (now < this.invulnerableUntil) {
      this.sprite.setAlpha(Math.floor(elapsed / 100) % 2 === 0 ? 0.35 : 1)

      if (elapsed < Player.hurtDuration) {
        this.sprite.setTexture(`${this.character}-hurt`, Math.floor(elapsed / 25))
        return true
      }
    } else if (this.invulnerableUntil !== 0) {
      this.sprite.setAlpha(1)
      this.invulnerableUntil = 0
    }

    return false
  }

  startAttack(impact: () => void): void {
    if (this.attack || this.sprite.texture.key === `${this.character}-hurt`) {
      return
    }

    const { frames, size } = attackSheets[this.character]
    this.attack = { startedAt: gameplayNow(this.sprite.scene), impact }
    this.sprite.setVelocity(0, 0)
    this.sprite.setTexture(`${this.character}-attack`, attackRows[this.facing] * frames)
    this.sprite.setBodySize(64, 64, false)
    this.sprite.setOffset((size - 64) / 2, (size - 64) / 2)
  }

  cancelAttack(): void {
    if (!this.attack) return
    this.attack = undefined
    this.sprite.setTexture(this.character)
    this.sprite.setOffset(0, 0)
  }

  private updateAttack(): boolean {
    if (!this.attack) {
      return false
    }

    const { frames } = attackSheets[this.character]
    const frame = Math.floor((gameplayNow(this.sprite.scene) - this.attack.startedAt) / attackFrameDuration)
    if (frame < frames) {
      this.sprite.setFrame(attackRows[this.facing] * frames + frame)
      if (this.character === "rian" && frame >= 1 && frame <= 4) {
        this.attack.impact()
      }
      return true
    }

    const { impact } = this.attack
    this.attack = undefined
    this.sprite.setOffset(0, 0)
    if (this.character !== "rian") {
      impact()
    }
    return false
  }

  update(): void {
    if (this.updateHurt() || this.updateAttack()) {
      return
    }

    if (this.sprite.texture.key !== this.character) {
      this.sprite.setTexture(this.character)
    }

    const movement = this.controls.getMovement()

    if (movement.horizontal === 0 && movement.vertical === 0) {
      this.sprite.setVelocity(0, 0)

      const idleFrames = {
        down: 26,
        right: 39,
        left: 13,
        up: 0,
      }

      this.setCenteredFrame(idleFrames[this.facing])
      return
    }

    const length = Math.hypot(movement.horizontal, movement.vertical)
    const horizontal = movement.horizontal / length
    const vertical = movement.vertical / length

    this.sprite.setVelocity(
      horizontal * this.speed,
      vertical * this.speed,
    )

    if (Math.abs(horizontal) > Math.abs(vertical)) {
      this.facing = horizontal > 0 ? "right" : "left"
    } else {
      this.facing = vertical > 0 ? "down" : "up"
    }

    const walkingFrames = {
      down: [26, 27, 28, 29, 30, 31, 32, 33, 34],
      right: [39, 40, 41, 42, 43, 44, 45, 46, 47],
      left: [13, 14, 15, 16, 17, 18, 19, 20, 21],
      up: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    }

    const frameIndex =
      Math.floor(gameplayNow(this.sprite.scene) / 150) % 9

    this.setCenteredFrame(walkingFrames[this.facing][frameIndex])
  }

  getFacing(): "up" | "down" | "left" | "right" {
    return this.facing
  }

  setCharacter(character: PlayerCharacter): void {
    this.attack = undefined
    this.character = character
    this.sprite.setTexture(character)
    this.sprite.setScale(1.5)
    this.sprite.setOffset(0, 0)
    this.setCenteredFrame(0)
  }
}
