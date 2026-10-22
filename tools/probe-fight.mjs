// 人机互殴 + 毒圈墙视觉检查
import fs from 'node:fs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'
const outWall = process.argv[3] ?? 'shot-wall.png'

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
    const d = msg.params.exceptionDetails
    logs.push(`[exception] ${d.text} ${d.exception?.description ?? ''}`)
  }
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(3000)

// 把 4 个人机丢到一起，看它们会不会互相开火
const setup = await evaluate(`(() => {
  const d = __demo
  d.player.pos.set(60, 0, 60)
  const bots = d.targets.filter(t => t.alive).slice(0, 4)
  bots.forEach((t, i) => {
    t.pos.set(10 + i * 3, 0, -10)
    t.home.copy(t.pos)
    t.stuckSpot.copy(t.pos)
  })
  return JSON.stringify({ bots: bots.map(b => b.name), hp: bots.map(b => b.hp) })
})()`)

await sleep(20000)

const fight = await evaluate(`JSON.stringify({
  hp: __demo.targets.slice(0, 4).map(t => ({ name: t.name, hp: Math.round(t.hp), alive: t.alive })),
  feed: document.getElementById('killfeed').textContent,
  alive: __demo.state.alive
})`)

// 站到毒圈边上，看墙
await evaluate(`(() => {
  const d = __demo
  d.zone.radius = 40
  d.zone.center.set(0, 0, 0)
  d.zone.state = 'shrink'
  d.zone.update(0.016)
  d.player.pos.set(34, 0, 0)
  d.player.vel.set(0, 0, 0)
  d.rig.yaw = -Math.PI / 2
  d.rig.pitch = 0.02
  d.rig.follow(0.016, d.player.pos, false, false)
  return true
})()`)
await sleep(800)
await send('Page.captureScreenshot', { format: 'png' }).then((r) =>
  fs.writeFileSync(outWall, Buffer.from(r.result.data, 'base64')),
)

console.log('SETUP', setup)
console.log('FIGHT', fight)
console.log('LOGS ', logs.length ? logs.join('\n') : '(none)')
ws.close()
