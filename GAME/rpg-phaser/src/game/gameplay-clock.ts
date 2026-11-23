const sceneTimes = new WeakMap<Phaser.Scene, number>()

export function startGameplayClock(scene: Phaser.Scene): void {
  let elapsed = 0
  sceneTimes.set(scene, elapsed)

  // Phaser's Clock.now follows the global loop. Accumulate only active scene steps.
  const advance = (_time: number, delta: number) => {
    elapsed += delta
    sceneTimes.set(scene, elapsed)
  }
  scene.events.on("preupdate", advance)
  scene.events.once("shutdown", () => {
    scene.events.off("preupdate", advance)
    sceneTimes.delete(scene)
  })
}

export function gameplayNow(scene: Phaser.Scene): number {
  return sceneTimes.get(scene) ?? scene.time.now
}
