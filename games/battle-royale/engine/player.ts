import * as THREE from 'three'
import { CollisionWorld } from '../../../src/core/collision'
import { Input } from '../../../src/core/input'
import { audio } from '../../../src/systems/audio'
import { buildWeaponModel } from './weaponModel'

export const PLAYER_RADIUS = 0.38
export const PLAYER_HEIGHT = 1.8
const STEP_HEIGHT = 0.55
const GRAVITY = 24
const WALK_SPEED = 4.5
const SPRINT_SPEED = 6.9
const ADS_SPEED = 2.6
const JUMP_SPEED = 7.2

export class Player {
  name = '你'
  pos = new THREE.Vector3(0, 0, 20)
  vel = new THREE.Vector3()
  hp = 100
  maxHp = 100
  /** 护甲值：先扛 60% 伤害，扛完为止 */
  armor = 0
  maxArmor = 100
  alive = true
  onGround = true

  /** 视觉朝向（平滑跟随相机） */
  yaw = Math.PI
  group = new THREE.Group()
  muzzle = new THREE.Object3D()

  aiming = false
  sprinting = false

  private legL!: THREE.Group
  private legR!: THREE.Group
  private armL!: THREE.Group
  private armR!: THREE.Group
  private torso!: THREE.Group
  private weaponMount!: THREE.Group
  private weaponId = ''
  private animPhase = 0
  private stepAccum = 0
  private visualY = 0
  private landDip = 0
  private deadTilt = 0
  private coyote = 0
  private jumpBuffer = 0

  constructor(scene: THREE.Scene) {
    this.buildMesh()
    scene.add(this.group)
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.yaw
  }

