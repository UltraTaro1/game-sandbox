// 验证：暂停界面退出按钮 + 暂停静音
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?map=training'

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
await sleep(2500)
// 点开始 -> headless 下指针锁定失败 -> 自动落到暂停页
const btn = JSON.parse(await evaluate(`(() => { const r = document.getElementById('ovBtn').getBoundingClientRect(); return JSON.stringify([r.x + r.width/2, r.y + r.height/2]) })()`))
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn[0], y: btn[1], button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn[0], y: btn[1], button: 'left', clickCount: 1 })
await sleep(2000)

// headless 里指针锁定会失败，正好落到暂停页
const paused = await evaluate(`JSON.stringify({
  overlayVisible: !document.getElementById('overlay').classList.contains('hidden'),
  quitShown: getComputedStyle(document.getElementById('ovQuit')).display !== 'none',
  quitRect: (() => { const r = document.getElementById('ovQuit').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] })(),
  title: document.getElementById('ovTitle').textContent,
  paused: __demo.audio.paused,
  gain: __demo.audio.ctx ? +__demo.audio.master.gain.value.toFixed(3) : 'n/a'
})`)

const p = JSON.parse(paused)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.quitRect[0], y: p.quitRect[1], button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.quitRect[0], y: p.quitRect[1], button: 'left', clickCount: 1 })
await sleep(3000)

const after = await evaluate(`JSON.stringify({
  url: location.search,
  menu: !!document.getElementById('mapSelect'),
  cards: document.querySelectorAll('.map-card').length
})`)

console.log('PAUSED', paused)
console.log('AFTER ', after)
ws.close()
