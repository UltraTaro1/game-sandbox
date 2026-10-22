import * as THREE from 'three'

const SENSITIVITY = 0.0022
const BASE_FOV = 72
const ADS_FOV = 52
const SPRINT_FOV = 78
const BASE_DIST = 3.9
const ADS_DIST = 2.2
const BASE_SHOULDER = 0.82
const ADS_SHOULDER = 0.55

/** 第三人称越肩相机：鼠标控制朝向，墙体自动拉近，开火有后坐力回弹。 */
export class CameraRig {
  yaw = 0
  pitch = -0.06
  recoil = 0
  shake = 0
  /** 当前武器开镜时的 FOV（倍镜就是很小的值） */
  adsFov = ADS_FOV
  scoped = false

  /** 换枪时由射击系统调用 */
  setAds(fov: number, scoped: boolean): void {
    this.adsFov = fov
    this.scoped = scoped
  }

  private dist = BASE_DIST
  private right = new THREE.Vector3()
  private tmp = new THREE.Vector3()
  private ray = new THREE.Raycaster()

  constructor(
    private camera: THREE.PerspectiveCamera,
    private solids: THREE.Object3D,
  ) {
    this.camera.rotation.order = 'YXZ'
  }

  updateInput(dx: number, dy: number): void {
    this.yaw -= dx * SENSITIVITY
    this.pitch -= dy * SENSITIVITY
    this.pitch = Math.max(-1.1, Math.min(0.95, this.pitch))
  }

  addRecoil(amount: number): void {
    this.recoil = Math.min(0.22, this.recoil + amount)
    this.shake = Math.min(0.5, this.shake + 0.22)
  }

  /**
   * @param target 玩家脚底位置
   * @param aiming 是否开镜
   * @param sprinting 是否冲刺
   * @returns 相机与角色之间的距离（用于角色淡出）
   */
  follow(dt: number, target: THREE.Vector3, aiming: boolean, sprinting: boolean): number {
    const headX = target.x
    const headY = target.y + 1.62
    const headZ = target.z

    const cp = Math.cos(this.pitch)
    const sp = Math.sin(this.pitch)
    const fx = -Math.sin(this.yaw) * cp
    const fy = sp
    const fz = -Math.cos(this.yaw) * cp

    const scoped = aiming && this.scoped
    const shoulder = aiming ? (scoped ? 0.05 : ADS_SHOULDER) : BASE_SHOULDER
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    const wantDist = aiming ? (scoped ? 0.32 : ADS_DIST) : BASE_DIST

    // 先算理想机位（相机在角色身后）
    const ox = -fx * wantDist + this.right.x * shoulder
    const oy = -fy * wantDist
    const oz = -fz * wantDist + this.right.z * shoulder

    // 撞墙检测：从头部朝机位打一条射线
    const dir = this.tmp.set(ox, oy, oz)
    const len = dir.length()
    dir.divideScalar(len || 1)

    let desired = len
    this.ray.set(new THREE.Vector3(headX, headY, headZ), dir)
    this.ray.far = len + 0.3
    const hits = this.ray.intersectObject(this.solids, true)
    if (hits.length > 0) desired = Math.max(0.4, hits[0].distance - 0.22)

    // 撞墙时立刻拉近，离开时缓慢推远，避免抖动
    if (desired < this.dist) this.dist += (desired - this.dist) * Math.min(1, dt * 30)
    else this.dist += (desired - this.dist) * Math.min(1, dt * 6)

    let cx = headX + dir.x * this.dist
    let cy = headY + dir.y * this.dist
    let cz = headZ + dir.z * this.dist

    if (cy < 0.35) cy = 0.35

    // 后坐力衰减
    this.recoil *= Math.exp(-9 * dt)
    this.shake *= Math.exp(-7 * dt)

    if (this.shake > 0.002) {
      const s = this.shake
      cx += (Math.random() - 0.5) * s * 0.06
      cy += (Math.random() - 0.5) * s * 0.06
      cz += (Math.random() - 0.5) * s * 0.06
    }

    this.camera.position.set(cx, cy, cz)
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0)

    // FOV 过渡
    const targetFov = aiming ? this.adsFov : sprinting ? SPRINT_FOV : BASE_FOV
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 9)
    this.camera.updateProjectionMatrix()

    return this.dist
  }

  get forward(): THREE.Vector3 {
    return this.camera.getWorldDirection(new THREE.Vector3())
  }
}
