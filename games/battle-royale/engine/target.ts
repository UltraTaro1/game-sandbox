import * as THREE from 'three'
import { CollisionWorld } from '../../../src/core/collision'
import { Player } from './player'
import type { Effects } from '../../../src/systems/effects'
import type { Zone } from './zone'
import type { NavGrid } from '../../../src/systems/navgrid'
import { audio } from '../../../src/systems/audio'

/** 能被打、能被打算距离的东西（玩家和人机都满足） */
export interface Combatant {
  pos: THREE.Vector3
  alive: boolean
  name: string
}

const BOT_SPEED = 4.0
const BOT_SIGHT = 38
const BOT_HP = 115
const THINK_INTERVAL = 0.26

/** 人机拿到不同枪之后的战斗参数（和玩家数值分开平衡） */
interface GunStats {
  dmg: number
  interval: number
  range: number
  spread: number
}

const BOT_GUNS: Record<string, GunStats> = {
  ar: { dmg: 6, interval: 1.55, range: 32, spread: 0.06 },
  sg: { dmg: 10, interval: 1.9, range: 16, spread: 0.09 },
  dmr: { dmg: 11, interval: 2.4, range: 42, spread: 0.04 },
  awm: { dmg: 24, interval: 3.2, range: 48, spread: 0.028 },
}
const DEFAULT_GUN: GunStats = BOT_GUNS.ar

/** 人机找枪用的最小接口，避免和 LootSystem 循环依赖 */
export interface BotLootApi {
  findWeapon(pos: THREE.Vector3, maxDist: number): { pos: THREE.Vector3; id: string } | null
  claimWeaponAt(pos: THREE.Vector3, radius: number): string | null
}

interface TargetDeps {
  scene: THREE.Scene
  world: CollisionWorld
  solids: THREE.Object3D
  raycaster: THREE.Raycaster
  effects: Effects
  player: Player
  loot: BotLootApi
  onPlayerHit: (dmg: number) => void
  onKilled: (victim: Target, killer: Combatant | null) => void
}

export class Target implements Combatant {
  name: string
  hp = BOT_HP
  maxHp = BOT_HP
  alive = true
  pos = new THREE.Vector3()
  group = new THREE.Group()

  private deps: TargetDeps
  private home = new THREE.Vector3()
  private bodyMat: THREE.MeshStandardMaterial
  private headMat: THREE.MeshStandardMaterial
  private bar: THREE.Group
  private barFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private muzzle = new THREE.Object3D()
  private body: THREE.Group
  private tmpQuat = new THREE.Quaternion()

  private yaw = 0
  private vel = new THREE.Vector3()
  private collapsed = 0
  private flashTimer = 0
  private fireTimer = 1 + Math.random()
  private reactTimer = 0
  private thinkTimer = Math.random() * THINK_INTERVAL
  private strafeTimer = 0
  private strafeDir = 1
  private wanderTarget = new THREE.Vector3()
  private wanderTimer = 0
  private target: Combatant | null = null
  private targetVisible = false
  private lastKnown = new THREE.Vector3()
  private alertTimer = 0
  private stuckTimer = 0
  private stuckSpot = new THREE.Vector3()
  private detourTimer = 0
  private detourDir = 1

  // 寻路
  private path: THREE.Vector3[] = []
  private pathIndex = 0
  private pathTimer = 0
  private goal = new THREE.Vector3()
  private pathGoal = new THREE.Vector3(9999, 0, 9999)
  private zoneBias = new THREE.Vector3()

  // 手上的枪：null 表示还没捡到
  private weaponId: string | null = null
  private lootGoal: THREE.Vector3 | null = null
  private lootTimer = 0

  get gun(): GunStats {
    return (this.weaponId && BOT_GUNS[this.weaponId]) || DEFAULT_GUN
  }

  get armed(): boolean {
    return this.weaponId !== null
  }

