import * as THREE from 'three'
import type { Player } from './player'
import type { Target } from './target'
import type { Level } from './level'
import type { Input } from '../../../src/core/input'
import type { CameraRig } from '../../../src/systems/cameraRig'
import { audio } from '../../../src/systems/audio'
import type { HUD } from '../ui/hud'

export type DropPhase = 'plane' | 'freefall' | 'chute' | 'ground'

export interface DropDeps {
  player: Player
  targets: Target[]
  level: Level
  rig: CameraRig
  input: Input
  hud: HUD
}

/**
 * 跳伞流程：飞机沿航线飞 → 按空格跳出 → 自由落体 → 62m 自动开伞 → 落地。
 * 开局和重开都调用 begin()。
 */
export class DropController {
  phase: DropPhase
  private planeT = 0
  private planeDir = new THREE.Vector3()
  private airVel = new THREE.Vector3()

  constructor(private deps: DropDeps) {
    this.phase = deps.level.dropPath ? 'plane' : 'ground'
  }

  /** 把玩家和全体人机放回飞机上 */
  begin(): void {
    const { player, targets, level, rig } = this.deps
    const path = level.dropPath
    if (!path) {
      this.phase = 'ground'
      return
    }

    this.phase = 'plane'
    this.planeT = 0
    this.airVel.set(0, 0, 0)
    this.planeDir.copy(path.to).sub(path.from).setY(0).normalize()

    player.pos.copy(path.from)
    player.pos.y = path.altitude
    player.vel.set(0, 0, 0)
    player.yaw = Math.atan2(-this.planeDir.x, -this.planeDir.z)
    rig.pitch = -1.05

    // 人机沿航线分散落下
    for (const t of targets) {
      const along = 0.06 + Math.random() * 0.88
      const from = path.from.clone().lerp(path.to, along)
      from.y = path.altitude - Math.random() * 30

      const to = new THREE.Vector3(0, 0, 0)
      for (let i = 0; i < 50; i++) {
        const x = (Math.random() - 0.5) * level.bounds * 1.5
        const z = (Math.random() - 0.5) * level.bounds * 1.5
        const h = level.collision.supportHeight(x, z, 500, 0.55)
        if (level.collision.isBlocked(x, z, 1.2)) continue
        const water = level.collision.waterLevel
        if (water !== null && h < water + 0.8) continue
        to.set(x, h, z)
        break
      }
      if (to.lengthSq() === 0) to.copy(t.pos)
      t.startDrop(from, to, 9 + Math.random() * 8)
    }
  }

  update(dt: number): void {
    const { player, level, rig, input, hud } = this.deps
    const path = level.dropPath
    if (!path) {
      this.phase = 'ground'
      return
    }
    const pos = player.pos

    if (this.phase === 'plane') {
      this.planeT = Math.min(1, this.planeT + dt / 32)
      pos.lerpVectors(path.from, path.to, this.planeT)
      pos.y = path.altitude
      player.yaw = Math.atan2(-this.planeDir.x, -this.planeDir.z)
      hud.setPrompt('空格 · 跳伞', null)
      if (input.pressed('Space') || this.planeT >= 1) {
        this.phase = 'freefall'
        this.airVel.copy(this.planeDir).multiplyScalar(18)
        this.airVel.y = -14
        hud.setPrompt(null)
      }
      return
    }

    const alt = pos.y - level.collision.supportHeight(pos.x, pos.z, pos.y + 1, 0.55)

    let ix = 0
    let iz = 0
    const yaw = rig.yaw
    if (input.down('KeyW')) {
      ix -= Math.sin(yaw)
      iz -= Math.cos(yaw)
    }
    if (input.down('KeyS')) {
      ix += Math.sin(yaw)
      iz += Math.cos(yaw)
    }
    if (input.down('KeyD')) {
      ix += Math.cos(yaw)
      iz -= Math.sin(yaw)
    }
    if (input.down('KeyA')) {
      ix -= Math.cos(yaw)
      iz += Math.sin(yaw)
    }
    const len = Math.hypot(ix, iz) || 1
    const speed = this.phase === 'freefall' ? 26 : 12
    const k = Math.min(1, dt * 1.8)
    this.airVel.x += ((ix / len) * speed - this.airVel.x) * k
    this.airVel.z += ((iz / len) * speed - this.airVel.z) * k

    if (this.phase === 'freefall') {
      this.airVel.y = Math.max(-60, this.airVel.y - 26 * dt)
      if (alt < 62) this.phase = 'chute'
    } else {
      this.airVel.y = -7
    }

    pos.x += this.airVel.x * dt
    pos.z += this.airVel.z * dt
    pos.y += this.airVel.y * dt

    const b = level.bounds - 2
    pos.x = Math.max(-b, Math.min(b, pos.x))
    pos.z = Math.max(-b, Math.min(b, pos.z))

    const ground = level.collision.supportHeight(pos.x, pos.z, pos.y + 1, 0.55)
    if (pos.y <= ground + 0.05) {
      pos.y = ground
      this.phase = 'ground'
      this.airVel.set(0, 0, 0)
      player.vel.set(0, 0, 0)
      player.onGround = true
      hud.setPrompt(null)
      audio.step(true)
    } else {
      hud.setPrompt(
        this.phase === 'freefall' ? `自由落体 ${Math.round(alt)}m` : `滑翔伞 ${Math.round(alt)}m`,
        null,
      )
    }
  }
}
