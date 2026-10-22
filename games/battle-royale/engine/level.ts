import * as THREE from 'three'
import { CollisionWorld } from '../../../src/core/collision'

export interface Level {
  name: string
  root: THREE.Group
  /** 参与射线检测的静态几何体根节点 */
  solids: THREE.Group
  collision: CollisionWorld
  /** 半边长：世界范围是 [-bounds, bounds] */
  bounds: number
  /** 人数（含玩家） */
  players: number
  /** 掉落物数量 */
  lootCount: number
  /** 跳伞航线；null 表示直接在地面出生 */
  dropPath: { from: THREE.Vector3; to: THREE.Vector3; altitude: number } | null
  /** 人机刷新点 */
  hunterSpawns: THREE.Vector3[]
  /** 玩家出生点（非跳伞地图用） */
  spawn: THREE.Vector3
  /** 跟随玩家的太阳（大图用，阴影只覆盖身边） */
  sun?: THREE.DirectionalLight
  dispose?: () => void
}

const COLORS = {
  ground: 0x6f7a5f,
  buildingA: 0xb8b1a0,
  buildingB: 0xa1a8ae,
  buildingC: 0xa98d72,
  wall: 0xc7bfae,
  crate: 0xa9713c,
  platform: 0x8b9686,
  trunk: 0x6b4e34,
  leaves: 0x4f7c46,
  rock: 0x8d8d86,
}

