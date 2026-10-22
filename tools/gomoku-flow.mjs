// 真实交互：点棋盘落子 → AI 应手 → 悔棋 → 重开
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
    return
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text)
  }
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description }
  return r.result.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Page.navigate', { url: 'http://127.0.0.1:5173/games/gomoku/index.html' })
await sleep(5000)

const result = await evaluate(`(async () => {
  const cv = document.querySelector('#board')
  const r = cv.getBoundingClientRect()
  const count = () => [...__gomoku.board].filter(v => v !== 0).length

  const before = count()

  // 点天元附近（棋盘中心）
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, button: 0 }))
  await new Promise(res => setTimeout(res, 1800))

  const afterHuman = count()

  // 悔棋
  document.getElementById('undo').click()
  await new Promise(res => setTimeout(res, 300))
  const afterUndo = count()

  // 重开
  document.getElementById('restart').click()
  await new Promise(res => setTimeout(res, 300))
  const afterRestart = count()

  return JSON.stringify({ before, afterHuman, afterUndo, afterRestart })
})()`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('_gomoku2.png', Buffer.from(shot.result.data, 'base64'))

console.log('FLOW:', result)
console.log('ERRORS:', errors.length ? errors.slice(0, 2).join(' | ') : '(none)')
ws.close()
