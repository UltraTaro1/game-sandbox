// 验证 AI：必须能挡活四 / 自己有四子时直接成五
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
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

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('_gomoku.png', Buffer.from(shot.result.data, 'base64'))

const test = await evaluate(`(() => {
  const S = 15
  const mk = (cells) => { const b = new Int8Array(S*S); for (const [x,y,c] of cells) b[y*S+x] = c; return b }
  const out = {}

  // 1. 黑有四子 (3..6,7)，轮到白（2）→ 必须挡在 (2,7) 或 (7,7)
  const b1 = mk([[3,7,1],[4,7,1],[5,7,1],[6,7,1]])
  const r1 = __gomoku.findBestMove(b1, 2, 'hard', 800)
  out.blockFour = r1 ? [r1.x, r1.y] : null

  // 2. 白有四子 (3..6,7)，轮到白 → 必须直接成五 (2,7) 或 (7,7)
  const b2 = mk([[3,7,2],[4,7,2],[5,7,2],[6,7,2]])
  const r2 = __gomoku.findBestMove(b2, 2, 'hard', 800)
  out.winFive = r2 ? [r2.x, r2.y] : null

  // 3. 空白棋盘 → 应该走天元 (7,7)
  const b3 = new Int8Array(S*S)
  const r3 = __gomoku.findBestMove(b3, 1, 'hard', 500)
  out.empty = r3 ? [r3.x, r3.y] : null

  return JSON.stringify(out)
})()`)

console.log('AI:', test)
ws.close()
