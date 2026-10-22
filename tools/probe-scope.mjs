// 验证 AWM 倍镜：武器模型、FOV、镜圈
import fs from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?map=training&autostart=1'
const out = process.argv[3] ?? '_scope.png'

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
await sleep(3500)

// 从地上找一把 AWM 装备上，然后强制进入开镜状态
const setup = await evaluate(`(async () => {
  const d = __demo
  const it = d.loot.items.find(i => i.alive && i.weapon && i.weapon.id === 'awm')
  if (!it) return 'no-awm'
  const msg = d.shooting.equip(it.weapon)
  it.alive = false; it.group.visible = false
  d.player.update = () => {}
  d.player.aiming = true
  d.player.pos.set(0, 0, 8)
  d.rig.yaw = 0
  d.rig.pitch = -0.02
  await new Promise(r => setTimeout(r, 900))
  return JSON.stringify({
    msg,
    weapon: document.getElementById('weaponName').textContent,
    fov: +__demo.camera.fov.toFixed(1),
    scopeOn: document.getElementById('scope').classList.contains('on'),
    crosshairOpacity: getComputedStyle(document.getElementById('crosshair')).opacity
  })
})()`)

await sleep(600)
const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))

// 松开右键，看是否恢复
const restored = await evaluate(`(async () => {
  const d = __demo
  d.player.aiming = false
  await new Promise(r => setTimeout(r, 900))
  return JSON.stringify({ fov: +d.camera.fov.toFixed(1), scopeOn: document.getElementById('scope').classList.contains('on') })
})()`)

console.log('SCOPE', setup)
console.log('RESET', restored)
ws.close()
