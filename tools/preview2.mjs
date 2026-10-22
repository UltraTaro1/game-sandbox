// 生成一张带掉落物的预览图
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'
const out = process.argv[3] ?? 'preview.png'

const list = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
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

const staged = await evaluate(`(async () => {
  const d = __demo
  const alive = d.loot.items.filter(i => i.alive)
  // 找一处附近还有别的掉落物的点
  let pick = null
  for (const a of alive) {
    const near = alive.filter(b => b !== a && b.pos.distanceTo(a.pos) < 9)
    if (near.length >= 1 && (!pick || near.length > pick.n)) pick = { a, near, n: near.length }
  }
  if (!pick) return 'none'

  const a = pick.a
  // 玩家站在掉落物南边 3.2m，朝向它
  d.player.pos.set(a.pos.x, 0, a.pos.z + 3.2)
  d.player.vel.set(0, 0, 0)
  d.player.hp = 88
  d.player.armor = 50
  d.rig.yaw = 0
  d.rig.pitch = -0.13
  d.rig.follow(0.016, d.player.pos, false, false)

  // 把最近的两个人机挪到视野边上，别贴脸
  const bots = d.targets.filter(t => t.alive).slice(0, 2)
  if (bots[0]) { bots[0].pos.set(a.pos.x - 9, 0, a.pos.z - 16); bots[0].home.copy(bots[0].pos) }
  if (bots[1]) { bots[1].pos.set(a.pos.x + 11, 0, a.pos.z - 20); bots[1].home.copy(bots[1].pos) }
  return 'ok:' + pick.n
})()`)

await sleep(700)
const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('staged', staged)
ws.close()
