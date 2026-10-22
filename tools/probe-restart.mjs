// 验证：重开后回到跳伞
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?map=island&autostart=1'

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
await send('Page.navigate', { url })
await sleep(6000)

const before = await evaluate(`JSON.stringify({
  y: Math.round(__demo.player.pos.y),
  dropping: __demo.targets.filter(t => t.dropping).length,
  matchOver: __demo.state.matchOver
})`)

// 模拟"再来一局"
const after = await evaluate(`(async () => {
  __demo.restart()
  await new Promise(r => setTimeout(r, 1200))
  return JSON.stringify({
    y: Math.round(__demo.player.pos.y),
    dropping: __demo.targets.filter(t => t.dropping).length,
    matchOver: __demo.state.matchOver,
    prompt: document.getElementById('pickupText').textContent,
    zonePhase: __demo.zone.phase
  })
})()`)

console.log('BEFORE', before)
console.log('AFTER ', after)
console.log('LOGS  ', logs.length ? logs.join('\n') : '(none)')
ws.close()
