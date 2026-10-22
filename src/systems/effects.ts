import * as THREE from 'three'

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  life: number
  max: number
}

interface Pop {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  life: number
  max: number
  grow: number
}

/** 弹道拖线、命中火花、枪口闪光，全部对象池化，避免频繁创建。 */
export class Effects {
  private tracerPool: Tracer[] = []
  private tracerIdx = 0
  private pops: Pop[] = []
  private popIdx = 0

  constructor(scene: THREE.Scene, tracerCount = 20, popCount = 24) {
    for (let i = 0; i < tracerCount; i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const mat = new THREE.LineBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      const line = new THREE.Line(geo, mat)
      line.frustumCulled = false
      line.visible = false
      scene.add(line)
      this.tracerPool.push({ line, life: 0, max: 0.07 })
    }

    for (let i = 0; i < popCount; i++) {
      const geo = new THREE.SphereGeometry(0.07, 6, 5)
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb066,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      scene.add(mesh)
      this.pops.push({ mesh, life: 0, max: 0.12, grow: 1 })
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffd9a0): void {
    const t = this.tracerPool[this.tracerIdx++ % this.tracerPool.length]
    const attr = t.line.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, from.x, from.y, from.z)
    attr.setXYZ(1, to.x, to.y, to.z)
    attr.needsUpdate = true
    t.line.material.color.setHex(color)
    t.line.material.opacity = 0.9
    t.line.visible = true
    t.life = t.max
  }

  /** 命中处的小火花 */
  impact(point: THREE.Vector3, normal?: THREE.Vector3): void {
    this.spawnPop(point, 0xffffff, 0.9, 0.1)
    if (normal) {
      this.spawnPop(point.clone().addScaledVector(normal, 0.05), 0xffc98a, 0.6, 0.09)
    }
  }

  muzzleFlash(point: THREE.Vector3): void {
    this.spawnPop(point, 0xffd08a, 1.6, 0.05)
  }

  private spawnPop(point: THREE.Vector3, color: number, size: number, life: number): void {
    const p = this.pops[this.popIdx++ % this.pops.length]
    p.mesh.position.copy(point)
    p.mesh.material.color.setHex(color)
    p.mesh.material.opacity = 1
    p.mesh.scale.setScalar(size)
    p.mesh.visible = true
    p.life = life
    p.max = life
    p.grow = size * 2.4
  }

  update(dt: number): void {
    for (const t of this.tracerPool) {
      if (t.life > 0) {
        t.life -= dt
        if (t.life <= 0) {
          t.life = 0
          t.line.visible = false
        } else {
          t.line.material.opacity = 0.9 * (t.life / t.max)
        }
      }
    }

    for (const p of this.pops) {
      if (p.life > 0) {
        p.life -= dt
        if (p.life <= 0) {
          p.life = 0
          p.mesh.visible = false
        } else {
          const k = 1 - p.life / p.max
          p.mesh.material.opacity = 1 - k
          p.mesh.scale.setScalar(p.grow * (0.5 + k))
        }
      }
    }
  }
}
