// 寻路验证：绕楼、上台阶、耗时
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'

const list = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const logs = []
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${msg.params.exceptionDetails.text}`)
  }
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(3000)

const result = await evaluate(`(() => {
  const { nav, THREE } = __demo
  const P = (x, z) => new THREE.Vector3(x, 0, z)
  const out = {}

  // 1) 绕过主楼（主楼 x -11..11, z -29..-15）
  const t0 = performance.now()
  const p1 = nav.findPath(P(0, -5), P(0, -35))
  out.aroundBuilding = {
    ms: +(performance.now() - t0).toFixed(2),
    points: p1 ? p1.length : null,
    xs: p1 ? p1.map(v => +v.x.toFixed(1)) : null,
    len: p1 ? +p1.reduce((s, v, i) => i ? s + v.distanceTo(p1[i-1]) : 0, 0).toFixed(1) : null,
    straight: 30,
  }

  // 2) 上高台（经楼梯）：终点是 1.2m 高的平台
  const p2 = nav.findPath(P(-14, 16), new THREE.Vector3(-14, 1.2, 4))
  out.stairs = {
    points: p2 ? p2.length : null,
    lastY: p2 && p2.length ? +p2[p2.length - 1].y.toFixed(2) : null,
    pts: p2 ? p2.map(v => [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)]) : null,
  }

  // 3) 目标点在墙里（应自动找最近可走格）
  const p3 = nav.findPath(P(20, 30), P(0, -22))
  out.insideWall = { ok: !!p3, points: p3 ? p3.length : 0 }

  // 4) 批量耗时
  let total = 0, n = 0
  for (let i = 0; i < 40; i++) {
    const a = P((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120)
    const b = P((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120)
    const t = performance.now()
    const r = nav.findPath(a, b)
    total += performance.now() - t
    if (r) n++
  }
  out.batch = { avgMs: +(total / 40).toFixed(3), success: n + '/40' }

  return JSON.stringify(out)
})()`)

console.log('NAV', result)

// 实战：把一个人机放到楼前，让玩家在楼后，看它是否会绕
const chase = await evaluate(`(async () => {
  const d = __demo
  const b = d.targets.find(t => t.alive)
  d.player.pos.set(0, 0, -35)
  d.player.vel.set(0, 0, 0)
  b.pos.set(0, 0, -5)
  b.vel.set(0, 0, 0)
  b.stuckSpot.copy(b.pos)
  b.target = d.player
  b.lastKnown.set(0, 0, -35)
  b.alertTimer = 12
  b.pathTimer = 0
  await new Promise(r => setTimeout(r, 1200))
  return JSON.stringify({
    path: b.path.map(p => [+p.x.toFixed(1), +p.z.toFixed(1)]),
    pos: [+b.pos.x.toFixed(1), +b.pos.z.toFixed(1)],
    goal: [+b.goal.x.toFixed(1), +b.goal.z.toFixed(1)],
  })
})()`)
console.log('CHASE', chase)

console.log('LOGS', logs.length ? logs.join('\n') : '(none)')
ws.close()
