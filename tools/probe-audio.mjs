// 验证音频：上下文状态、播放计数、是否报错
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
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push(`[console.error] ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`)
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
await sleep(3000)

const before = await evaluate(`JSON.stringify({
  ctx: __demo.audio.ctx ? __demo.audio.ctx.state : 'none',
  played: __demo.audio.played
})`)

// 真实点击一次，唤醒音频
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 450, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 450, button: 'left', clickCount: 1 })
await sleep(600)

const unlocked = await evaluate(`JSON.stringify({
  ctx: __demo.audio.ctx ? __demo.audio.ctx.state : 'none',
  sampleRate: __demo.audio.ctx?.sampleRate ?? 0,
  played: __demo.audio.audio === undefined ? __demo.audio.played : __demo.audio.played
})`)

// 打几枪 + 跑几步，看看是否真的在出声
await evaluate(`(async () => {
  const d = __demo
  for (let i = 0; i < 4; i++) {
    d.shooting.cooldown = 0
    d.shooting.fire()
    await new Promise(r => setTimeout(r, 120))
  }
  d.audio.step(true); d.audio.step(true)
  d.audio.reloadStart(); d.audio.reloadEnd()
  d.audio.hit(true); d.audio.kill(); d.audio.hurt()
  return true
})()`)
await sleep(500)

const after = await evaluate(`JSON.stringify({
  ctx: __demo.audio.ctx?.state ?? 'none',
  played: __demo.audio.played,
  muted: __demo.audio.muted
})`)

// 用 AnalyserNode 接在 master 上，验证真的输出了非零波形
const levels = await evaluate(`(async () => {
  const a = __demo.audio
  const an = a.ctx.createAnalyser()
  an.fftSize = 2048
  a.master.connect(an)
  const buf = new Float32Array(an.fftSize)
  const T = __demo.THREE

  const sample = async (ms) => {
    let peak = 0, sum = 0, n = 0
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      an.getFloatTimeDomainData(buf)
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i])
        if (v > peak) peak = v
        sum += buf[i] * buf[i]
        n++
      }
      await new Promise(r => setTimeout(r, 16))
    }
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / Math.max(1, n)).toFixed(4) }
  }

  const out = {}
  a.shot('rifle', undefined, true)
  out.rifle = await sample(200)
  await new Promise(r => setTimeout(r, 350))
  a.shot('shotgun', undefined, true)
  out.shotgun = await sample(320)
  await new Promise(r => setTimeout(r, 350))
  const far = new T.Vector3(a.listenerPos.x + 40, a.listenerPos.y, a.listenerPos.z)
  a.shot('rifle', far, false)
  out.far40m = await sample(220)
  a.master.disconnect(an)
  return JSON.stringify(out)
})()`)

console.log('BEFORE', before)
console.log('UNLOCK', unlocked)
console.log('AFTER ', after)
console.log('LEVELS', levels)
console.log('LOGS  ', logs.length ? logs.join('\n') : '(none)')
ws.close()
