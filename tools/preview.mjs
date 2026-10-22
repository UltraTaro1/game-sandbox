// 生成一张有内容的预览图：把两个 bot 摆到玩家正前方
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

await evaluate(`(() => {
  const d = __demo
  const bots = d.targets.filter(t => t.alive).slice(0, 2)
  bots[0].pos.set(-4.5, 0, -1)
  bots[0].home.copy(bots[0].pos); bots[0].stuckSpot.copy(bots[0].pos)
  bots[0].hp = 68
  if (bots[1]) {
    bots[1].pos.set(6.5, 0, -4)
    bots[1].home.copy(bots[1].pos); bots[1].stuckSpot.copy(bots[1].pos)
    bots[1].hp = 92
  }
  d.player.pos.set(0.5, 0, 13)
  d.player.vel.set(0, 0, 0)
  d.player.hp = 84
  d.zone.radius = 62
  d.zone.update(0.016)
  d.rig.yaw = 0.05
  d.rig.pitch = -0.04
  d.rig.follow(0.016, d.player.pos, false, false)
  return true
})()`)

await sleep(700)
const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('preview ok')
ws.close()
