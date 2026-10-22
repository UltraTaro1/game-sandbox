// 冒烟测试：移动、瞄准、开火、命中判定，最后截图
import fs from 'node:fs'

const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'
const out = process.argv[3] ?? 'shot2.png'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const target = await getTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const logs = []

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
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

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails))
  return res.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(2500)

// 1) 移动测试
const move = await evaluate(`(async () => {
  const d = window.__demo
  const before = { x: d.player.pos.x, z: d.player.pos.z }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
  await new Promise(r => setTimeout(r, 900))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
  await new Promise(r => setTimeout(r, 120))
  return { before, after: { x: d.player.pos.x, z: d.player.pos.z }, onGround: d.player.onGround }
})()`)

// 2) 跳跃测试
const jump = await evaluate(`(async () => {
  const d = window.__demo
  const y0 = d.player.pos.y
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
  await new Promise(r => setTimeout(r, 60))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
  await new Promise(r => setTimeout(r, 260))
  const yTop = d.player.pos.y
  await new Promise(r => setTimeout(r, 900))
  return { y0, yTop, yEnd: d.player.pos.y }
})()`)

// 3) 瞄准 + 单发命中测试
const combat = await evaluate(`(async () => {
  const d = window.__demo
  const t = d.targets.find(t => t.kind === 'dummy' && t.alive)
  d.player.pos.set(t.pos.x + 3, 0, t.pos.z + 7)
  d.player.vel.set(0, 0, 0)

  const aim = () => {
    for (let i = 0; i < 5; i++) {
      d.rig.follow(0.016, d.player.pos, false, false)
      const c = d.camera.position
      const dx = t.pos.x - c.x, dy = (t.pos.y + 1.15) - c.y, dz = t.pos.z - c.z
      d.rig.yaw = Math.atan2(-dx, -dz)
      d.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz))
    }
    d.rig.follow(0.016, d.player.pos, false, false)
  }
  aim()
  const hpBefore = t.hp
  d.shooting.index = 0
  d.shooting.slots[0].mag = 30
  d.shooting.cooldown = 0
  d.shooting.fire()
  await new Promise(r => setTimeout(r, 100))
  return { hpBefore, hpAfter: t.hp, shots: d.shooting.shots, hits: d.shooting.hits,
           camPos: [d.camera.position.x.toFixed(2), d.camera.position.y.toFixed(2), d.camera.position.z.toFixed(2)] }
})()`)

// 4) 贴脸连射，验证击杀与击杀播报
const kill = await evaluate(`(async () => {
  const d = window.__demo
  const t = d.targets.find(t => t.kind === 'dummy' && t.alive)
  if (!t) return { skipped: true }
  d.player.pos.set(t.pos.x, 0, t.pos.z + 2.2)
  const aim = () => {
    for (let i = 0; i < 5; i++) {
      d.rig.follow(0.016, d.player.pos, false, false)
      const c = d.camera.position
      const dx = t.pos.x - c.x, dy = (t.pos.y + 1.1) - c.y, dz = t.pos.z - c.z
      d.rig.yaw = Math.atan2(-dx, -dz)
      d.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz))
      d.rig.recoil = 0
    }
    d.rig.follow(0.016, d.player.pos, false, false)
  }
  const hp0 = t.hp
  for (let i = 0; i < 8; i++) {
    aim()
    d.shooting.cooldown = 0
    d.shooting.fire()
    await new Promise(r => setTimeout(r, 130))
  }
  return { hp0, hp1: t.hp, alive: t.alive, kills: document.getElementById('statKills').textContent,
           feed: document.getElementById('killfeed').textContent }
})()`)

// 5) 截图（先摆一个好看的机位）
await evaluate(`(() => {
  const d = window.__demo
  d.player.pos.set(0, 0, -2)
  d.rig.yaw = 0.35
  d.rig.pitch = -0.08
  d.rig.recoil = 0
  d.rig.follow(0.016, d.player.pos, false, false)
  return true
})()`)
await sleep(500)

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))

const state = await evaluate(
  `JSON.stringify({ fps: document.getElementById('fps').textContent, hp: document.getElementById('hpText').textContent, calls: window.__demo && 0 })`,
)

console.log('MOVE  ', JSON.stringify(move))
console.log('JUMP  ', JSON.stringify(jump))
console.log('COMBAT', JSON.stringify(combat))
console.log('KILL  ', JSON.stringify(kill))
console.log('STATE ', state)
console.log('LOGS  ', logs.length ? logs.join('\n') : '(none)')
ws.close()