  constructor(deps: TargetDeps, spawn: THREE.Vector3, name: string, hue: number) {
    this.deps = deps
    this.name = name
    this.pos.copy(spawn)
    this.home.copy(spawn)
    this.lastKnown.copy(spawn)
    this.stuckSpot.copy(spawn)

    // 跑毒目标点带一个固定偏移，免得全挤在圈心
    const a0 = Math.random() * Math.PI * 2
    this.zoneBias.set(Math.cos(a0) * 0.45, 0, Math.sin(a0) * 0.45)

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.44, 0.36),
      roughness: 0.82,
    })
    this.headMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue + 0.02, 0.5, 0.62),
      roughness: 0.7,
    })

    this.body = new THREE.Group()
    this.group.add(this.body)
    this.buildMesh()

    this.bar = new THREE.Group()
    this.bar.position.y = 2.15
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x11151a, transparent: true, opacity: 0.72, depthWrite: false }),
    )
    this.barFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.88, 0.055),
      new THREE.MeshBasicMaterial({ color: this.bodyMat.color.clone().offsetHSL(0, 0, 0.18), depthWrite: false }),
    )
    this.barFill.position.z = 0.002
    this.bar.add(bg, this.barFill)
    this.group.add(this.bar)

    this.canopy = this.buildCanopy()
    this.group.add(this.canopy)

    this.group.position.copy(this.pos)
    this.group.userData.entity = this
    deps.scene.add(this.group)
  }

  private buildMesh(): void {
    const box = (w: number, h: number, d: number, m: THREE.Material) =>
      new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.52, 4, 10), this.bodyMat)
    torso.position.y = 1.05
    torso.castShadow = true
    torso.userData.entity = this
    this.body.add(torso)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 10), this.headMat)
    head.position.y = 1.63
    head.castShadow = true
    head.userData.entity = this
    head.userData.zone = 'head'
    this.body.add(head)

    const legGeo = new THREE.BoxGeometry(0.17, 0.75, 0.18)
    for (const sx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(legGeo, this.bodyMat)
      leg.position.set(sx, 0.38, 0)
      leg.castShadow = true
      leg.userData.entity = this
      this.body.add(leg)
    }

    const gun = new THREE.Group()
    gun.position.set(0.28, 1.25, -0.3)
    const rec = box(
      0.07,
      0.1,
      0.44,
      new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.4 }),
    )
    gun.add(rec)
    this.muzzle.position.set(0, 0, -0.28)
    gun.add(this.muzzle)
    this.body.add(gun)
  }

  get muzzleWorld(): THREE.Vector3 {
    return this.muzzle.getWorldPosition(new THREE.Vector3())
  }

  // 跳伞
  dropping = false
  private dropFrom = new THREE.Vector3()
  private dropTo = new THREE.Vector3()
  private dropT = 0
  private dropDur = 1
  private canopy: THREE.Group | null = null

  /** 从飞机上跳下来 */
  startDrop(from: THREE.Vector3, to: THREE.Vector3, dur: number): void {
    this.dropping = true
    this.dropFrom.copy(from)
    this.dropTo.copy(to)
    this.dropT = 0
    this.dropDur = Math.max(1, dur)
    this.pos.copy(from)
    this.group.position.copy(from)
    if (this.canopy) this.canopy.visible = true
    this.bar.visible = false
  }

  private buildCanopy(): THREE.Group {
    const g = new THREE.Group()
    const dome = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 1.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2dcc8, roughness: 0.9, side: THREE.DoubleSide }),
    )
    dome.position.y = 3.4
    g.add(dome)
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const line = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 2.6, 4),
        new THREE.MeshStandardMaterial({ color: 0x8b8674 }),
      )
      line.position.set(Math.cos(a) * 0.5, 2.2, Math.sin(a) * 0.5)
      line.rotation.z = Math.cos(a) * 0.34
      line.rotation.x = -Math.sin(a) * 0.34
      g.add(line)
    }
    g.visible = false
    return g
  }

  takeDamage(amount: number, isHead: boolean, killer: Combatant | null = null): boolean {
    if (!this.alive || this.dropping) return false
    this.hp -= amount
    this.flashTimer = 0.1
    this.bodyMat.emissive.setHex(isHead ? 0xff3333 : 0xffaa55)
    this.bodyMat.emissiveIntensity = 0.6

    // 被打就回头找开枪的人
    if (killer && killer.alive) {
      this.target = killer
      this.lastKnown.copy(killer.pos)
      this.alertTimer = Math.max(this.alertTimer, 4)
      this.thinkTimer = 0
    }

    if (this.hp <= 0) {
      this.alive = false
      this.collapsed = 0
      this.vel.set(0, 0, 0)
      this.deps.onKilled(this, killer)
      return true
    }
    return false
  }

  /** 圈外掉血 */
  takeZoneDamage(amount: number): void {
    if (!this.alive) return
    this.hp -= amount
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      this.collapsed = 0
      this.vel.set(0, 0, 0)
      this.deps.onKilled(this, null)
    }
  }

  reset(spawn: THREE.Vector3): void {
    this.pos.copy(spawn)
    this.home.copy(spawn)
    this.lastKnown.copy(spawn)
    this.stuckSpot.copy(spawn)
    this.hp = this.maxHp
    this.alive = true
    this.collapsed = 0
    this.group.visible = true
    this.group.rotation.set(0, 0, 0)
    this.body.rotation.set(0, 0, 0)
    this.bar.visible = true
    this.vel.set(0, 0, 0)
    this.target = null
    this.targetVisible = false
    this.alertTimer = 0
    this.reactTimer = 0
    this.flashTimer = 0
    this.bodyMat.emissive.setHex(0x000000)
    this.stuckTimer = 0
    this.detourTimer = 0
    this.fireTimer = 1 + Math.random()
    this.path = []
    this.pathIndex = 0
    this.pathTimer = 0
    this.pathGoal.set(9999, 0, 9999)
    this.weaponId = null
    this.lootGoal = null
    this.lootTimer = 0
    this.dropping = false
    if (this.canopy) this.canopy.visible = false
  }

  update(dt: number, camera: THREE.Camera, others: Target[], zone: Zone, nav: NavGrid): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) this.bodyMat.emissive.setHex(0x000000)
    }

    if (!this.alive) {
      this.updateCollapse(dt)
      return
    }

    if (this.dropping) {
      this.dropT += dt / this.dropDur
      const t = Math.min(1, this.dropT)
      this.pos.lerpVectors(this.dropFrom, this.dropTo, t)
      this.pos.y = this.dropFrom.y + (this.dropTo.y - this.dropFrom.y) * t + Math.sin(t * Math.PI) * 2
      this.group.position.copy(this.pos)
      this.group.rotation.y += dt * 0.5
      if (this.canopy) this.canopy.rotation.y += dt * 0.35
      if (t >= 1) {
        this.dropping = false
        this.pos.copy(this.dropTo)
        this.group.rotation.y = 0
        if (this.canopy) this.canopy.visible = false
        this.bar.visible = true
      }
      return
    }

    this.thinkTimer -= dt
    if (this.thinkTimer <= 0) {
      this.thinkTimer = THINK_INTERVAL + Math.random() * 0.08
      this.think(others)
    }

    this.act(dt, others, zone, nav)
    this.syncTransform(camera)
  }

  // ---------- 决策 ----------

  private think(others: Target[]): void {
    const player = this.deps.player

    // 候选：玩家 + 其他人机，按距离取最近的三个做视线检查（省射线）
    const cands: { c: Combatant; d: number }[] = []
    if (player.alive) {
      cands.push({ c: player, d: this.pos.distanceTo(player.pos) })
    }
    for (const o of others) {
      if (o === this || !o.alive || o.dropping) continue
      const d = this.pos.distanceTo(o.pos)
      if (d < BOT_SIGHT) cands.push({ c: o, d })
    }
    cands.sort((a, b) => a.d - b.d)

    // 当前目标还看得见就继续打
    if (this.target && this.target.alive && this.pos.distanceTo(this.target.pos) < BOT_SIGHT) {
      if (this.hasLineOfSight(this.target)) {
        this.targetVisible = true
        this.lastKnown.copy(this.target.pos)
        this.alertTimer = 4
        if (this.reactTimer <= 0) this.reactTimer = 0.45
        return
      }
    }

    this.targetVisible = false

    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const c = cands[i].c
      if (this.hasLineOfSight(c)) {
        if (this.target !== c) this.reactTimer = 0.455
        this.target = c
        this.targetVisible = true
        this.lastKnown.copy(c.pos)
        this.alertTimer = 4
        return
      }
    }

    if (this.alertTimer > 0) this.alertTimer -= THINK_INTERVAL
  }

  // ---------- 行动 ----------

  private act(dt: number, others: Target[], zone: Zone, nav: NavGrid): void {
    const player = this.deps.player
    this.reactTimer = Math.max(0, this.reactTimer - dt)
    this.fireTimer -= dt
    if (this.detourTimer > 0) this.detourTimer -= dt

    const distCenter = zone.distToCenter(this.pos)
    const outside = distCenter > zone.radius - 2

    let moveX = 0
    let moveZ = 0
    let faceX = 0
    let faceZ = 0
    let usePath = false

    const t = this.target && this.target.alive ? this.target : null
    const tDist = t ? this.pos.distanceTo(t.pos) : Infinity
    const gun = this.gun

    if (!this.weaponId) {
      // 空手：先找枪，路上被贴脸就跑
      const got = this.deps.loot.claimWeaponAt(this.pos, 2.2)
      if (got) {
        this.weaponId = got
        this.fireTimer = 0.7
        this.lootGoal = null
      } else {
        this.lootTimer -= dt
        if (this.lootTimer <= 0 || !this.lootGoal) {
          this.lootTimer = 2
          const found = this.deps.loot.findWeapon(this.pos, 90)
          if (!found) {
            this.lootGoal = null
          } else {
            // 只有新枪明显更近才换目标，否则会在两把枪之间来回摆
            const cur = this.lootGoal ? this.pos.distanceTo(this.lootGoal) : Infinity
            const next = this.pos.distanceTo(found.pos)
            if (!this.lootGoal || next < cur - 6) {
              this.lootGoal = new THREE.Vector3(found.pos.x, 0, found.pos.z)
            }
          }
        } else if (this.lootGoal && this.pos.distanceTo(this.lootGoal) < 2.6) {
          // 走到了却没有枪：多半被人捡走了，立刻重新找
          this.lootGoal = null
          this.lootTimer = 0
        }
        if (this.lootGoal) {
          // 只有面对"有枪的人"才躲；两个空手的人机互相逃会原地打转
          const threatened = !!t && this.targetVisible && tDist < 14 && (t === this.deps.player || (t as Target).armed)
          if (threatened && t) {
            this.goal.set(this.pos.x * 2 - t.pos.x, 0, this.pos.z * 2 - t.pos.z)
          } else {
            this.goal.copy(this.lootGoal)
          }
          usePath = true
          faceX = this.goal.x - this.pos.x
          faceZ = this.goal.z - this.pos.z
        }
      }
    } else if (outside) {
      // 跑毒优先：目标点带固定偏移，免得全挤在圈心
      this.goal.set(
        zone.center.x + this.zoneBias.x * zone.radius,
        0,
        zone.center.z + this.zoneBias.z * zone.radius,
      )
      usePath = true
    } else if (t && this.targetVisible && tDist < 18) {
      // 近距离交战：直接走位，不走寻路
      const tx = t.pos.x - this.pos.x
      const tz = t.pos.z - this.pos.z
      const td = Math.hypot(tx, tz) || 1
      faceX = tx
      faceZ = tz

      if (tDist < 9) {
        moveX = -tx / td
        moveZ = -tz / td
      } else {
        this.strafeTimer -= dt
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 1.2 + Math.random() * 1.2
          this.strafeDir *= -1
        }
        moveX = (-tz / td) * this.strafeDir * 0.9
        moveZ = (tx / td) * this.strafeDir * 0.9
      }
    } else if (t && (this.targetVisible || this.alertTimer > 0)) {
      // 中远距离追击：交给 A*
      this.goal.copy(this.targetVisible ? t.pos : this.lastKnown)
      usePath = true
      faceX = this.goal.x - this.pos.x
      faceZ = this.goal.z - this.pos.z
    } else {
      // 巡逻
      this.wanderTimer -= dt
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 3
        const a = Math.random() * Math.PI * 2
        const r = 5 + Math.random() * 12
        this.wanderTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r)
      }
      this.goal.copy(this.wanderTarget)
      usePath = this.pos.distanceTo(this.goal) > 6
      faceX = this.goal.x - this.pos.x
      faceZ = this.goal.z - this.pos.z
    }

    if (usePath) {
      const dir = this.followPath(nav, dt)
      if (dir) {
        moveX = dir.x
        moveZ = dir.z
        faceX = dir.x
        faceZ = dir.z
      }
    }

    // 开火（跑毒路上也照打）
    if (this.weaponId && t && this.targetVisible && this.reactTimer <= 0 && tDist < gun.range && this.fireTimer <= 0) {
      this.fireTimer = gun.interval * (0.85 + Math.random() * 0.4)
      this.shootAt(t, gun)
    }

    // 避免互相挤成一坨
    for (const o of others) {
      if (o === this || !o.alive) continue
      const dx = this.pos.x - o.pos.x
      const dz = this.pos.z - o.pos.z
      const d2 = dx * dx + dz * dz
      if (d2 < 2.0 && d2 > 1e-4) {
        const d = Math.sqrt(d2)
        moveX += (dx / d) * 0.8
        moveZ += (dz / d) * 0.8
      }
    }
    // 别贴玩家身上
    if (player.alive) {
      const dx = this.pos.x - player.pos.x
      const dz = this.pos.z - player.pos.z
      const d2 = dx * dx + dz * dz
      if (d2 < 1.8 && d2 > 1e-4) {
        const d = Math.sqrt(d2)
        moveX += (dx / d) * 0.9
        moveZ += (dz / d) * 0.9
      }
    }

    // 卡住了就侧向绕一下
    if (this.pos.distanceTo(this.stuckSpot) < 0.25) {
      this.stuckTimer += dt
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 1.5)
      this.stuckSpot.copy(this.pos)
    }
    if (this.stuckTimer > 0.55) {
      this.stuckTimer = 0
      this.detourTimer = 0.75
      this.detourDir = Math.random() < 0.5 ? -1 : 1
      this.stuckSpot.copy(this.pos)
    }
    if (this.detourTimer > 0 && (moveX !== 0 || moveZ !== 0)) {
      const len = Math.hypot(moveX, moveZ) || 1
      const px = -moveZ / len
      const pz = moveX / len
      moveX += px * this.detourDir * 1.4
      moveZ += pz * this.detourDir * 1.4
    }

    const len = Math.hypot(moveX, moveZ)
    if (len > 0.001) {
      moveX /= len
      moveZ /= len
    }

    // 位移
    this.vel.x += (moveX * BOT_SPEED - this.vel.x) * Math.min(1, dt * 8)
    this.vel.z += (moveZ * BOT_SPEED - this.vel.z) * Math.min(1, dt * 8)

    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    this.deps.world.resolveHorizontal(this.pos, 0.36, 1.75, 0.5)

    const prevFeet = this.pos.y
    this.vel.y -= 24 * dt
    this.pos.y += this.vel.y * dt
    const support = this.deps.world.supportHeight(this.pos.x, this.pos.z, prevFeet, 0.5)
    if (this.pos.y <= support) {
      this.pos.y = support
      this.vel.y = 0
    }

    // 朝向
    if (faceX !== 0 || faceZ !== 0) {
      const face = Math.atan2(-faceX, -faceZ)
      this.yaw += angleDelta(this.yaw, face) * Math.min(1, dt * 8)
    }
  }

  /**
   * 沿 A* 路径走，返回本帧的移动方向。
   * 没有路径或已经到终点时返回 null，让调用方退回直接转向。
   */
  private followPath(nav: NavGrid, dt: number): { x: number; z: number } | null {
    this.pathTimer -= dt
    const goalMoved = this.pathGoal.distanceToSquared(this.goal) > 25

    if (this.pathTimer <= 0 || goalMoved) {
      this.pathTimer = 1.2 + Math.random()
      this.pathGoal.copy(this.goal)
      this.path = nav.findPath(this.pos, this.goal) ?? []
      this.pathIndex = 0
    }

    // 走到当前航点就推进下一个
    while (this.pathIndex < this.path.length && this.pos.distanceTo(this.path[this.pathIndex]) < 0.9) {
      this.pathIndex++
    }

    if (this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex]
      const dx = wp.x - this.pos.x
      const dz = wp.z - this.pos.z
      const d = Math.hypot(dx, dz) || 1
      return { x: dx / d, z: dz / d }
    }

    // 路径走完了：先直接朝目标走，等下次重算
    const gx = this.goal.x - this.pos.x
    const gz = this.goal.z - this.pos.z
    const gd = Math.hypot(gx, gz)
    if (gd < 1.2) return null
    return { x: gx / gd, z: gz / gd }
  }

  private hasLineOfSight(c: Combatant): boolean {
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z)
    const to = new THREE.Vector3(c.pos.x, c.pos.y + 1.05, c.pos.z)
    const dir = to.clone().sub(from)
    const dist = dir.length()
    if (dist < 0.001) return true
    dir.divideScalar(dist)

    this.deps.raycaster.set(from, dir)
    this.deps.raycaster.far = dist
    return this.deps.raycaster.intersectObject(this.deps.solids, true).length === 0
  }

  private shootAt(target: Combatant, gun: GunStats): void {
    const origin = this.muzzleWorld
    const aim = new THREE.Vector3(target.pos.x, target.pos.y + 1.05, target.pos.z)
    const dir = aim.clone().sub(origin).normalize()

    const spread = gun.spread
    dir.x += (Math.random() - 0.5) * spread * 2
    dir.y += (Math.random() - 0.5) * spread * 2
    dir.z += (Math.random() - 0.5) * spread * 2
    dir.normalize()

    const toTarget = aim.clone().sub(origin)
    const along = toTarget.dot(dir)
    let hit = false
    if (along > 0) {
      const closest = origin.clone().addScaledVector(dir, along)
      hit = closest.distanceTo(aim) < 0.62
    }

    const end = hit ? aim.clone() : origin.clone().addScaledVector(dir, 60)
    this.deps.effects.tracer(origin, end, 0xff8a4a)
    this.deps.effects.muzzleFlash(origin)
    audio.shot('rifle', origin, false)

    if (!hit) return
    if (target === this.deps.player) this.deps.onPlayerHit(gun.dmg)
    else (target as Target).takeDamage(gun.dmg, false, this)
  }

  private updateCollapse(dt: number): void {
    if (this.collapsed >= 1 && !this.group.visible) return
    this.collapsed = Math.min(1, this.collapsed + dt * 3.4)
    this.body.rotation.x = -this.collapsed * Math.PI * 0.5
    this.bar.visible = false
    if (this.collapsed >= 1) this.group.visible = false
  }

  private syncTransform(camera: THREE.Camera): void {
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z)
    this.group.rotation.y = this.yaw

    const ratio = Math.max(0, this.hp / this.maxHp)
    this.barFill.scale.x = ratio
    this.barFill.position.x = -(1 - ratio) * 0.44

    this.tmpQuat.copy(this.group.quaternion).invert().multiply(camera.quaternion)
    this.bar.quaternion.copy(this.tmpQuat)
  }
}

function angleDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
