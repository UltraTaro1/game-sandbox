import * as THREE from 'three'
import type { CollisionWorld } from '../core/collision'

/**
 * 导航网格 + A*（按关卡尺寸动态建表）。
 *
 * 关卡全是轴对齐盒子 + 平滑地形，所以直接光栅化成 1m 格子：
 * - 高于 2.2m 的盒子算"实心"，并按人机半径外扩
 * - 低于 2.2m 的盒子记成"地面高度"（高台、台阶），相邻格子高差 ≤ 0.65 可通行
 * - 地形高度作为每格的初始值，斜坡天然可走
 */

const CELL = 1.0
const AGENT_RADIUS = 0.45
const MAX_CLIMB = 0.65
const MAX_SOLID = 2.2
const MAX_EXPAND = 9000

interface Neighbour {
  dx: number
  dz: number
  cost: number
}

const NEIGHBOURS: Neighbour[] = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
]

export class NavGrid {
  readonly cell = CELL
  readonly size: number
  private half: number
  private cells: number

  private height: Float32Array
  private solid: Uint8Array

  private gScore: Float32Array
  private cameFrom: Int32Array
  private seenStamp: Int32Array
  private closedStamp: Int32Array
  private gen = 0

  private heapIdx: number[] = []
  private heapF: number[] = []

  constructor(world: CollisionWorld, bounds: number) {
    this.half = bounds
    this.size = Math.ceil((bounds * 2) / CELL)
    this.cells = this.size * this.size

    this.height = new Float32Array(this.cells)
    this.solid = new Uint8Array(this.cells)
    this.gScore = new Float32Array(this.cells)
    this.cameFrom = new Int32Array(this.cells)
    this.seenStamp = new Int32Array(this.cells)
    this.closedStamp = new Int32Array(this.cells)

    this.build(world)
  }

  private build(world: CollisionWorld): void {
    // 先铺地形高度
    if (world.terrain) {
      const water = world.waterLevel
      for (let cz = 0; cz < this.size; cz++) {
        const z = this.centerZ(cz)
        const row = cz * this.size
        for (let cx = 0; cx < this.size; cx++) {
          const h = world.terrain.heightAt(this.centerX(cx), z)
          const i = row + cx
          this.height[i] = h
          // 水面以下当障碍：人机不会游泳，只能走桥
          if (water !== null && h < water + 0.25) this.solid[i] = 1
        }
      }
    }

    for (const b of world.boxes) {
      const tall = b.maxY > MAX_SOLID
      const pad = tall ? AGENT_RADIUS : 0

      const x0 = Math.max(0, Math.floor((b.minX - pad + this.half) / CELL))
      const x1 = Math.min(this.size - 1, Math.floor((b.maxX + pad + this.half) / CELL))
      const z0 = Math.max(0, Math.floor((b.minZ - pad + this.half) / CELL))
      const z1 = Math.min(this.size - 1, Math.floor((b.maxZ + pad + this.half) / CELL))
      if (x1 < x0 || z1 < z0) continue

      for (let cz = z0; cz <= z1; cz++) {
        const row = cz * this.size
        for (let cx = x0; cx <= x1; cx++) {
          const i = row + cx
          if (tall) this.solid[i] = 1
          else if (b.maxY > this.height[i]) this.height[i] = b.maxY
        }
      }
    }
  }

  // ---------------- 坐标换算 ----------------

  cellX(x: number): number {
    return Math.max(0, Math.min(this.size - 1, Math.floor((x + this.half) / CELL)))
  }

  cellZ(z: number): number {
    return Math.max(0, Math.min(this.size - 1, Math.floor((z + this.half) / CELL)))
  }

  centerX(cx: number): number {
    return -this.half + (cx + 0.5) * CELL
  }

  centerZ(cz: number): number {
    return -this.half + (cz + 0.5) * CELL
  }

  private free(i: number): boolean {
    return this.solid[i] === 0
  }

  private canStep(a: number, b: number): boolean {
    if (this.solid[a] !== 0 || this.solid[b] !== 0) return false
    return Math.abs(this.height[a] - this.height[b]) <= MAX_CLIMB
  }

