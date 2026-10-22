import * as THREE from 'three'

export interface Hill {
  x: number
  z: number
  /** 影响半径 */
  r: number
  /** 高度（负数就是洼地） */
  h: number
}

/** 河谷：把一条轴线上的地形插值压到固定河床高度 */
export interface River {
  axis: 'x' | 'z'
  pos: number
  width: number
  bedY: number
}

/** 桥头整平：把一片矩形区域压平到指定高度，方便上下桥 */
export interface Pad {
  x: number
  z: number
  w: number
  d: number
  y: number
  feather: number
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** 由若干高斯山丘 + 河谷 + 整平区叠出来的平滑地形 */
export class Terrain {
  readonly hills: Hill[]
  readonly river: River | null
  readonly pads: Pad[]
  readonly size: number

  constructor(size: number, hills: Hill[], river: River | null = null, pads: Pad[] = []) {
    this.size = size
    this.hills = hills
    this.river = river
    this.pads = pads
  }

  heightAt(x: number, z: number): number {
    let h = 0
    for (let i = 0; i < this.hills.length; i++) {
      const hill = this.hills[i]
      const dx = x - hill.x
      const dz = z - hill.z
      h += hill.h * Math.exp(-(dx * dx + dz * dz) / (2 * hill.r * hill.r))
    }

    if (this.river) {
      const d = this.river.axis === 'x' ? z - this.river.pos : x - this.river.pos
      const w = Math.exp(-(d * d) / (2 * this.river.width * this.river.width))
      h = h * (1 - w) + this.river.bedY * w
    }

    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i]
      const dx = Math.max(0, Math.abs(x - p.x) - p.w / 2)
      const dz = Math.max(0, Math.abs(z - p.z) - p.d / 2)
      const dist = Math.hypot(dx, dz)
      if (dist < p.feather) {
        h += (p.y - h) * smooth(1 - dist / p.feather)
      }
    }

    return h
  }

  /** 生成带顶点色的地面网格 */
  buildMesh(colorAt: (x: number, z: number, h: number) => THREE.Color, segments = 110): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(this.size, this.size, segments, segments)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const c = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = this.heightAt(x, z)
      pos.setY(i, h)
      c.copy(colorAt(x, z, h)).convertSRGBToLinear()
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }

    pos.needsUpdate = true
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    return mesh
  }
}

/** 水面：一片半透明的蓝，湖底靠地形下凹 */
export function buildWater(size: number, level: number, center: THREE.Vector3, radius: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 48)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f6f8f,
    transparent: true,
    opacity: 0.78,
    roughness: 0.15,
    metalness: 0.35,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(center.x, level, center.z)
  mesh.renderOrder = 1
  void size
  return mesh
}
