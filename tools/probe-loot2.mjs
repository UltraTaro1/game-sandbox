// 拾取系统验证：提示、武器、弹药、护甲、换枪掉落
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = process.argv[2] ?? 'http://127.0.0.1:5173/?autostart=1'
const out = process.argv[3] ?? '_loot.png'

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

const PRESS_F = `
  const pressF = async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }))
    await new Promise(r => setTimeout(r, 80))
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }))
    await new Promise(r => setTimeout(r, 350))
  }
`

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(3000)

const counts = await evaluate(`JSON.stringify({
  total: __demo.loot.items.length,
  alive: __demo.loot.items.filter(i => i.alive).length,
  weapon: __demo.loot.items.filter(i => i.alive && i.kind === 'weapon').length,
  ammo: __demo.loot.items.filter(i => i.alive && i.kind === 'ammo').length,
  armor: __demo.loot.items.filter(i => i.alive && i.kind === 'armor').length,
  slots: __demo.shooting.slots.map(s => s ? s.def.name : null)
})`)

// 1) 捡一把不是 AR 的枪
const gun = await evaluate(`(async () => {
  ${PRESS_F}
  const d = __demo
  const it = d.loot.items.find(i => i.alive && i.kind === 'weapon' && i.weapon.id !== 'ar')
  d.player.pos.set(it.pos.x, 0, it.pos.z + 1.2)
  d.player.vel.set(0, 0, 0)
  await new Promise(r => setTimeout(r, 400))
  const prompt = document.getElementById('pickupText').textContent
  const shown = document.getElementById('pickupPrompt').classList.contains('on')
  await pressF()
  return JSON.stringify({
    want: it.weapon.name, prompt, shown, gone: !it.alive,
    slots: d.shooting.slots.map(s => s ? s.def.name + '(' + s.mag + '/' + s.reserve + ')' : null),
    hudWeapon: document.getElementById('weaponName').textContent,
  })
})()`)

// 2) 捡弹药
const ammo = await evaluate(`(async () => {
  ${PRESS_F}
  const d = __demo
  const it = d.loot.items.find(i => i.alive && i.kind === 'ammo' && i.caliber === 'rifle')
  const before = d.shooting.slots.filter(Boolean).filter(s => s.def.caliber === 'rifle').map(s => s.reserve)
  d.player.pos.set(it.pos.x, 0, it.pos.z + 1.2)
  d.player.vel.set(0, 0, 0)
  await new Promise(r => setTimeout(r, 400))
  const nearest = d.loot.nearest ? d.loot.nearest.label : null
  await pressF()
  const after = d.shooting.slots.filter(Boolean).filter(s => s.def.caliber === 'rifle').map(s => s.reserve)
  return JSON.stringify({ before, after, gone: !it.alive, nearest })
})()`)

// 3) 捡护甲
const armor = await evaluate(`(async () => {
  ${PRESS_F}
  const d = __demo
  const it = d.loot.items.find(i => i.alive && i.kind === 'armor')
  d.player.pos.set(it.pos.x, 0, it.pos.z + 1.2)
  d.player.vel.set(0, 0, 0)
  await new Promise(r => setTimeout(r, 400))
  await pressF()
  return JSON.stringify({
    armor: Math.round(d.player.armor),
    barShown: document.getElementById('armorBox').classList.contains('on'),
    gone: !it.alive
  })
})()`)

// 4) 两槽都满时换枪，旧枪应掉回地上
const swap = await evaluate(`(async () => {
  const d = __demo
  const before = d.loot.items.filter(i => i.alive).length
  const msg = d.shooting.equip({ id: 'dmr', name: 'DMR-7', caliber: 'rifle', color: 0x6b5a7a, damage: 42, headMult: 2.2, interval: 0.32, magSize: 10, reserve: 20, reloadTime: 2.4, spreadHip: 3.2, spreadAds: 0.12, pellets: 1, recoil: 0.02, auto: false })
  await new Promise(r => setTimeout(r, 250))
  return JSON.stringify({
    msg,
    slots: d.shooting.slots.map(s => s ? s.def.name : null),
    aliveBefore: before,
    aliveAfter: d.loot.items.filter(i => i.alive).length,
  })
})()`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
const fs = await import('node:fs')
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))

console.log('COUNT ', counts)
console.log('GUN   ', gun)
console.log('AMMO  ', ammo)
console.log('ARMOR ', armor)
console.log('SWAP  ', swap)
console.log('LOGS  ', logs.length ? logs.join('\n') : '(none)')
ws.close()
