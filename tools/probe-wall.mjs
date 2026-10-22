// 只看毒圈墙和圈外掉血
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'
const out = process.argv[3] ?? 'shot-wall.png'

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
  d.zone.center.set(0, 0, 0)
  d.zone.radius = 30
  d.zone.state = 'wait'
  d.zone.timer = 999
  d.zone.dps = 4
  d.zone.update(0.016)
  d.player.pos.set(-12, 0, 55)
  d.player.vel.set(0, 0, 0)
  d.player.hp = 100
  d.rig.yaw = 0
  d.rig.pitch = 0.03
  d.rig.follow(0.016, d.player.pos, false, false)
  return true
})()`)

await sleep(1200)
const hp1 = await evaluate(`Math.round(__demo.player.hp)`)
await send('Page.captureScreenshot', { format: 'png' }).then((r) =>
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')),
)
await sleep(2500)
const hp2 = await evaluate(`JSON.stringify({
  hp: Math.round(__demo.player.hp),
  outside: document.getElementById('damageVignette').classList.contains('outside')
})`)
console.log('HP1', hp1)
console.log('HP2', hp2)
ws.close()
