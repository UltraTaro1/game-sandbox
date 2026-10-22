import * as THREE from 'three'

export interface ZonePhase {
  radius: number
  wait: number
  shrink: number
  dps: number
}

export const PHASES: ZonePhase[] = [
  { radius: 120, wait: 65, shrink: 0, dps: 0 },
  { radius: 85, wait: 40, shrink: 36, dps: 1 },
  { radius: 58, wait: 32, shrink: 28, dps: 2 },
  { radius: 36, wait: 26, shrink: 24, dps: 4 },
  { radius: 20, wait: 22, shrink: 20, dps: 7 },
  { radius: 7, wait: 18, shrink: 20, dps: 11 },
]

const WALL_HEIGHT = 30
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

export class Zone {
  center = new THREE.Vector3(0, 0, 0)
  radius = 120
  phase = 0
  state: 'wait' | 'shrink' | 'done' = 'wait'
  timer = 30
  nextCenter = new THREE.Vector3(0, 0, 0)
  nextRadius = 85
  dps = 0

  private phases: ZonePhase[]
  private half: number
  private fromCenter = new THREE.Vector3()
  private fromRadius = 120
  private shrinkT = 0
  private shrinkDur = 1
  private wall: THREE.Mesh
  private ring: THREE.Mesh
  private ground: THREE.Mesh

  constructor(scene: THREE.Scene, scale = 1, bounds = 82) {
    this.half = bounds
    this.phases = PHASES.map((p) => ({ ...p, radius: p.radius * scale }))
    this.radius = this.phases[0].radius
    this.timer = this.phases[0].wait
    this.nextRadius = this.phases[1] ? this.phases[1].radius : this.phases[0].radius
    this.fromRadius = this.radius

    this.wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 72, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7fd4ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    this.wall.scale.set(this.radius, WALL_HEIGHT, this.radius)
    this.wall.position.set(0, WALL_HEIGHT / 2, 0)
    this.wall.frustumCulled = false
    scene.add(this.wall)

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1, 72),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.07
    scene.add(this.ring)

    this.ground = new THREE.Mesh(
      new THREE.RingGeometry(0.995, 1, 72),
      new THREE.MeshBasicMaterial({
        color: 0x7fd4ff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = 0.06
    scene.add(this.ground)

    this.pickNext()
    this.syncVisuals()
  }

  isOutside(pos: THREE.Vector3): boolean {
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.z) > this.radius
  }

  get dpsNow(): number {
    return this.dps
  }

  distToCenter(pos: THREE.Vector3): number {
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.z)
  }

  update(dt: number): void {
    if (this.state === 'done') {
      this.syncVisuals()
      return
    }

    if (this.state === 'wait') {
      this.timer -= dt
      if (this.timer <= 0) {
        if (this.phase + 1 >= this.phases.length) {
          this.state = 'done'
          this.timer = 0
        } else {
          this.startShrink()
        }
      }
    } else {
      this.shrinkT += dt / this.shrinkDur
      const t = Math.min(1, this.shrinkT)
      const e = t * t * (3 - 2 * t)
      this.radius = this.fromRadius + (this.nextRadius - this.fromRadius) * e
      this.center.lerpVectors(this.fromCenter, this.nextCenter, e)

      if (t >= 1) {
        this.phase++
        this.radius = this.nextRadius
        this.center.copy(this.nextCenter)
        if (this.phase + 1 < this.phases.length) {
          this.state = 'wait'
          this.timer = this.phases[this.phase].wait
          this.dps = this.phases[this.phase].dps
          this.pickNext()
        } else {
          this.state = 'done'
          this.timer = 0
          this.dps = this.phases[this.phase].dps
        }
      }
    }

    this.syncVisuals()
  }

  private startShrink(): void {
    const target = this.phases[this.phase + 1]
    this.state = 'shrink'
    this.fromCenter.copy(this.center)
    this.fromRadius = this.radius
    this.shrinkT = 0
    this.shrinkDur = Math.max(0.001, target.shrink)
    this.dps = target.dps
    this.nextRadius = target.radius
  }

  private pickNext(): void {
    const next = this.phases[Math.min(this.phase + 1, this.phases.length - 1)]
    this.nextRadius = next.radius
    const maxShift = Math.max(0, (this.radius - next.radius) * 0.65)
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * maxShift
    const lim = this.half * 0.82
    this.nextCenter.set(
      clamp(this.center.x + Math.cos(a) * r, -lim, lim),
      0,
      clamp(this.center.z + Math.sin(a) * r, -lim, lim),
    )
  }

  private syncVisuals(): void {
    const r = Math.max(0.5, this.radius)
    this.wall.scale.set(r, WALL_HEIGHT, r)
    this.wall.position.set(this.center.x, WALL_HEIGHT / 2, this.center.z)
    this.ground.scale.set(r, r, 1)
    this.ground.position.set(this.center.x, 0.06, this.center.z)

    this.ring.visible = this.state === 'wait'
    if (this.ring.visible) {
      const nr = Math.max(0.5, this.nextRadius)
      this.ring.scale.set(nr, nr, 1)
      this.ring.position.set(this.nextCenter.x, 0.07, this.nextCenter.z)
    }
  }

  statusText(): { label: string; time: string } {
    if (this.state === 'done') return { label: '最终安全区', time: '--' }
    if (this.state === 'shrink') {
      const left = Math.max(0, (1 - this.shrinkT) * this.shrinkDur)
      return { label: '安全区收缩中', time: `${Math.ceil(left)}s` }
    }
    return { label: '下次收缩', time: `${Math.ceil(this.timer)}s` }
  }

  reset(): void {
    this.center.set(0, 0, 0)
    this.radius = this.phases[0].radius
    this.phase = 0
    this.state = 'wait'
    this.timer = this.phases[0].wait
    this.dps = 0
    this.shrinkT = 0
    this.pickNext()
    this.syncVisuals()
  }
}
