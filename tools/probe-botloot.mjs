// 人机捡枪验证
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
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(2500)

const before = await evaluate(`JSON.stringify({
  bots: __demo.targets.length,
  armed: __demo.targets.filter(t => t.armed).length,
  gunsOnGround: __demo.loot.items.filter(i => i.alive && i.kind === 'weapon').length,
  items: __demo.loot.items.filter(i => i.alive).length,
  playerSlots: __demo.shooting.slots.map(s => s ? s.def.name : null)
})`)

await sleep(25000)

const after = await evaluate(`JSON.stringify({
  armed: __demo.targets.filter(t => t.alive && t.armed).length,
  alive: __demo.targets.filter(t => t.alive).length,
  gunsOnGround: __demo.loot.items.filter(i => i.alive && i.kind === 'weapon').length,
  kinds: __demo.targets.filter(t => t.alive).reduce((m, t) => { const k = t.weaponId || 'none'; m[k] = (m[k]||0)+1; return m }, {}),
  matchOver: __demo.state.matchOver
})`)

await sleep(20000)

const later = await evaluate(`(() => {
  const d = __demo
  const guns = d.loot.items.filter(i => i.alive && i.kind === 'weapon')
  const idle = d.targets.filter(t => t.alive && !t.armed).map(t => {
    let best = 999
    for (const g of guns) best = Math.min(best, t.pos.distanceTo(g.pos))
    return {
      name: t.name,
      pos: [+t.pos.x.toFixed(0), +t.pos.z.toFixed(0)],
      goal: t.lootGoal ? [+t.lootGoal.x.toFixed(0), +t.lootGoal.z.toFixed(0)] : null,
      distNearestGun: +best.toFixed(0),
      pathLen: t.path.length,
      stuck: +t.stuckTimer.toFixed(2),
    }
  })
  return JSON.stringify({
    armed: d.targets.filter(t => t.alive && t.armed).length,
    alive: d.targets.filter(t => t.alive).length,
    guns: guns.length,
    idle
  })
})()`)

console.log('BEFORE', before)
console.log('AFTER ', after)
console.log('LATER ', later)
console.log('LOGS  ', logs.length ? logs.join('\n') : '(none)')
ws.close()
