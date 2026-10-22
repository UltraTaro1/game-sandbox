// 玩家被毒圈打死 -> 结算名次
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'
const out = process.argv[3] ?? 'shot-dead.png'

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

await evaluate(`(() => {
  const d = __demo
  // 先把 5 个 bot 打死，制造"名次 12"的局面
  d.targets.slice(0, 5).forEach(t => { if (t.alive) t.takeDamage(999, false, d.player) })
  d.player.hp = 2
  d.zone.center.set(0, 0, 0)
  d.zone.radius = 10
  d.zone.dps = 6
  d.player.pos.set(50, 0, 50)
  d.rig.follow(0.016, d.player.pos, false, false)
  return true
})()`)

await sleep(2500)
const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))

const res = await evaluate(`JSON.stringify({
  hp: __demo.player.hp,
  state: __demo.state,
  title: document.getElementById('ovTitle').textContent,
  sub: document.getElementById('ovSub').textContent,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden')
})`)
console.log('RESULT', res)
console.log('LOGS', logs.length ? logs.join('\n') : '(none)')
ws.close()
