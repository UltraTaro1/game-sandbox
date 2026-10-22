(async () => {
  const d = window.__demo
  d.player.pos.set(0, 0, -2)
  d.rig.yaw = 0.35
  d.rig.pitch = -0.08
  d.rig.recoil = 0
  d.rig.follow(0.016, d.player.pos, false, false)

  // 等两帧，让 renderer 更新所有 matrixWorld
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  const out = []
  const seen = new Set()
  for (let gy = -0.6; gy <= 0.7; gy += 0.05) {
    for (let gx = -0.5; gx <= 0.1; gx += 0.05) {
      const rc = new d.THREE.Raycaster()
      rc.setFromCamera(new d.THREE.Vector2(gx, gy), d.camera)
      const hits = rc.intersectObjects(d.scene.children, true)
      if (!hits.length) continue
      const h = hits[0]
      const key = h.object.uuid
      if (seen.has(key)) continue
      seen.add(key)
      let chain = []
      let o = h.object
      while (o && chain.length < 4) {
        chain.push(o.name || o.type)
        o = o.parent
      }
      out.push({
        ndc: [+gx.toFixed(2), +gy.toFixed(2)],
        geom: h.object.geometry?.type,
        color: h.object.material?.color?.getHexString?.(),
        dist: +h.distance.toFixed(2),
        point: [+h.point.x.toFixed(1), +h.point.y.toFixed(1), +h.point.z.toFixed(1)],
        chain,
      })
    }
  }
  return JSON.stringify(out, null, 1)
})()