  private buildMesh(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd7ac86, roughness: 0.9 })
    const armor = new THREE.MeshStandardMaterial({ color: 0x2f4a63, roughness: 0.75 })
    const cloth = new THREE.MeshStandardMaterial({ color: 0x26303a, roughness: 0.95 })
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.55, metalness: 0.35 })

    const box = (w: number, h: number, d: number, m: THREE.Material) =>
      new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)

    this.torso = new THREE.Group()
    this.torso.position.y = 1.12
    this.group.add(this.torso)

    const chest = box(0.6, 0.68, 0.36, armor)
    chest.castShadow = true
    this.torso.add(chest)

    const hips = box(0.56, 0.26, 0.34, cloth)
    hips.position.y = -0.44
    hips.castShadow = true
    this.torso.add(hips)

    const pack = box(0.42, 0.46, 0.2, new THREE.MeshStandardMaterial({ color: 0x5c5b46, roughness: 0.95 }))
    pack.position.set(0, 0.04, 0.28)
    this.torso.add(pack)

    const neck = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), skin)
    neck.position.set(0, 0.5, -0.01)
    neck.castShadow = true
    this.torso.add(neck)

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), armor)
    helmet.position.set(0, 0.53, -0.01)
    this.torso.add(helmet)

    // 腿：绕髋部摆动的枢轴
    const legGeo = new THREE.BoxGeometry(0.17, 0.82, 0.19)
    this.legL = new THREE.Group()
    this.legL.position.set(-0.15, 0.86, 0)
    const legLMesh = new THREE.Mesh(legGeo, cloth)
    legLMesh.position.y = -0.41
    legLMesh.castShadow = true
    this.legL.add(legLMesh)
    this.group.add(this.legL)

    this.legR = new THREE.Group()
    this.legR.position.set(0.15, 0.86, 0)
    const legRMesh = new THREE.Mesh(legGeo, cloth)
    legRMesh.position.y = -0.41
    legRMesh.castShadow = true
    this.legR.add(legRMesh)
    this.group.add(this.legR)

    // 手臂
    const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.14)
    this.armL = new THREE.Group()
    this.armL.position.set(-0.36, 1.42, 0)
    const armLMesh = new THREE.Mesh(armGeo, armor)
    armLMesh.position.y = -0.22
    armLMesh.castShadow = true
    this.armL.add(armLMesh)
    this.group.add(this.armL)

    this.armR = new THREE.Group()
    this.armR.position.set(0.36, 1.42, 0)
    const armRMesh = new THREE.Mesh(armGeo, armor)
    armRMesh.position.y = -0.22
    armRMesh.castShadow = true
    this.armR.add(armRMesh)
    this.group.add(this.armR)

    // 举枪姿势
    this.armL.rotation.x = -1.35
    this.armL.rotation.z = 0.35
    this.armR.rotation.x = -1.5

    // 枪：由 weaponModel 按枪型生成，挂在躯干上
    this.weaponMount = new THREE.Group()
    this.weaponMount.position.set(0.33, 0.26, -0.5)
    this.weaponMount.rotation.y = 0.06
    this.torso.add(this.weaponMount)
    this.setWeapon('ar')
    this.armR.rotation.x = -1.5
  }

  get eyeY(): number {
    return this.pos.y + 1.5
  }

  update(dt: number, input: Input, camYaw: number, world: CollisionWorld): void {
    if (!this.alive) {
      this.updateDeath(dt)
      return
    }

    this.aiming = input.mouseDown(2)
    this.sprinting = input.down('ShiftLeft') && !this.aiming

    // 以相机朝向为基准的移动方向
    const fx = -Math.sin(camYaw)
    const fz = -Math.cos(camYaw)
    const rx = Math.cos(camYaw)
    const rz = -Math.sin(camYaw)

    let ix = 0
    let iz = 0
    if (input.down('KeyW')) {
      ix += fx
      iz += fz
    }
    if (input.down('KeyS')) {
      ix -= fx
      iz -= fz
    }
    if (input.down('KeyD')) {
      ix += rx
      iz += rz
    }
    if (input.down('KeyA')) {
      ix -= rx
      iz -= rz
    }
    const len = Math.hypot(ix, iz)
    if (len > 0.0001) {
      ix /= len
      iz /= len
    }

    const maxSpeed = this.aiming ? ADS_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED
    const accel = this.onGround ? 15 : 4.5
    const k = 1 - Math.exp(-accel * dt)
    this.vel.x += (ix * maxSpeed - this.vel.x) * k
    this.vel.z += (iz * maxSpeed - this.vel.z) * k

    // 跳跃：土狼时间 + 输入缓存
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt)
    this.jumpBuffer = input.pressed('Space') ? 0.15 : Math.max(0, this.jumpBuffer - dt)
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_SPEED
      this.onGround = false
      this.jumpBuffer = 0
      this.coyote = 0
    }

    // 水平移动 + 碰撞推出
    const beforeX = this.pos.x
    const beforeZ = this.pos.z
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    world.resolveHorizontal(this.pos, PLAYER_RADIUS, PLAYER_HEIGHT, STEP_HEIGHT)

    if (Math.abs(this.pos.x - beforeX - this.vel.x * dt) > 1e-4) this.vel.x = 0
    if (Math.abs(this.pos.z - beforeZ - this.vel.z * dt) > 1e-4) this.vel.z = 0

    // 垂直
    const prevFeet = this.pos.y
    this.vel.y -= GRAVITY * dt
    this.pos.y += this.vel.y * dt

    const support = world.supportHeight(this.pos.x, this.pos.z, prevFeet, STEP_HEIGHT)
    const wasFalling = this.vel.y < -6
    if (this.pos.y <= support) {
      if (!this.onGround && wasFalling && this.landDip <= 0) this.landDip = 0.12
      this.pos.y = support
      this.vel.y = 0
      this.onGround = true
    } else {
      this.onGround = false
    }

    // 视觉朝向平滑跟随相机
    let dy = camYaw - this.yaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    this.yaw += dy * Math.min(1, dt * 14)

    this.animate(dt)
  }

  private animate(dt: number): void {
    const speed = Math.hypot(this.vel.x, this.vel.z)
    const norm = Math.min(speed / WALK_SPEED, 1.6)

    // 脚步声：按走过的距离触发，跑得越快越密
    if (this.onGround && speed > 1.2) {
      this.stepAccum += speed * dt
      const stride = this.sprinting ? 2.75 : 2.05
      if (this.stepAccum >= stride) {
        this.stepAccum = 0
        audio.step(this.sprinting)
      }
    } else {
      this.stepAccum = Math.min(this.stepAccum, 1.4)
    }

    this.animPhase += dt * (2.2 + speed * 1.1)
    const swing = Math.sin(this.animPhase) * 0.62 * Math.min(norm, 1)

    if (this.onGround) {
      this.legL.rotation.x = swing
      this.legR.rotation.x = -swing
    } else {
      const tuck = Math.min(0.55, 0.25 + Math.abs(this.vel.y) * 0.02)
      this.legL.rotation.x = -tuck
      this.legR.rotation.x = tuck * 0.5
    }

    // 躯干随步伐轻晃
    this.torso.position.y = 1.12 + Math.abs(Math.sin(this.animPhase)) * 0.02 * Math.min(norm, 1)
    this.torso.rotation.z = Math.sin(this.animPhase) * 0.03 * Math.min(norm, 1)

    // 举枪：瞄准时手臂更平
    const targetArm = this.aiming ? -1.62 : -1.5
    this.armR.rotation.x += (targetArm - this.armR.rotation.x) * Math.min(1, dt * 12)
    this.armL.rotation.x = this.armR.rotation.x + 0.15

    // 落地缓冲
    if (this.landDip > 0) {
      this.landDip = Math.max(0, this.landDip - dt * 0.8)
    }

    // 台阶的瞬时高度差做一点平滑，避免视觉上"跳"
    const dy = this.pos.y - this.visualY
    if (Math.abs(dy) > 0.9) this.visualY = this.pos.y
    else this.visualY += dy * Math.min(1, dt * 22)

    const dip = this.landDip > 0 ? -Math.sin((this.landDip / 0.12) * Math.PI) * 0.08 : 0

    this.group.position.set(this.pos.x, this.visualY + dip, this.pos.z)
    this.group.rotation.y = this.yaw
  }

  private updateDeath(dt: number): void {
    this.deadTilt = Math.min(Math.PI * 0.5, this.deadTilt + dt * 3.2)
    this.group.rotation.x = -this.deadTilt
    this.group.position.y = Math.max(0, this.pos.y - this.deadTilt * 0.15)
  }

  /** 护甲先扛 60% 伤害；毒圈伤害直接进血（ignoreArmor） */
  takeDamage(amount: number, ignoreArmor = false): boolean {
    if (!this.alive) return false
    let hpDamage = amount
    if (!ignoreArmor && this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.6)
      this.armor -= absorbed
      hpDamage = amount - absorbed
    }
    this.hp = Math.max(0, this.hp - hpDamage)
    if (this.hp <= 0) {
      this.alive = false
      this.deadTilt = 0
      return true
    }
    return false
  }

  reset(pos: THREE.Vector3, yaw: number): void {
    this.pos.copy(pos)
    this.vel.set(0, 0, 0)
    this.hp = this.maxHp
    this.armor = 0
    this.alive = true
    this.onGround = true
    this.deadTilt = 0
    this.visualY = pos.y
    this.yaw = yaw
    this.group.rotation.set(0, yaw, 0)
    this.group.position.copy(pos)
  }

  getMuzzleWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.muzzle.getWorldPosition(target)
  }

  /** 换枪时换模型 */
  setWeapon(id: string): void {
    if (this.weaponId === id) return
    this.weaponId = id
    this.weaponMount.clear()
    const model = buildWeaponModel(id)
    this.weaponMount.add(model.group)
    this.muzzle = model.muzzle
  }
}
