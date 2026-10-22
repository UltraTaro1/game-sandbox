// 一局流程冒烟测试：16 人、缩圈、bot 互殴、胜利结算
import fs from 'node:fs'

const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'
const out = process.argv[3] ?? 'shot-match.png'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9222/json')).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      /* retry */
    }
    await sleep(250)
  }
  throw new Error('CDP target not found')
}

const page = await getTarget()
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
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`)
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

const start = await evaluate(`JSON.stringify({
  state: __demo.state,
  zone: { phase: __demo.zone.phase, state: __demo.zone.state, radius: +__demo.zone.radius.toFixed(1), timer: +__demo.zone.timer.toFixed(1) },
  bots: __demo.targets.length,
  hud: { alive: document.getElementById('statAlive').textContent, zone: document.getElementById('zoneHud').textContent },
  minimapPainted: (() => {
    const c = document.getElementById('minimap')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n
  })()
})`)

// 让 bot 打一会儿，看世界是不是活的
await sleep(9000)
const afterFight = await evaluate(`JSON.stringify({
  state: __demo.state,
  feedCount: document.getElementById('killfeed').children.length,
  feedText: document.getElementById('killfeed').textContent
})`)

// 强制触发缩圈
await evaluate(`(() => { __demo.zone.timer = 0.05; return true })()`)
await sleep(1500)
const shrink1 = await evaluate(
  `JSON.stringify({ state: __demo.zone.state, radius: +__demo.zone.radius.toFixed(1), timer: +__demo.zone.timer.toFixed(1) })`,
)
await sleep(3000)
const shrink2 = await evaluate(
  `JSON.stringify({ state: __demo.zone.state, radius: +__demo.zone.radius.toFixed(1), dps: __demo.zone.dps })`,
)

await send('Page.captureScreenshot', { format: 'png' }).then((r) =>
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')),
)

// 全灭 bot，验证胜利结算
const win = await evaluate(`(async () => {
  const d = __demo
  for (const t of d.targets) if (t.alive) t.takeDamage(999, false, d.player)
  await new Promise(r => setTimeout(r, 1500))
  return JSON.stringify({
    title: document.getElementById('ovTitle').textContent,
    sub: document.getElementById('ovSub').textContent,
    btn: document.getElementById('ovBtn').textContent,
    state: d.state
  })
})()`)

console.log('START ', start)
console.log('FIGHT ', afterFight)
console.log('SHRINK', shrink1, shrink2)
console.log('WIN   ', win)
console.log('LOGS  ', logs.length ? logs.join('\n') : '(none)')
ws.close()
