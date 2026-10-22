import * as THREE from 'three'
import type { CollisionWorld } from '../../../src/core/collision'
import type { Player } from './player'
import { WEAPONS, type Caliber, type ShootingSystem, type WeaponDef } from './shooting'
import { audio } from '../../../src/systems/audio'
import { buildWeaponModel, buildAmmoBox } from './weaponModel'

export type LootKind = 'weapon' | 'ammo' | 'armor'

export interface LootItem {
  kind: LootKind
  weapon?: WeaponDef
  caliber?: Caliber
  amount?: number
  label: string
  pos: THREE.Vector3
  group: THREE.Group
  prop: THREE.Group
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  alive: boolean
  spin: number
  baseY: number
}

const PICK_RADIUS = 2.6
const VIEW_DIST = 70

const COLORS = {
  ammoRifle: 0xb8a45a,
  ammoShell: 0xc07a3a,
  armor: 0x4a9fe0,
}

/** 地面掉落物：会浮起来转的箱子 + 一圈发光底环，靠近按 F 捡 */
export class LootSystem {
  items: LootItem[] = []
  nearest: LootItem | null = null

  private boxGeo = new THREE.BoxGeometry(1, 1, 1)
  private propMat = new THREE.MeshStandardMaterial({ color: 0x4a9fe0, roughness: 0.6, metalness: 0.2 })
  private ringGeo = new THREE.RingGeometry(0.42, 0.58, 20)
  private scene: THREE.Scene
  private collision: CollisionWorld
  private tmp = new THREE.Vector3()

  constructor(scene: THREE.Scene, collision: CollisionWorld, count = 80) {
    this.scene = scene
    this.collision = collision
    this.reset(count)
  }

  private pickWeapon(): WeaponDef {
    const r = Math.random()
    if (r < 0.4) return WEAPONS.find((w) => w.id === 'ar')!
    if (r < 0.68) return WEAPONS.find((w) => w.id === 'sg')!
    if (r < 0.88) return WEAPONS.find((w) => w.id === 'dmr')!
    return WEAPONS.find((w) => w.id === 'awm')!
  }

  /** 沿建筑外墙和空地撒点，避开墙体和出生点 */
  private makeSpawns(count: number): THREE.Vector3[] {
    const anchors = this.collision.boxes.filter(
      (b) => b.maxY > 3 && b.maxX - b.minX > 5 && b.maxZ - b.minZ > 5,
    )
    const out: THREE.Vector3[] = []

    for (let i = 0; i < count; i++) {
      let placed = false
      for (let attempt = 0; attempt < 40 && !placed; attempt++) {
        let x: number
        let z: number
        if (anchors.length > 0 && Math.random() < 0.7) {
          const b = anchors[Math.floor(Math.random() * anchors.length)]
          const side = Math.floor(Math.random() * 4)
          const gap = 1.6 + Math.random() * 4.5
          if (side === 0) {
            x = b.minX + Math.random() * (b.maxX - b.minX)
            z = b.minZ - gap
          } else if (side === 1) {
            x = b.minX + Math.random() * (b.maxX - b.minX)
            z = b.maxZ + gap
          } else if (side === 2) {
            x = b.minX - gap
            z = b.minZ + Math.random() * (b.maxZ - b.minZ)
          } else {
            x = b.maxX + gap
            z = b.minZ + Math.random() * (b.maxZ - b.minZ)
          }
        } else {
          x = (Math.random() - 0.5) * 140
          z = (Math.random() - 0.5) * 140
        }

        if (Math.abs(x) > 76 || Math.abs(z) > 76) continue
        if (this.collision.isBlocked(x, z, 0.75)) continue
        // 别刷在玩家出生点脚下
        if (Math.hypot(x, z - 20) < 6) continue
        out.push(new THREE.Vector3(x, this.groundY(x, z), z))
        placed = true
      }
    }
    return out
  }

  private groundY(x: number, z: number): number {
    return this.collision.supportHeight(x, z, 3, 0.1)
  }

