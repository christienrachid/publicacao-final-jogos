import { gameplayNow } from "./gameplay-clock"
export class Companion {
  readonly sprite: Phaser.Physics.Arcade.Sprite

  private readonly stopDistance = 68
  private readonly followSpeed = 140
  private readonly textureKey: "kael" | "rian" | "lira"
  private readonly side: -1 | 1
  private readonly formationDistance = 75
  private facing: "up" | "down" | "left" | "right" = "down"

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    textureKey: "kael" | "rian" | "lira",
    side: -1 | 1,
  ) {
    this.textureKey = textureKey
    this.side = side
    this.sprite = scene.physics.add.sprite(x, y, this.textureKey)
    this.sprite.setOrigin(0.5, 0.5)
    this.sprite.setScale(1.5)
    this.sprite.setCollideWorldBounds(true)

    this.setCenteredFrame(0)
    this.sprite.setVelocity(0, 0)
  }

  private setCenteredFrame(frame: number): void {
    this.sprite.setFrame(frame)
    this.sprite.setOrigin(0.5, 0.5)
  }

  update(target: Phaser.Physics.Arcade.Sprite): void {
    if (!this.sprite.active || !this.sprite.body) {
      return
    }

    const targetOffsetX = this.side * this.formationDistance
    const targetOffsetY = this.formationDistance * 0.65

    const targetX = target.x - targetOffsetX
    const targetY = target.y + targetOffsetY

    const distanceX = targetX - this.sprite.x
    const distanceY = targetY - this.sprite.y
    const distance = Math.hypot(distanceX, distanceY)

    if (distance <= 20) {
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

    this.sprite.setVelocity(
      (distanceX / distance) * this.followSpeed,
      (distanceY / distance) * this.followSpeed,
    )

    this.facing = Math.abs(distanceX) > Math.abs(distanceY)
      ? distanceX > 0 ? "right" : "left"
      : distanceY > 0 ? "down" : "up"

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
}
