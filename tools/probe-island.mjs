// 大地图 + 跳伞验证
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const base = 'http://127.0.0.1:5173/'

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
const capture = async (f) => {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(f, Buffer.from(shot.result.data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })

// 1) 主页菜单
await send('Page.navigate', { url: base })
await sleep(2500)
const menu = await evaluate(`JSON.stringify({
  menu: !!document.getElementById('mapSelect'),
  cards: document.querySelectorAll('.map-card').length,
  names: [...document.querySelectorAll('.map-name')].map(e => e.textContent)
})`)
await capture('_menu.png')

// 2) 岛图 + 跳伞
await send('Page.navigate', { url: base + '?map=island&autostart=1' })
await sleep(4000)
const plane = await evaluate(`JSON.stringify({
  players: __demo.targets.length + 1,
  y: +__demo.player.pos.y.toFixed(0),
  fps: document.getElementById('fps').textContent,
  prompt: document.getElementById('pickupText').textContent
})`)
await capture('_plane.png')

// 跳伞
await evaluate(`(async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
  await new Promise(r => setTimeout(r, 80))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
  return true
})()`)
await sleep(5000)
const fall = await evaluate(`JSON.stringify({
  y: +__demo.player.pos.y.toFixed(0),
  prompt: document.getElementById('pickupText').textContent
})`)
await capture('_fall.png')
await sleep(9000)
const land = await evaluate(`JSON.stringify({
  y: +__demo.player.pos.y.toFixed(1),
  prompt: document.getElementById('pickupText').textContent,
  hp: Math.round(__demo.player.hp)
})`)

console.log('MENU ', menu)
console.log('PLANE', plane)
console.log('FALL ', fall)
console.log('LAND ', land)
console.log('LOGS ', logs.length ? logs.join('\n') : '(none)')
ws.close()
