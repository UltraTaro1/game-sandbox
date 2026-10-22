// 抓页面加载期的真实错误
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'

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

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errs = [];
    window.addEventListener('error', e => window.__errs.push((e.message||'?') + ' @ ' + (e.filename||'') + ':' + (e.lineno||0) + ':' + (e.colno||0)));
    window.addEventListener('unhandledrejection', e => window.__errs.push('reject: ' + (e.reason && e.reason.message || e.reason)));`,
})

await send('Page.navigate', { url })
await sleep(4000)

const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    errs: window.__errs,
    demo: typeof window.__demo,
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    fps: document.getElementById('fps')?.textContent ?? 'none'
  })`,
  returnByValue: true,
})
console.log(r.result.result.value)
ws.close()
