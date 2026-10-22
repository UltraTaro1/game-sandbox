import * as THREE from 'three'
import { Player } from './player'
import { Target } from './target'
import type { Effects } from '../../../src/systems/effects'
import type { CameraRig } from '../../../src/systems/cameraRig'
import type { HUD } from '../ui/hud'
import { audio } from '../../../src/systems/audio'

export type Caliber = 'rifle' | 'shell'

export interface WeaponDef {
  id: string
  name: string
  caliber: Caliber
  /** 地面掉落物的颜色 */
  color: number
  damage: number
  headMult: number
  /** 两发之间的间隔（秒） */
  interval: number
  magSize: number
  /** 拾取时附带的备弹 */
  reserve: number
  reloadTime: number
  /** 腰射散布（度） */
  spreadHip: number
  /** 瞄准散布（度） */
  spreadAds: number
  pellets: number
  recoil: number
  auto: boolean
  /** 开镜时的 FOV，默认 52 */
  adsFov?: number
  /** 是否倍镜（全屏镜圈 + 几乎第一人称） */
  scoped?: boolean
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'ar',
    name: 'AR-4',
    caliber: 'rifle',
    color: 0x46586b,
    damage: 19,
    headMult: 1.9,
    interval: 0.1,
    magSize: 30,
    reserve: 30,
    reloadTime: 2.0,
    spreadHip: 2.0,
    spreadAds: 0.3,
    pellets: 1,
    recoil: 0.009,
    auto: true,
  },
  {
    id: 'sg',
    name: 'SG-5',
    caliber: 'shell',
    color: 0xa9713c,
    damage: 11,
    headMult: 1.4,
    interval: 0.8,
    magSize: 5,
    reserve: 10,
    reloadTime: 2.6,
    spreadHip: 4.5,
    spreadAds: 3.2,
    pellets: 8,
    recoil: 0.032,
    auto: false,
  },
  {
    id: 'dmr',
    name: 'DMR-7',
    caliber: 'rifle',
    color: 0x6b5a7a,
    damage: 36,
    headMult: 2.2,
    interval: 0.32,
    magSize: 10,
    reserve: 20,
    reloadTime: 2.4,
    spreadHip: 3.2,
    spreadAds: 0.12,
    pellets: 1,
    recoil: 0.02,
    auto: false,
    adsFov: 34,
  },
  {
    id: 'awm',
    name: 'AWM',
    caliber: 'rifle',
    color: 0x39424c,
    damage: 88,
    headMult: 2.5,
    interval: 1.45,
    magSize: 5,
    reserve: 10,
    reloadTime: 3.2,
    spreadHip: 7,
    spreadAds: 0.02,
    pellets: 1,
    recoil: 0.055,
    auto: false,
    adsFov: 16,
    scoped: true,
  },
]

export const START_WEAPON = 'ar'

export interface Slot {
  def: WeaponDef
  mag: number
  reserve: number
}

interface ShootingDeps {
  camera: THREE.PerspectiveCamera
  rig: CameraRig
  player: Player
  effects: Effects
  hud: HUD
  solids: THREE.Object3D
  targets: Target[]
}

export class ShootingSystem {
  slots: (Slot | null)[] = [null, null]
  index = 0
  reloading = false

  /** 换枪时把旧枪丢回地上 */
  onDrop?: (def: WeaponDef) => void

  private reloadTimer = 0
  private cooldown = 0
  private raycaster = new THREE.Raycaster()
  private dirVec = new THREE.Vector3()
  private rightVec = new THREE.Vector3()
  private upVec = new THREE.Vector3()
  private endPoint = new THREE.Vector3()
  private muzzle = new THREE.Vector3()

  shots = 0
  hits = 0

  private deps: ShootingDeps

  constructor(deps: ShootingDeps) {
    this.deps = deps
    this.giveStarter()
  }

  get current(): Slot | null {
    return this.slots[this.index]
  }

