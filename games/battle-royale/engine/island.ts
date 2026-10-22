import * as THREE from 'three'
import { CollisionWorld } from '../../../src/core/collision'
import { Terrain, type Pad } from '../../../src/world/terrain'
import type { Level } from './level'

const BOUNDS = 320
const RIVER_Z = 40
const BRIDGE_X = [-165, -20, 150]

/** 程序化外墙贴图：底色 + 成排窗户 */
function facadeTexture(base: string, glass: string, cols: number, rows: number): THREE.CanvasTexture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`
    g.fillRect(Math.random() * size, Math.random() * size, Math.random() * 6, Math.random() * 6)
  }
  const w = size / cols
  const h = size / rows
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * w + w * 0.22
      const y = r * h + h * 0.18
      g.fillStyle = glass
      g.fillRect(x, y, w * 0.56, h * 0.5)
      g.fillStyle = 'rgba(255,255,255,0.1)'
      g.fillRect(x, y, w * 0.56, h * 0.12)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

interface Town {
  x: number
  z: number
  count: number
  radius: number
  tall: boolean
}

export function buildIsland(scene: THREE.Scene): Level {
  const root = new THREE.Group()
  const solids = new THREE.Group()
  root.add(solids)
  const collision = new CollisionWorld()

  const hemi = new THREE.HemisphereLight(0xcfe3f7, 0x55603f, 1.05)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff3dd, 2.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -55
  sun.shadow.camera.right = 55
  sun.shadow.camera.top = 55
  sun.shadow.camera.bottom = -55
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 300
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.03
  scene.add(sun)
  scene.add(sun.target)

  // ---------------- 地形 ----------------
  const hills = [
    { x: -225, z: -225, r: 120, h: 58 },
    { x: 200, z: -200, r: 105, h: 46 },
    { x: 105, z: 230, r: 125, h: 52 },
    { x: -200, z: 210, r: 95, h: 38 },
    { x: 270, z: 80, r: 90, h: 32 },
    { x: -80, z: -80, r: 150, h: 7 },
    { x: 40, z: 130, r: 110, h: 12 },
  ]

  const pads: Pad[] = []
  for (const bx of BRIDGE_X) {
    pads.push({ x: bx, z: RIVER_Z - 28, w: 14, d: 34, y: 4.4, feather: 16 })
    pads.push({ x: bx, z: RIVER_Z + 28, w: 14, d: 34, y: 4.4, feather: 16 })
  }

  const terrain = new Terrain(
    BOUNDS * 2,
    hills,
    { axis: 'x', pos: RIVER_Z, width: 24, bedY: 2 },
    pads,
  )
  const WATER_Y = 3.4

  collision.terrain = terrain
  collision.waterLevel = WATER_Y

  const grass = new THREE.Color(0x6d7f52)
  const grass2 = new THREE.Color(0x5d6f47)
  const sand = new THREE.Color(0xc2b184)
  const rock = new THREE.Color(0x8b8877)
  const road = new THREE.Color(0x4a4d4a)

  const colorAt = (x: number, z: number, h: number): THREE.Color => {
    const onRoad = Math.abs(x) < 6
    if (h < WATER_Y + 5.5) return onRoad && h > 0 ? road : sand
    if (onRoad && h < 14) return road
    if (h > 34) return rock
    const n = (Math.sin(x * 0.09) + Math.cos(z * 0.11)) * 0.5
    return n > 0.2 ? grass : grass2
  }

  root.add(terrain.buildMesh(colorAt, 190))

  // ---------------- 河 ----------------
  const riverGeo = new THREE.PlaneGeometry(BOUNDS * 2, 70)
  riverGeo.rotateX(-Math.PI / 2)
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.MeshStandardMaterial({
      color: 0x2f6a8a,
      transparent: true,
      opacity: 0.8,
      roughness: 0.12,
      metalness: 0.4,
    }),
  )
  river.position.set(0, WATER_Y, RIVER_Z)
  root.add(river)

  // ---------------- 材质 ----------------
  const wallTexA = facadeTexture('#b9b4a6', '#2f3a42', 3, 4)
  const wallTexB = facadeTexture('#9aa3a8', '#26323a', 4, 5)
  const wallTexC = facadeTexture('#a9825f', '#2b2a26', 3, 3)
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4741, roughness: 0.9 })
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.95 })
  const boxGeo = new THREE.BoxGeometry(1, 1, 1)

  const boxMatCache = new Map<number, THREE.MeshStandardMaterial>()
  const flatMat = (color: number) => {
    let m = boxMatCache.get(color)
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
      boxMatCache.set(color, m)
    }
    return m
  }

  const addBox = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat: THREE.Material,
    collide = true,
  ) => {
    const mesh = new THREE.Mesh(boxGeo, mat)
    mesh.scale.set(sx, sy, sz)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    solids.add(mesh)
    if (collide) collision.add(x, y, z, sx, sy, sz)
    return mesh
  }

  const addBuilding = (x: number, z: number, w: number, d: number, h: number, kind: number) => {
    const gy = terrain.heightAt(x, z)
    const base = gy - 1
    const tex = (kind === 0 ? wallTexA : kind === 1 ? wallTexB : wallTexC).clone()
    tex.needsUpdate = true
    tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 4)))
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 })

    addBox(x, base + h / 2, z, w, h, d, mat)
    addBox(x, base + h + 0.25, z, w + 1.2, 0.5, d + 1.2, roofMat, false)
    if (h > 6) addBox(x, base + h * 0.55, z, w + 0.35, 0.35, d + 0.35, flatMat(0x6b675e), false)
  }

  // ---------------- 建筑群 ----------------
  const towns: Town[] = [
    { x: 12, z: -20, count: 14, radius: 62, tall: true },
    { x: -215, z: -160, count: 8, radius: 40, tall: false },
    { x: 200, z: -105, count: 10, radius: 48, tall: true },
    { x: -200, z: 175, count: 8, radius: 38, tall: false },
    { x: 215, z: 160, count: 9, radius: 40, tall: false },
    { x: 40, z: -200, count: 8, radius: 36, tall: false },
    { x: -55, z: 185, count: 7, radius: 34, tall: false },
    { x: 260, z: 20, count: 6, radius: 30, tall: false },
  ]

  let rngState = 20260222
  const rnd = () => {
    rngState = (rngState * 1664525 + 1013904223) % 4294967296
    return rngState / 4294967296
  }

  for (const town of towns) {
    for (let i = 0; i < town.count; i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * town.radius
      const x = town.x + Math.cos(a) * r
      const z = town.z + Math.sin(a) * r
      if (Math.abs(x) > BOUNDS - 16 || Math.abs(z) > BOUNDS - 16) continue
      if (terrain.heightAt(x, z) < 1) continue
      if (Math.abs(z - RIVER_Z) < 24) continue

      addBuilding(
        x,
        z,
        7 + rnd() * 9,
        7 + rnd() * 9,
        town.tall ? 6 + rnd() * 14 : 4 + rnd() * 5,
        Math.floor(rnd() * 3),
      )
      if (rnd() < 0.5) {
        const cx = x + 6
        const cz = z + (rnd() - 0.5) * 8
        addBox(cx, terrain.heightAt(cx, cz) + 0.55, cz, 1.1, 1.1, 1.1, flatMat(0x8a6438))
      }
    }
  }

  // ---------------- 桥 ----------------
  for (const bx of BRIDGE_X) {
    addBox(bx, 3.9, RIVER_Z, 9, 1.2, 34, concrete)
    addBox(bx - 4.4, 4.75, RIVER_Z, 0.25, 0.7, 34, flatMat(0x8d8b80), false)
    addBox(bx + 4.4, 4.75, RIVER_Z, 0.25, 0.7, 34, flatMat(0x8d8b80), false)
    for (const dz of [-10, 10]) {
      addBox(bx, 1.6, RIVER_Z + dz, 7, 4.8, 1.6, concrete, false)
    }
  }

  // ---------------- 车 ----------------
  const carBody = [0x8c3b34, 0x2f5f8a, 0xb8b4a8, 0x3f4a3a, 0x8a7b2f]
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2b3d47, roughness: 0.2, metalness: 0.6 })

  const addCar = (x: number, z: number, rotY: number) => {
    const gy = terrain.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)
    g.rotation.y = rotY

    const body = new THREE.Mesh(boxGeo, flatMat(carBody[Math.floor(rnd() * carBody.length)]))
    body.scale.set(2, 0.75, 4.2)
    body.position.y = 0.75
    body.castShadow = true
    g.add(body)

    const cabin = new THREE.Mesh(boxGeo, glassMat)
    cabin.scale.set(1.8, 0.7, 2)
    cabin.position.set(0, 1.42, -0.15)
    g.add(cabin)

    for (const sx of [-1, 1]) {
      for (const sz of [-1.35, 1.35]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat)
        w.rotation.z = Math.PI / 2
        w.position.set(sx * 1.02, 0.36, sz)
        g.add(w)
      }
    }

    root.add(g)
    const sw = Math.abs(Math.cos(rotY)) * 2 + Math.abs(Math.sin(rotY)) * 4.2
    const sd = Math.abs(Math.sin(rotY)) * 2 + Math.abs(Math.cos(rotY)) * 4.2
    collision.add(x, gy + 0.9, z, Math.max(2, sw), 1.8, Math.max(2, sd))
  }

  for (let i = 0; i < 22; i++) {
    const onMain = rnd() < 0.6
    const x = onMain ? (rnd() - 0.5) * 6 : (rnd() - 0.5) * 500
    const z = onMain ? (rnd() - 0.5) * 500 : (rnd() - 0.5) * 6
    if (Math.abs(z - RIVER_Z) < 26) continue
    if (Math.abs(z - RIVER_Z) < 12) continue
    if (collision.isBlocked(x, z, 3)) continue
    addCar(x, z, rnd() < 0.5 ? 0 : Math.PI / 2)
  }

  // ---------------- 树 / 石头 ----------------
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.42, 4, 6)
  const leafGeo = new THREE.ConeGeometry(2.6, 7, 7)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4530, roughness: 1 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x466b3c, roughness: 1 })
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7a6c, roughness: 1 })

  let trees = 0
  for (let i = 0; i < 4000 && trees < 420; i++) {
    const x = (rnd() - 0.5) * (BOUNDS * 2 - 24)
    const z = (rnd() - 0.5) * (BOUNDS * 2 - 24)
    const h = terrain.heightAt(x, z)
    if (h < 1.6 || h > 30) continue
    if (Math.abs(x) < 8) continue
    if (collision.isBlocked(x, z, 1.5)) continue

    const g = new THREE.Group()
    g.position.set(x, h, z)
    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.position.y = 2
    const leaf = new THREE.Mesh(leafGeo, leafMat)
    leaf.position.y = 6.4
    g.add(trunk, leaf)
    root.add(g)
    collision.add(x, h + 2, z, 0.8, 4, 0.8)
    trees++
  }

  for (let i = 0; i < 90; i++) {
    const x = (rnd() - 0.5) * (BOUNDS * 2 - 40)
    const z = (rnd() - 0.5) * (BOUNDS * 2 - 40)
    const h = terrain.heightAt(x, z)
    if (h < 0.8) continue
    if (collision.isBlocked(x, z, 2)) continue
    const s = 2 + rnd() * 4
    addBox(x, h + s * 0.45, z, s, s * 0.9, s * 0.8, rockMat)
  }

  const hunterSpawns: THREE.Vector3[] = []
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2
    const r = 80 + (i % 6) * 34
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    hunterSpawns.push(new THREE.Vector3(x, terrain.heightAt(x, z), z))
  }

  scene.add(root)
  return {
    name: '孤岛',
    root,
    solids,
    collision,
    bounds: BOUNDS,
    players: 64,
    lootCount: 340,
    dropPath: {
      from: new THREE.Vector3(-350, 0, -200),
      to: new THREE.Vector3(350, 0, 200),
      altitude: 200,
    },
    hunterSpawns,
    spawn: new THREE.Vector3(0, terrain.heightAt(0, 0), 0),
    sun,
  }
}