/** 简单的地面网格贴图，避免纯色地面看不出移动 */
function makeGroundTexture(): THREE.Texture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#727d62'
  g.fillRect(0, 0, size, size)

  // 草地噪点
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * 0.08
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '30,40,20'},${a})`
    const s = 1 + Math.random() * 3
    g.fillRect(Math.random() * size, Math.random() * size, s, s)
  }

  // 网格线
  g.strokeStyle = 'rgba(40,50,30,0.16)'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(0, 0.5)
  g.lineTo(size, 0.5)
  g.moveTo(0.5, 0)
  g.lineTo(0.5, size)
  g.stroke()

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(105, 105)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function buildLevel(scene: THREE.Scene): Level {
  const root = new THREE.Group()
  root.name = 'level'
  const solids = new THREE.Group()
  solids.name = 'solids'
  const collision = new CollisionWorld()
  const hunterSpawns: THREE.Vector3[] = []

  scene.add(root)
  root.add(solids)

  // ---------- 光照 ----------
  const hemi = new THREE.HemisphereLight(0xcfe3f7, 0x5d6b4d, 1.15)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight(0xfff2dc, 2.4)
  sun.position.set(38, 62, 26)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -60
  sun.shadow.camera.right = 60
  sun.shadow.camera.top = 60
  sun.shadow.camera.bottom = -60
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 180
  sun.shadow.bias = -0.0008
  sun.shadow.normalBias = 0.02
  scene.add(sun)
  scene.add(sun.target)

  // ---------- 地面 ----------
  const groundMat = new THREE.MeshStandardMaterial({
    map: makeGroundTexture(),
    roughness: 0.95,
    metalness: 0,
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  root.add(ground)

  // ---------- 工具 ----------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1)

  const matCache = new Map<number, THREE.MeshStandardMaterial>()
  const mat = (color: number) => {
    let m = matCache.get(color)
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 })
      matCache.set(color, m)
    }
    return m
  }

  /** 添加一个盒子：既生成网格，也注册碰撞 */
  const addBox = (
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(boxGeo, mat(color))
    mesh.scale.set(sx, sy, sz)
    mesh.position.set(cx, cy, cz)
    mesh.castShadow = true
    mesh.receiveShadow = true
    solids.add(mesh)
    collision.add(cx, cy, cz, sx, sy, sz)
    return mesh
  }

  /** 以「落地高度」定义盒子，中心自动算 */
  const addBlock = (
    cx: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
  ) => addBox(cx, sy / 2, cz, sx, sy, sz, color)

  // ---------- 边界 ----------
  const B = 82
  const wallH = 8
  addBlock(0, -B, B * 2, wallH, 4, COLORS.wall)
  addBlock(0, B, B * 2, wallH, 4, COLORS.wall)
  addBlock(-B, 0, 4, wallH, B * 2, COLORS.wall)
  addBlock(B, 0, 4, wallH, B * 2, COLORS.wall)

  // ---------- 建筑 ----------
  /** 建筑外墙的一条深色腰线，纯视觉，让方块不那么单调 */
  const addTrim = (cx: number, cz: number, sx: number, sy: number, sz: number) => {
    const band = new THREE.Mesh(boxGeo, mat(0x6f7469))
    band.scale.set(sx + 0.08, 0.28, sz + 0.08)
    band.position.set(cx, sy * 0.62, cz)
    band.castShadow = false
    band.receiveShadow = true
    solids.add(band)
  }

  // 主楼
  addBlock(0, -22, 22, 7, 14, COLORS.buildingA)
  addTrim(0, -22, 22, 7, 14)
  // 左侧楼
  addBlock(-32, 2, 14, 5, 12, COLORS.buildingB)
  addTrim(-32, 2, 14, 5, 12)
  // 右侧厂房
  addBlock(30, 8, 16, 6, 18, COLORS.buildingC)
  addTrim(30, 8, 16, 6, 18)
  // 后侧塔
  addBlock(14, 34, 10, 9, 10, COLORS.buildingA)
  addTrim(14, 34, 10, 9, 10)
  // 小棚
  addBlock(-8, -38, 8, 3.5, 7, COLORS.buildingB)
  addTrim(-8, -38, 8, 3.5, 7)

  // ---------- 围墙外的远景树线（纯视觉） ----------
  const farTreeMat = mat(0x3f5c3c)
  const farTreeGeo = new THREE.ConeGeometry(1, 1, 6)
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + Math.random() * 0.06
    const r = 92 + Math.random() * 16
    const h = 7 + Math.random() * 7
    const w = 3.2 + Math.random() * 2.2
    const tree = new THREE.Mesh(farTreeGeo, farTreeMat)
    tree.position.set(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r)
    tree.scale.set(w, h, w)
    root.add(tree)
  }

  // ---------- 掩体墙 ----------
  addBlock(0, -6, 18, 1.5, 0.6, COLORS.wall)
  addBlock(17, -3, 0.6, 1.5, 12, COLORS.wall)
  addBlock(-20, 16, 12, 1.4, 0.6, COLORS.wall)
  addBlock(6, 16, 0.6, 1.4, 10, COLORS.wall)
  addBlock(-2, -14, 0.6, 1.6, 8, COLORS.wall)

  // ---------- 高台 + 楼梯 ----------
  const px = -14
  const pz = 4
  addBlock(px, pz, 10, 1.2, 8, COLORS.platform)
  // 四级台阶，每级 0.3，正好在角色可跨越高度内
  for (let i = 0; i < 4; i++) {
    const h = 1.2 - i * 0.3
    addBlock(px, pz + 4 + 0.4 + i * 0.8, 4, h, 0.8, COLORS.platform)
  }

  // ---------- 箱子 ----------
  const crate = 1.1
  const crateSpots: [number, number, number][] = [
    [7, 4, 1],
    [8.2, 4, 1],
    [7.6, 5.2, 2],
    [-6, -2, 1],
    [-5, -2, 1],
    [-5.5, -2, 2],
    [20, 20, 1],
    [21.5, 20, 1],
    [-26, -16, 1],
    [-24, 12, 1],
    [12, -34, 1],
    [-38, 26, 1],
  ]
  for (const [x, z, layers] of crateSpots) {
    for (let i = 0; i < layers; i++) {
      addBlock(x, z, crate, crate, crate, COLORS.crate)
    }
  }

  // ---------- 石头 ----------
  const rocks: [number, number, number, number][] = [
    [24, -20, 3, 2],
    [-18, 30, 4, 2.4],
    [36, 30, 3.5, 2],
    [-44, -6, 3, 1.8],
    [2, 44, 5, 2.6],
  ]
  for (const [x, z, sx, sy] of rocks) {
    addBlock(x, z, sx, sy, sx * 0.8, COLORS.rock)
  }

  // ---------- 树 ----------
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.36, 3.2, 7)
  const leafGeo = new THREE.ConeGeometry(2.1, 5.2, 7)
  const trunkMat = mat(COLORS.trunk)
  const leafMat = mat(COLORS.leaves)

  const treeSpots: [number, number][] = [
    [-52, -40],
    [-58, -14],
    [-46, 36],
    [-30, 52],
    [-6, 58],
    [26, 56],
    [48, 40],
    [58, 6],
    [52, -30],
    [34, -50],
    [10, -56],
    [-22, -52],
    [-64, 14],
    [64, 26],
    [-40, -28],
    [44, -12],
  ]
  for (const [x, z] of treeSpots) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)

    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.position.y = 1.6
    trunk.castShadow = true
    g.add(trunk)

    const leaf = new THREE.Mesh(leafGeo, leafMat)
    leaf.position.y = 5
    leaf.castShadow = true
    g.add(leaf)

    root.add(g)
    collision.add(x, 1.6, z, 0.7, 3.2, 0.7)
  }

  // ---------- 人机刷新点 ----------
  hunterSpawns.push(
    new THREE.Vector3(-30, 0, -34),
    new THREE.Vector3(30, 0, -36),
    new THREE.Vector3(-40, 0, 20),
    new THREE.Vector3(40, 0, 24),
    new THREE.Vector3(0, 0, 50),
    new THREE.Vector3(20, 0, -46),
  )

  return {
    name: '训练场',
    root,
    solids,
    collision,
    bounds: 82,
    players: 16,
    lootCount: 80,
    dropPath: null,
    hunterSpawns,
    spawn: new THREE.Vector3(0, 0, 20),
  }
}
