import * as THREE from 'three'

/**
 * 程序化枪械模型：按枪型拼机匣、护木、枪管、弹匣、握把、枪托、瞄具。
 * 统一朝向：枪口指向 -Z，原点在握把上方。
 */

const MAT = {
  metal: new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.55, metalness: 0.65 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x191c1f, roughness: 0.7, metalness: 0.45 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.86, metalness: 0.1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6a4526, roughness: 0.78, metalness: 0.05 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x8d7a5c, roughness: 0.85, metalness: 0.08 }),
  lens: new THREE.MeshStandardMaterial({
    color: 0x1d3b3a,
    roughness: 0.15,
    metalness: 0.9,
    emissive: 0x2a6a66,
    emissiveIntensity: 0.55,
  }),
  red: new THREE.MeshBasicMaterial({ color: 0xff5533 }),
}

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(BOX, mat)
  m.scale.set(w, h, d)
  m.position.set(x, y, z)
  return m
}

/** 沿 Z 轴的圆柱 */
function tube(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(CYL, mat)
  m.scale.set(r * 2, len, r * 2)
  m.rotation.x = Math.PI / 2
  m.position.set(x, y, z)
  return m
}

export interface GunModel {
  group: THREE.Group
  muzzle: THREE.Object3D
}

/** low = 地面掉落物用的简化版（少一半零件） */
export function buildWeaponModel(id: string, low = false): GunModel {
  const g = new THREE.Group()
  const muzzle = new THREE.Object3D()

  if (id === 'ar') {
    // 突击步枪：机匣 + 护木 + 直枪管 + 弯弹匣 + 折叠托 + 红点
    g.add(box(0.075, 0.1, 0.34, MAT.metal, 0, 0, -0.02))
    g.add(box(0.07, 0.075, 0.26, MAT.polymer, 0, 0.004, -0.32))
    g.add(tube(0.013, 0.26, MAT.dark, 0, 0.008, -0.55))
    g.add(tube(0.019, 0.055, MAT.metal, 0, 0.008, -0.69))
    g.add(box(0.012, 0.03, 0.02, MAT.dark, 0, 0.045, -0.16))
    if (!low) {
      const mag = box(0.048, 0.17, 0.075, MAT.dark, 0, -0.11, -0.03)
      mag.rotation.x = -0.16
      g.add(mag)
      const grip = box(0.045, 0.1, 0.055, MAT.polymer, 0, -0.1, 0.1)
      grip.rotation.x = 0.22
      g.add(grip)
      g.add(box(0.055, 0.085, 0.2, MAT.polymer, 0, 0.005, 0.24))
      g.add(box(0.03, 0.022, 0.16, MAT.dark, 0, 0.068, -0.04))
      g.add(box(0.036, 0.05, 0.05, MAT.dark, 0, 0.1, -0.02))
      g.add(box(0.008, 0.008, 0.003, MAT.red, 0, 0.1, -0.046))
    }
    muzzle.position.set(0, 0.008, -0.72)
  } else if (id === 'sg') {
    // 霰弹枪：粗枪管 + 下挂弹管 + 泵动护木 + 木托
    g.add(box(0.08, 0.105, 0.3, MAT.metal, 0, 0, 0))
    g.add(tube(0.024, 0.5, MAT.metal, 0, 0.012, -0.42))
    g.add(tube(0.016, 0.4, MAT.dark, 0, -0.03, -0.38))
    if (!low) {
      g.add(box(0.072, 0.07, 0.13, MAT.wood, 0, -0.02, -0.32))
      const grip = box(0.05, 0.1, 0.06, MAT.wood, 0, -0.1, 0.09)
      grip.rotation.x = 0.2
      g.add(grip)
      g.add(box(0.055, 0.09, 0.24, MAT.wood, 0, 0.015, 0.26))
      g.add(box(0.03, 0.02, 0.05, MAT.dark, 0, 0.07, -0.1))
    }
    muzzle.position.set(0, 0.012, -0.68)
  } else if (id === 'dmr') {
    // 精确射手步枪：长枪管 + 大倍镜 + 加长托
    g.add(box(0.07, 0.095, 0.38, MAT.metal, 0, 0, 0))
    g.add(box(0.065, 0.07, 0.24, MAT.tan, 0, 0.004, -0.35))
    g.add(tube(0.011, 0.4, MAT.dark, 0, 0.008, -0.66))
    g.add(tube(0.017, 0.06, MAT.metal, 0, 0.008, -0.87))
    if (!low) {
      const mag = box(0.045, 0.15, 0.07, MAT.dark, 0, -0.105, -0.02)
      mag.rotation.x = -0.12
      g.add(mag)
      const grip = box(0.045, 0.1, 0.055, MAT.tan, 0, -0.1, 0.12)
      grip.rotation.x = 0.22
      g.add(grip)
      g.add(box(0.055, 0.09, 0.26, MAT.tan, 0, 0.01, 0.28))
      // 瞄准镜
      g.add(tube(0.032, 0.26, MAT.dark, 0, 0.1, -0.06))
      g.add(tube(0.036, 0.03, MAT.metal, 0, 0.1, -0.19))
      g.add(tube(0.036, 0.03, MAT.metal, 0, 0.1, 0.07))
      g.add(tube(0.028, 0.006, MAT.lens, 0, 0.1, 0.075))
      g.add(box(0.02, 0.04, 0.03, MAT.dark, 0, 0.065, -0.04))
      g.add(box(0.02, 0.04, 0.03, MAT.dark, 0, 0.065, -0.13))
    }
    muzzle.position.set(0, 0.008, -0.9)
  } else {
    // 狙击枪：超长枪管 + 大倍镜 + 拉栓 + 贴腮托
    g.add(box(0.068, 0.095, 0.42, MAT.dark, 0, 0, 0.02))
    g.add(tube(0.012, 0.6, MAT.metal, 0, 0.01, -0.72))
    g.add(tube(0.02, 0.09, MAT.metal, 0, 0.01, -1.03))
    if (!low) {
      g.add(box(0.05, 0.14, 0.08, MAT.dark, 0, -0.1, -0.04))
      const grip = box(0.045, 0.1, 0.055, MAT.polymer, 0, -0.1, 0.12)
      grip.rotation.x = 0.24
      g.add(grip)
      g.add(box(0.055, 0.1, 0.3, MAT.polymer, 0, 0.005, 0.32))
      g.add(box(0.05, 0.03, 0.08, MAT.polymer, 0, 0.07, 0.2))
      // 大倍镜
      g.add(tube(0.038, 0.34, MAT.dark, 0, 0.11, -0.04))
      g.add(tube(0.043, 0.04, MAT.metal, 0, 0.11, -0.21))
      g.add(tube(0.043, 0.04, MAT.metal, 0, 0.11, 0.13))
      g.add(tube(0.034, 0.008, MAT.lens, 0, 0.11, 0.135))
      g.add(box(0.02, 0.05, 0.04, MAT.dark, 0, 0.06, -0.08))
      g.add(box(0.02, 0.05, 0.04, MAT.dark, 0, 0.06, 0.02))
      // 拉栓
      const bolt = box(0.014, 0.014, 0.07, MAT.metal, 0.045, 0.02, 0.12)
      bolt.rotation.y = 0.5
      g.add(bolt)
    }
    muzzle.position.set(0, 0.01, -1.08)
  }

  g.add(muzzle)
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.frustumCulled = false
    }
  })
  return { group: g, muzzle }
}

/** 弹药箱：木箱 + 露出来的几发子弹 */
export function buildAmmoBox(shell: boolean): THREE.Group {
  const g = new THREE.Group()
  const crate = new THREE.MeshStandardMaterial({ color: shell ? 0x8c5a2b : 0x6f6a3c, roughness: 0.9 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a03c, roughness: 0.35, metalness: 0.8 })

  g.add(box(0.3, 0.16, 0.24, crate, 0, 0, 0))
  g.add(box(0.32, 0.03, 0.26, crate, 0, 0.08, 0))

  // 竖着插在箱子里的弹壳
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(CYL, brass)
    b.scale.set((shell ? 0.034 : 0.022), 0.13, (shell ? 0.034 : 0.022))
    b.position.set(-0.09 + i * 0.06, 0.14, (i % 2) * 0.05 - 0.025)
    g.add(b)
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
  return g
}