  nearestFree(x: number, z: number, y = 0, maxRing = 5): number {
    const cx = this.cellX(x)
    const cz = this.cellZ(z)
    const start = cz * this.size + cx
    const ok = (i: number) => this.free(i) && Math.abs(this.height[i] - y) <= MAX_CLIMB

    if (ok(start)) return start

    for (let ring = 1; ring <= maxRing; ring++) {
      let best = -1
      let bestD = Infinity
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue
          const nx = cx + dx
          const nz = cz + dz
          if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue
          const i = nz * this.size + nx
          if (!ok(i)) continue
          const d = dx * dx + dz * dz
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
      }
      if (best >= 0) return best
    }
    return -1
  }

  // ---------------- A* ----------------

  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const s = this.nearestFree(from.x, from.z, from.y)
    const g = this.nearestFree(to.x, to.z, to.y)
    if (s < 0 || g < 0) return null
    if (s === g) return [new THREE.Vector3(to.x, 0, to.z)]

    const gen = ++this.gen
    const gx = g % this.size
    const gz = (g / this.size) | 0

    this.heapIdx.length = 0
    this.heapF.length = 0

    this.gScore[s] = 0
    this.seenStamp[s] = gen
    this.cameFrom[s] = -1
    this.push(s, this.heuristic(s % this.size, (s / this.size) | 0, gx, gz))

    let expanded = 0
    while (this.heapIdx.length > 0) {
      const cur = this.pop()
      if (this.closedStamp[cur] === gen) continue
      this.closedStamp[cur] = gen
      if (cur === g) return this.reconstruct(cur, gen)
      if (++expanded > MAX_EXPAND) break

      const cx = cur % this.size
      const cz = (cur / this.size) | 0
      const gc = this.gScore[cur]

      for (let k = 0; k < NEIGHBOURS.length; k++) {
        const n = NEIGHBOURS[k]
        const nx = cx + n.dx
        const nz = cz + n.dz
        if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue

        const ni = nz * this.size + nx
        if (this.solid[ni] !== 0) continue
        if (n.dx !== 0 && n.dz !== 0) {
          if (!this.canStep(cur, cz * this.size + nx)) continue
          if (!this.canStep(cur, nz * this.size + cx)) continue
        }
        if (!this.canStep(cur, ni)) continue
        if (this.closedStamp[ni] === gen) continue

        const ng = gc + n.cost
        if (this.seenStamp[ni] === gen && ng >= this.gScore[ni]) continue

        this.seenStamp[ni] = gen
        this.gScore[ni] = ng
        this.cameFrom[ni] = cur
        this.push(ni, ng + this.heuristic(nx, nz, gx, gz))
      }
    }

    return null
  }

  private heuristic(ax: number, az: number, bx: number, bz: number): number {
    const dx = Math.abs(ax - bx)
    const dz = Math.abs(az - bz)
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)
  }

  private reconstruct(end: number, gen: number): THREE.Vector3[] {
    const cells: number[] = []
    let cur = end
    let guard = 0
    while (cur !== -1 && guard++ < 4000) {
      cells.push(cur)
      if (this.seenStamp[cur] !== gen) break
      cur = this.cameFrom[cur]
    }
    cells.reverse()

    const pts: THREE.Vector3[] = []
    for (const i of cells) {
      const cx = i % this.size
      const cz = (i / this.size) | 0
      pts.push(new THREE.Vector3(this.centerX(cx), this.height[i], this.centerZ(cz)))
    }
    return this.smooth(pts)
  }

  private smooth(points: THREE.Vector3[]): THREE.Vector3[] {
    if (points.length <= 2) return points
    const out: THREE.Vector3[] = [points[0]]
    let i = 0
    while (i < points.length - 1) {
      let j = Math.min(points.length - 1, i + 8)
      for (; j > i + 1; j--) {
        if (this.lineOfWalk(points[i], points[j])) break
      }
      out.push(points[j])
      i = j
    }
    return out
  }

  lineOfWalk(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.001) return true

    const steps = Math.ceil(dist / 0.4)
    let prev = this.nearestFree(a.x, a.z, a.y, 1)

    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const x = a.x + dx * t
      const z = a.z + dz * t
      const y = a.y + (b.y - a.y) * t
      const i = this.nearestFree(x, z, y, 1)
      if (i < 0) return false
      if (prev >= 0 && !this.canStep(prev, i)) return false
      prev = i
    }
    return true
  }

  heightAt(x: number, z: number): number {
    return this.height[this.cellZ(z) * this.size + this.cellX(x)]
  }

  isFreeAt(x: number, z: number): boolean {
    return this.free(this.cellZ(z) * this.size + this.cellX(x))
  }

  // ---------------- 二叉堆 ----------------

  private push(i: number, f: number): void {
    const idx = this.heapIdx
    const fs = this.heapF
    let n = idx.length
    idx.push(i)
    fs.push(f)
    while (n > 0) {
      const parent = (n - 1) >> 1
      if (fs[parent] <= fs[n]) break
      const ti = idx[parent]
      const tf = fs[parent]
      idx[parent] = idx[n]
      fs[parent] = fs[n]
      idx[n] = ti
      fs[n] = tf
      n = parent
    }
  }

  private pop(): number {
    const idx = this.heapIdx
    const fs = this.heapF
    const top = idx[0]
    const lastI = idx.pop()!
    const lastF = fs.pop()!
    if (idx.length > 0) {
      idx[0] = lastI
      fs[0] = lastF
      let n = 0
      const len = idx.length
      for (;;) {
        const l = n * 2 + 1
        const r = l + 1
        let m = n
        if (l < len && fs[l] < fs[m]) m = l
        if (r < len && fs[r] < fs[m]) m = r
        if (m === n) break
        const ti = idx[m]
        const tf = fs[m]
        idx[m] = idx[n]
        fs[m] = fs[n]
        idx[n] = ti
        fs[n] = tf
        n = m
      }
    }
    return top
  }
}
