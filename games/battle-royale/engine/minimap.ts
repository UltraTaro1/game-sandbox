import type { AABB } from '../../../src/core/collision'
import type { Player } from './player'
import type { Zone } from './zone'

const SIZE = 180

/** 左上角小地图：静态底图 + 缩圈 + 玩家箭头，12Hz 重绘 */
export class Minimap {
  private ctx: CanvasRenderingContext2D
  private base: HTMLCanvasElement
  private acc = 0
  private world = 164

  constructor(
    private canvas: HTMLCanvasElement,
    boxes: AABB[],
    bounds = 82,
  ) {
    this.world = bounds * 2
    canvas.width = SIZE
    canvas.height = SIZE
    this.ctx = canvas.getContext('2d')!
    this.base = document.createElement('canvas')
    this.base.width = SIZE
    this.base.height = SIZE
    this.drawBase(boxes)
  }

  private toMap(x: number, z: number): [number, number] {
    return [((x + this.world / 2) / this.world) * SIZE, ((z + this.world / 2) / this.world) * SIZE]
  }

  private drawBase(boxes: AABB[]): void {
    const g = this.base.getContext('2d')!
    g.fillStyle = 'rgba(28,38,32,0.82)'
    g.fillRect(0, 0, SIZE, SIZE)

    g.strokeStyle = 'rgba(255,255,255,0.18)'
    g.lineWidth = 1
    g.strokeRect(1, 1, SIZE - 2, SIZE - 2)

    const scale = SIZE / this.world
    for (const b of boxes) {
      if (b.maxY < 1.2) continue
      const w = (b.maxX - b.minX) * scale
      const h = (b.maxZ - b.minZ) * scale
      if (w < 1 || h < 1) continue
      const [x, y] = this.toMap(b.minX, b.minZ)
      g.fillStyle = 'rgba(196,204,192,0.55)'
      g.fillRect(x, y, w, h)
    }
  }

  update(dt: number, player: Player, zone: Zone): void {
    this.acc += dt
    if (this.acc < 0.083) return
    this.acc = 0

    const c = this.ctx
    c.clearRect(0, 0, SIZE, SIZE)
    c.drawImage(this.base, 0, 0)

    const scale = SIZE / this.world

    const [cx, cy] = this.toMap(zone.center.x, zone.center.z)
    const r = zone.radius * scale

    c.save()
    c.beginPath()
    c.rect(0, 0, SIZE, SIZE)
    c.arc(cx, cy, r, 0, Math.PI * 2, true)
    c.fillStyle = 'rgba(140,40,40,0.28)'
    c.fill()
    c.restore()

    c.beginPath()
    c.arc(cx, cy, r, 0, Math.PI * 2)
    c.strokeStyle = 'rgba(127,212,255,0.9)'
    c.lineWidth = 1.5
    c.stroke()

    if (zone.state === 'wait') {
      const [nx, ny] = this.toMap(zone.nextCenter.x, zone.nextCenter.z)
      c.beginPath()
      c.arc(nx, ny, zone.nextRadius * scale, 0, Math.PI * 2)
      c.strokeStyle = 'rgba(255,255,255,0.75)'
      c.lineWidth = 1
      c.setLineDash([3, 3])
      c.stroke()
      c.setLineDash([])
    }

    const [px, py] = this.toMap(player.pos.x, player.pos.z)
    c.save()
    c.translate(px, py)
    c.rotate(-player.yaw)
    c.beginPath()
    c.moveTo(0, -5)
    c.lineTo(3.6, 4)
    c.lineTo(0, 2.2)
    c.lineTo(-3.6, 4)
    c.closePath()
    c.fillStyle = player.alive ? '#ffb03a' : '#ff5a4d'
    c.fill()
    c.restore()
  }
}
