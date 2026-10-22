import * as THREE from 'three'

/** 轴对齐包围盒（关卡里的所有碰撞体都是 AABB，简化物理） */
export interface AABB {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/**
 * 极简碰撞世界：
 * - 水平方向：圆盘 vs AABB，沿最短方向推出
 * - 垂直方向：查询脚下支撑面，低于台阶高度的障碍直接踩上去
 * 对所有轴对齐盒子足够稳，也不需要引入物理引擎。
 */
export class CollisionWorld {
  boxes: AABB[] = []
  /** 地形高度场（训练场为空，地面就是 y=0） */
  terrain: { heightAt(x: number, z: number): number } | null = null
  /** 水面高度：低于这个高度的地面算水域，人机不会走 */
  waterLevel: number | null = null

  groundAt(x: number, z: number): number {
    return this.terrain ? this.terrain.heightAt(x, z) : 0
  }

  /** 以「中心 + 尺寸」注册一个盒子 */
  add(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    const hx = sx / 2
    const hy = sy / 2
    const hz = sz / 2
    this.boxes.push({
      minX: cx - hx,
      maxX: cx + hx,
      minY: cy - hy,
      maxY: cy + hy,
      minZ: cz - hz,
      maxZ: cz + hz,
    })
  }

  /**
   * 把圆柱体（脚底在 pos.y）从竖直方向重叠的盒子里水平推出来。
   * step 以下的盒子视为可踩踏，不参与水平阻挡。
   */
  resolveHorizontal(pos: THREE.Vector3, radius: number, height: number, step: number): void {
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i]
        // 顶面低于脚 + 台阶高度：可以踩上去，不挡
        if (b.maxY <= pos.y + step) continue
        // 完全在头顶上方
        if (b.minY >= pos.y + height) continue

        const cx = clamp(pos.x, b.minX, b.maxX)
        const cz = clamp(pos.z, b.minZ, b.maxZ)
        const dx = pos.x - cx
        const dz = pos.z - cz
        const d2 = dx * dx + dz * dz
        if (d2 >= radius * radius) continue

        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          const push = radius - d
          pos.x += (dx / d) * push
          pos.z += (dz / d) * push
        } else {
          // 圆心落在盒子内部：沿最小穿透轴推出去
          const left = pos.x - b.minX
          const right = b.maxX - pos.x
          const front = pos.z - b.minZ
          const back = b.maxZ - pos.z
          const m = Math.min(left, right, front, back)
          if (m === left) pos.x = b.minX - radius
          else if (m === right) pos.x = b.maxX + radius
          else if (m === front) pos.z = b.minZ - radius
          else pos.z = b.maxZ + radius
        }
      }
    }
  }

  /**
   * 某个点是否被实体挡住（用于随机刷人，避免刷进墙里）
   */
  isBlocked(x: number, z: number, margin = 0): boolean {
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i]
      if (b.maxY <= 0.8) continue
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) {
        return true
      }
    }
    return false
  }

  /**
   * 查询脚下方最高的支撑面高度（地面为 0）。
   * feetY 用「移动前」的值，这样从高处落下时也能正确落在盒子上。
   */
  supportHeight(x: number, z: number, feetY: number, step: number): number {
    let h = this.groundAt(x, z)
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i]
      if (b.maxY > feetY + step) continue
      if (x < b.minX || x > b.maxX) continue
      if (z < b.minZ || z > b.maxZ) continue
      if (b.maxY > h) h = b.maxY
    }
    return h
  }
}
