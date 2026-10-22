// 验证单文件版本：file:// 下能否正常渲染 + 指针锁定能否生效
import fs from 'node:fs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2]
const out = process.argv[3] ?? 'shot-file.png'

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
const capture = async (file) => {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(2500)

const before = await evaluate(`JSON.stringify({
  canvas: !!document.querySelector('#app canvas'),
  overlayVisible: !document.getElementById('overlay').classList.contains('hidden'),
  btn: (() => { const r = document.getElementById('ovBtn').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] })()
})`)
await capture(out)

const b = JSON.parse(before)
// 真实点击按钮（trusted event，才允许指针锁定）
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.btn[0], y: b.btn[1], button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.btn[0], y: b.btn[1], button: 'left', clickCount: 1 })
await sleep(1200)

const after = await evaluate(`JSON.stringify({
  locked: document.pointerLockElement !== null,
  overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  fps: document.getElementById('fps').textContent,
  ammo: document.getElementById('ammoMag').textContent,
  target: document.getElementById('statAlive').textContent
})`)

// 再点一次，验证连续失败会切到"鼠标锁定失败"提示
const b2 = await evaluate(
  `(() => { const r = document.getElementById('ovBtn').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2] })()`,
)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b2[0], y: b2[1], button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b2[0], y: b2[1], button: 'left', clickCount: 1 })
await sleep(1200)

const after2 = await evaluate(`JSON.stringify({
  title: document.getElementById('ovTitle').textContent,
  sub: document.getElementById('ovSub').textContent,
  btn: document.getElementById('ovBtn').textContent
})`)

console.log('BEFORE', before)
console.log('AFTER ', after)
console.log('RETRY ', after2)
console.log('LOGS  ', logs.length ? logs.join('\n') : '(none)')
ws.close()
