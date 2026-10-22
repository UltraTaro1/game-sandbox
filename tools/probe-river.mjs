// 河流 + 全体跳伞验证
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?map=island&autostart=1'
const out = process.argv[3] ?? '_river.png'

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
await sleep(9000)

const state = await evaluate(`JSON.stringify({
  players: __demo.targets.length + 1,
  dropping: __demo.targets.filter(t => t.dropping).length,
  landed: __demo.targets.filter(t => !t.dropping).length,
  waterLevel: +(__demo.level.collision.waterLevel ?? 0).toFixed(1),
  riverBed: +__demo.level.collision.terrain.heightAt(0, 40).toFixed(1),
  bankNorth: +__demo.level.collision.terrain.heightAt(0, 75).toFixed(1),
  playerY: Math.round(__demo.player.pos.y)
})`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))

console.log('STATE', state)
console.log('LOGS ', logs.length ? logs.join('\n') : '(none)')
ws.close()
