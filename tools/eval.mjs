// 通用求值：node tools/eval.mjs "<expression>"  或  node tools/eval.mjs --file expr.js
import fs from 'node:fs'

const args = process.argv.slice(2)
let expr = args[0] ?? '1+1'
if (args[0] === '--file') expr = fs.readFileSync(args[1], 'utf8')

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

const res = await send('Runtime.evaluate', {
  expression: expr,
  returnByValue: true,
  awaitPromise: true,
})
if (res.result?.exceptionDetails) console.error(JSON.stringify(res.result.exceptionDetails))
else console.log(JSON.stringify(res.result.result.value, null, 1))
ws.close()