  private spawn(
    kind: LootKind,
    pos: THREE.Vector3,
    weapon?: WeaponDef,
    caliber?: Caliber,
    amount?: number,
  ): void {
    // 复用已经捡走的节点
    const recycled = this.items.find((it) => !it.alive && it.kind === kind)
    let item = recycled

    if (!item) {
      const group = new THREE.Group()
      const prop = new THREE.Group()
      prop.position.y = 0.45
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Mesh(this.ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.02
      group.add(prop, ring)
      this.scene.add(group)

      item = {
        kind,
        label: '',
        pos: new THREE.Vector3(),
        group,
        prop,
        ring,
        alive: true,
        spin: Math.random() * Math.PI * 2,
        baseY: 0.45,
      }
      this.items.push(item)
    }

    item.kind = kind
    item.alive = true
    item.pos.copy(pos)
    item.spin = Math.random() * Math.PI * 2
    item.group.visible = true
    item.group.position.copy(pos)

    item.prop.clear()

    if (kind === 'weapon' && weapon) {
      item.weapon = weapon
      item.label = `拾取 ${weapon.name}`
      const m = buildWeaponModel(weapon.id, true)
      m.group.rotation.y = Math.PI / 2
      m.group.position.y = 0.06
      item.prop.add(m.group)
      item.baseY = 0.42
      item.ring.material.color.setHex(weapon.color)
    } else if (kind === 'ammo') {
      item.caliber = caliber
      item.amount = amount ?? 30
      item.label = `拾取 ${caliber === 'shell' ? '霰弹' : '步枪弹'} ×${item.amount}`
      item.prop.add(buildAmmoBox(caliber === 'shell'))
      item.baseY = 0.26
      const c = caliber === 'shell' ? COLORS.ammoShell : COLORS.ammoRifle
      item.ring.material.color.setHex(c)
    } else {
      item.label = '拾取 护甲 +50'
      const vest = new THREE.Mesh(this.boxGeo, this.propMat)
      vest.scale.set(0.34, 0.42, 0.12)
      vest.castShadow = true
      item.prop.add(vest)
      item.baseY = 0.5
      this.propMat.color.setHex(COLORS.armor)
      item.ring.material.color.setHex(COLORS.armor)
    }
  }

  /** 有人被打死时掉点东西 */
  dropFrom(pos: THREE.Vector3): void {
    if (this.items.filter((i) => i.alive).length > 110) return
    const p = pos.clone()
    p.y = this.groundY(p.x, p.z)
    const rifle = Math.random() < 0.65
    this.spawn('ammo', p.clone(), undefined, rifle ? 'rifle' : 'shell', rifle ? 20 : 6)
    const w = this.pickWeapon()
    const p2 = p.clone()
    p2.x += 0.8
    p2.z += 0.6
    if (!this.collision.isBlocked(p2.x, p2.z, 0.6)) this.spawn('weapon', p2, w)
  }

  /** 换枪时把旧枪丢回地上 */
  dropWeapon(pos: THREE.Vector3, def: WeaponDef): void {
    const p = pos.clone()
    p.y = this.groundY(p.x, p.z)
    p.x += 0.6
    if (this.collision.isBlocked(p.x, p.z, 0.6)) p.copy(pos)
    this.spawn('weapon', p, def)
  }

  /** 人机找枪 */
  findWeapon(pos: THREE.Vector3, maxDist: number): { pos: THREE.Vector3; id: string } | null {
    let best: LootItem | null = null
    let bestD = maxDist * maxDist
    for (const it of this.items) {
      if (!it.alive || it.kind !== 'weapon' || !it.weapon) continue
      const d = it.pos.distanceToSquared(pos)
      if (d < bestD) {
        bestD = d
        best = it
      }
    }
    return best ? { pos: best.pos.clone(), id: best.weapon!.id } : null
  }

  /** 人机走到枪旁边，把地上的枪拿走 */
  claimWeaponAt(pos: THREE.Vector3, radius: number): string | null {
    const r2 = radius * radius
    for (const it of this.items) {
      if (!it.alive || it.kind !== 'weapon' || !it.weapon) continue
      if (it.pos.distanceToSquared(pos) > r2) continue
      it.alive = false
      it.group.visible = false
      this.nearest = this.nearest === it ? null : this.nearest
      return it.weapon.id
    }
    return null
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    let best: LootItem | null = null
    let bestD = PICK_RADIUS * PICK_RADIUS

    for (const it of this.items) {
      if (!it.alive) continue

      const d2 = it.pos.distanceToSquared(playerPos)
      if (d2 > VIEW_DIST * VIEW_DIST) {
        if (it.group.visible) it.group.visible = false
        continue
      }
      it.group.visible = true

      it.spin += dt * 1.4
      it.prop.rotation.y = it.spin
      it.prop.position.y = it.baseY + Math.sin(performance.now() * 0.0028 + it.spin) * 0.06

      if (d2 < bestD) {
        bestD = d2
        best = it
      }
    }

    this.nearest = best
  }

  /** 返回提示文案；捡不了返回 null */
  tryPickup(shooting: ShootingSystem, player: Player): string | null {
    const it = this.nearest
    if (!it || !it.alive) return null

    if (it.kind === 'weapon' && it.weapon) {
      const msg = shooting.equip(it.weapon)
      it.alive = false
      it.group.visible = false
      audio.pickup(true)
      return msg
    }

    if (it.kind === 'ammo' && it.caliber) {
      if (!shooting.addAmmo(it.caliber, it.amount ?? 30)) return null
      it.alive = false
      it.group.visible = false
      audio.pickup(false)
      return `拾取 ${it.caliber === 'shell' ? '霰弹' : '步枪弹'} ×${it.amount}`
    }

    if (it.kind === 'armor') {
      player.armor = Math.min(player.maxArmor, player.armor + 50)
      it.alive = false
      it.group.visible = false
      audio.pickup(true)
      return '装备护甲 +50'
    }

    void player
    return null
  }

  reset(count = 80): void {
    for (const it of this.items) {
      it.alive = false
      it.group.visible = false
    }
    const spawns = this.makeSpawns(count)
    for (const p of spawns) {
      const roll = Math.random()
      if (roll < 0.45) {
        const caliber: Caliber = Math.random() < 0.62 ? 'rifle' : 'shell'
        this.spawn('ammo', p, undefined, caliber, caliber === 'rifle' ? 30 : 8)
      } else if (roll < 0.8) {
        this.spawn('weapon', p, this.pickWeapon())
      } else {
        this.spawn('armor', p)
      }
    }
    this.nearest = null
  }
}
