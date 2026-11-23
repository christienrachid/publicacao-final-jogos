import { gameplayNow } from "./gameplay-clock"
export type FacingDirection = "up" | "down" | "left" | "right"

const directions = {
  up: { x: 0, y: -1, angle: -90 },
  down: { x: 0, y: 1, angle: 90 },
  left: { x: -1, y: 0, angle: 180 },
  right: { x: 1, y: 0, angle: 0 },
}

const projectileArt = {
  kael: { originX: 0.8, originY: 0.51, angle: 0 },
  lira: { originX: 0.2, originY: 0.56, angle: 180 },
}

export class Bullet {
  readonly sprite: Phaser.Physics.Arcade.Sprite
  private readonly createdAt: number

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    direction: FacingDirection,
    character: keyof typeof projectileArt,
    speed = 360,
  ) {
    const art = projectileArt[character]
    const heading = directions[direction]

    this.sprite = scene.physics.add.sprite(x, y, `${character}-projectile`)
    this.sprite.setDisplaySize(64, 64)
    this.sprite.setOrigin(art.originX, art.originY)
    this.sprite.setAngle(heading.angle + art.angle)

    // Keep the collision body at the projectile's head, where the sprite pivots.
    const bodySize = 16 / this.sprite.scaleX
    this.sprite.setBodySize(bodySize, bodySize, false)
    this.sprite.setOffset(
      this.sprite.displayOriginX - bodySize / 2,
      this.sprite.displayOriginY - bodySize / 2,
    )
    this.sprite.setCollideWorldBounds(true)
    this.sprite.setVelocity(heading.x * speed, heading.y * speed)
    this.createdAt = gameplayNow(scene)
  }

  update(scene: Phaser.Scene): void {
    if (gameplayNow(scene) - this.createdAt >= 1500) {
      this.sprite.disableBody(true, true)
    }
  }
}