  /** 当前散布（度），准星用 */
  get spreadDeg(): number {
    const slot = this.current
    if (!slot) return 6
    const def = slot.def
    const p = this.deps.player
    let s = p.aiming ? def.spreadAds : def.spreadHip
    const speed = Math.hypot(p.vel.x, p.vel.z)
    s *= 1 + speed * 0.13
    if (!p.onGround) s *= 1.6
    return s
  }

  private giveStarter(): void {
    const def = WEAPONS.find((w) => w.id === START_WEAPON)!
    this.slots = [{ def, mag: def.magSize, reserve: def.reserve }, null]
    this.index = 0
    this.refreshHud()
  }

  update(
    dt: number,
    input: { pressed(c: string): boolean; mouseDown(b: number): boolean; mousePressed(b: number): boolean },
  ): void {
    this.cooldown = Math.max(0, this.cooldown - dt)

    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) this.finishReload()
    }

    if (input.pressed('Digit1')) this.switchTo(0)
    if (input.pressed('Digit2')) this.switchTo(1)
    if (input.pressed('KeyR')) this.startReload()

    const slot = this.current
    // 倍镜只在拿着带镜的枪、并且真的按住右键时出现
    this.deps.hud.setScope(this.deps.player.aiming && !!slot && !!slot.def.scoped)

    if (!slot) {
      this.deps.hud.setSpread(6)
      return
    }

    const wantFire = slot.def.auto ? input.mouseDown(0) : input.mousePressed(0)
    if (wantFire && this.deps.player.alive && !this.reloading && this.cooldown <= 0) {
      this.fire()
    }

    this.deps.hud.setSpread(this.spreadDeg)
  }

  switchTo(i: number): void {
    if (i === this.index || i < 0 || i >= this.slots.length) return
    if (!this.slots[i]) return
    this.index = i
    this.reloading = false
    this.reloadTimer = 0
    this.cooldown = 0.25
    audio.switchWeapon()
    this.refreshHud()
  }

  /** 拾取武器。返回给玩家的提示文案 */
  equip(def: WeaponDef): string {
    const owned = this.slots.findIndex((s) => s && s.def.id === def.id)
    if (owned >= 0) {
      this.slots[owned]!.reserve += def.reserve
      this.index = owned
      this.reloading = false
      this.refreshHud()
      return `备弹 +${def.reserve}（${def.name}）`
    }

    const empty = this.slots.findIndex((s) => s === null)
    if (empty >= 0) {
      this.slots[empty] = { def, mag: def.magSize, reserve: def.reserve }
      this.index = empty
      this.reloading = false
      this.refreshHud()
      return `拾取 ${def.name}`
    }

    const old = this.slots[this.index]!
    this.slots[this.index] = { def, mag: def.magSize, reserve: def.reserve }
    this.reloading = false
    this.reloadTimer = 0
    this.refreshHud()
    this.onDrop?.(old.def)
    return `换上 ${def.name}（丢掉 ${old.def.name}）`
  }

  /** 拾取弹药，没有对应口径的枪就捡不起来 */
  addAmmo(caliber: Caliber, amount: number): boolean {
    let matched = false
    for (const s of this.slots) {
      if (s && s.def.caliber === caliber) {
        s.reserve += amount
        matched = true
      }
    }
    if (matched) this.refreshHud()
    return matched
  }

  hasCaliber(caliber: Caliber): boolean {
    return this.slots.some((s) => s && s.def.caliber === caliber)
  }

  private startReload(): void {
    const slot = this.current
    if (!slot || this.reloading) return
    if (slot.mag >= slot.def.magSize) return
    if (slot.reserve <= 0) return
    this.reloading = true
    this.reloadTimer = slot.def.reloadTime
    this.deps.hud.setReloading(true)
    audio.reloadStart()
  }

  private finishReload(): void {
    const slot = this.current
    if (!slot) {
      this.reloading = false
      this.reloadTimer = 0
      return
    }
    const need = slot.def.magSize - slot.mag
    const take = Math.min(need, slot.reserve)
    slot.mag += take
    slot.reserve -= take
    this.reloading = false
    this.reloadTimer = 0
    this.deps.hud.setReloading(false)
    audio.reloadEnd()
    this.refreshHud()
  }

  private refreshHud(): void {
    const slot = this.current
    if (slot) {
      this.deps.hud.setWeapon(slot.def.id, slot.def.name)
      this.deps.hud.setAmmo(slot.mag, slot.reserve)
      this.deps.player.setWeapon(slot.def.id)
      this.deps.rig.setAds(slot.def.adsFov ?? 52, !!slot.def.scoped)
    } else {
      this.deps.hud.setWeapon(null, '徒手')
      this.deps.hud.setAmmo(-1, -1)
    }
  }

  private fire(): void {
    const { camera, rig, player, effects, hud, solids, targets } = this.deps
    const slot = this.current
    if (!slot) return
    const def = slot.def

    // 空仓：打不出去，自动换弹（没备弹就没反应）
    if (slot.mag <= 0) {
      audio.empty()
      this.startReload()
      this.cooldown = 0.3
      return
    }

    slot.mag--
    this.shots++
    this.cooldown = def.interval

    // 打完最后一发自动换弹
    if (slot.mag <= 0) this.startReload()

    player.getMuzzleWorld(this.muzzle)

    const camDir = camera.getWorldDirection(this.dirVec)
    this.rightVec.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
    this.upVec.setFromMatrixColumn(camera.matrixWorld, 1).normalize()

    const origin = camera.position
    let hitAny = false
    let hitHead = false

    for (let p = 0; p < def.pellets; p++) {
      const dir = camDir.clone()
      const spreadRad = THREE.MathUtils.degToRad(this.spreadDeg)
      if (spreadRad > 0.0001) {
        const a = Math.random() * Math.PI * 2
        const r = Math.tan(spreadRad) * Math.sqrt(Math.random())
        dir.addScaledVector(this.rightVec, Math.cos(a) * r)
        dir.addScaledVector(this.upVec, Math.sin(a) * r)
        dir.normalize()
      }

      this.raycaster.set(origin, dir)
      this.raycaster.far = 260

      const objects: THREE.Object3D[] = [solids, ...targets.map((t) => t.group)]
      const hits = this.raycaster.intersectObjects(objects, true)

      this.endPoint.copy(origin).addScaledVector(dir, 200)

      for (const h of hits) {
        let node: THREE.Object3D | null = h.object
        let target: Target | null = null
        while (node) {
          const ent = node.userData.entity as Target | undefined
          if (ent) {
            target = ent
            break
          }
          node = node.parent
        }

        if (target) {
          if (!target.alive) continue
          const isHead = h.object.userData.zone === 'head'
          const dmg = def.damage * (isHead ? def.headMult : 1)
          target.takeDamage(dmg, isHead, player)
          hitAny = true
          hitHead = hitHead || isHead
          this.endPoint.copy(h.point)
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : undefined
          effects.impact(h.point, n)
          hud.hitMarker(isHead)
          break
        }

        this.endPoint.copy(h.point)
        const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : undefined
        effects.impact(h.point, n)
        audio.impact(h.point)
        break
      }

      effects.tracer(this.muzzle, this.endPoint)
    }

    audio.shot(def.id === 'sg' ? 'shotgun' : 'rifle', this.muzzle, true)
    if (hitAny) {
      this.hits++
      audio.hit(hitHead)
    }

    effects.muzzleFlash(this.muzzle)
    rig.addRecoil(def.recoil)

    this.refreshHud()
    if (slot.mag <= 0) this.startReload()
  }

  /** 重开一局 */
  reset(): void {
    this.reloading = false
    this.reloadTimer = 0
    this.cooldown = 0
    this.shots = 0
    this.hits = 0
    this.deps.hud.setReloading(false)
    this.giveStarter()
  }

  get accuracy(): number {
    if (this.shots === 0) return 0
    return this.hits / this.shots
  }
}
