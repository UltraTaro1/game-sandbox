import * as THREE from 'three'
import '../../src/style/base.css'
import './style.css'
import { Input } from '../../src/core/input'
import { MAPS } from './engine/maps'
import { Player } from './engine/player'
import { Target, type Combatant } from './engine/target'
import { Effects } from '../../src/systems/effects'
import { CameraRig } from '../../src/systems/cameraRig'
import { ShootingSystem } from './engine/shooting'
import { Minimap } from './engine/minimap'
import { Zone } from './engine/zone'
import { NavGrid } from '../../src/systems/navgrid'
import { LootSystem } from './engine/loot'
import { audio } from '../../src/systems/audio'
import { HUD } from './ui/hud'
import { DropController } from './engine/drop'

const BOT_NAMES = [
  '阿豹', '老K', '小北', '铁头', '大飞', '豆子', '老六', '阿珍', '闪电', '黑桃',
  '面筋', '三石', '阿豪', '胖虎', '长枪', '夜枭', '灰狼', '铁蛋', '阿飞', '小满',
  '冷面', '南风', '北岛', '西风', '青柠', '拳王', '老猫', '海哥', '石头', '阿正',
  '红线', '木木', '阿鬼', '白鲨', '雷霆', '阿福', '岩哥', '海豚', '大壮', '阿宝',
]

/** 天空渐变贴图 */
function makeSkyTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#5f8fc4')
  grad.addColorStop(0.5, '#9dbcd8')
  grad.addColorStop(0.82, '#c2d4e2')
  grad.addColorStop(1, '#dbe6ee')
  g.fillStyle = grad
  g.fillRect(0, 0, 8, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createGame(mount: HTMLElement): void {
  // ---------------- 渲染器 ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = makeSkyTexture()
  scene.fog = new THREE.Fog(0xc2d4e2, 80, 245)

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900)
  scene.add(camera)

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  // ---------------- 地图 ----------------
  const params = new URLSearchParams(location.search)
  const chosenMap = MAPS.find((m) => m.id === params.get('map'))
  const level = (chosenMap ?? MAPS[0]).build(scene)

  if (level.bounds > 100) scene.fog = new THREE.Fog(0xc2d4e2, 160, 620)

  const TOTAL_PLAYERS = level.players
  const BOT_COUNT = TOTAL_PLAYERS - 1

  const input = new Input()
  const hud = new HUD()
  const effects = new Effects(scene)
  const rig = new CameraRig(camera, level.solids)
  const zone = new Zone(scene, level.bounds / 82, level.bounds)
  const nav = new NavGrid(level.collision, level.bounds)
  const loot = new LootSystem(scene, level.collision, level.lootCount)
  const minimap = new Minimap(
    document.getElementById('minimap') as HTMLCanvasElement,
    level.collision.boxes,
    level.bounds,
  )

  const SPAWN = level.spawn.clone()
  const player = new Player(scene)
  player.reset(SPAWN, 0)

  // ---------------- 局内状态 ----------------
  let running = false
  let paused = true
  let menuMode = false
  let matchOver = false
  let placement = TOTAL_PLAYERS
  let kills = 0
  let matchTime = 0
  let sinceDamage = 99
  let lockFailures = 0

  const aliveBots = () => targets.filter((t) => t.alive).length
  const aliveTotal = () => aliveBots() + (player.alive ? 1 : 0)

  function randomSpawn(): THREE.Vector3 {
    for (let i = 0; i < 300; i++) {
      const x = (Math.random() - 0.5) * level.bounds * 1.72
      const z = (Math.random() - 0.5) * level.bounds * 1.72
      if (level.collision.isBlocked(x, z, 0.9)) continue
      if (Math.hypot(x - player.pos.x, z - player.pos.z) < 24) continue
      const y = level.collision.supportHeight(x, z, 500, 0.55)
      return new THREE.Vector3(x, y, z)
    }
    return new THREE.Vector3(0, 0, 0)
  }

  // 每台人机分配一把不同的枪，落在枪旁边
  const gunQueue = loot.items.filter((i) => i.alive && i.kind === 'weapon')
  for (let i = gunQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = gunQueue[i]
    gunQueue[i] = gunQueue[j]
    gunQueue[j] = tmp
  }
  let gunCursor = 0

  function spawnNearWeapon(minFromPlayer: number, maxFromPlayer: number): THREE.Vector3 {
    for (let n = 0; n < gunQueue.length; n++) {
      const g = gunQueue[gunCursor % gunQueue.length]
      gunCursor++
      for (let attempt = 0; attempt < 10; attempt++) {
        const a = Math.random() * Math.PI * 2
        const r = 4 + Math.random() * 7
        const x = g.pos.x + Math.cos(a) * r
        const z = g.pos.z + Math.sin(a) * r
        if (Math.abs(x) > level.bounds - 10 || Math.abs(z) > level.bounds - 10) continue
        if (level.collision.isBlocked(x, z, 0.9)) continue
        const dp = Math.hypot(x - player.pos.x, z - player.pos.z)
        if (dp < minFromPlayer || dp > maxFromPlayer) continue
        return new THREE.Vector3(x, level.collision.supportHeight(x, z, 500, 0.55), z)
      }
    }
    return randomSpawn()
  }

  function damagePlayer(dmg: number, vignette: boolean, ignoreArmor = false): void {
    if (!player.alive || matchOver) return
    if (drop.phase !== 'ground') return
    sinceDamage = 0
    const died = player.takeDamage(dmg, ignoreArmor)
    if (vignette) {
      hud.flashDamage()
      audio.hurt()
    }
    if (died) endMatch(false)
  }

  function endMatch(win: boolean): void {
    if (matchOver) return
    matchOver = true
    placement = win ? 1 : aliveBots() + 1
    if (win) audio.win()
    else audio.lose()
    window.setTimeout(() => {
      paused = true
      input.unlock()
      showOverlay(win ? 'win' : 'dead')
    }, 900)
  }

  function onKilled(victim: Target, killer: Combatant | null): void {
    audio.death(victim.pos)
    loot.dropFrom(victim.pos)
    if (killer === player) {
      kills++
      hud.killFeed(`<span class="k">你</span> 淘汰了 ${victim.name}`)
      audio.kill()
    } else if (killer) {
      hud.killFeed(`${killer.name} 淘汰了 ${victim.name}`)
    } else {
      hud.killFeed(`${victim.name} 被安全区带走`)
    }
  }

  // ---------------- 人机 ----------------
  const targetDeps = {
    scene,
    world: level.collision,
    solids: level.solids,
    raycaster: new THREE.Raycaster(),
    effects,
    player,
    loot,
    onPlayerHit: (dmg: number) => damagePlayer(dmg, true),
    onKilled,
  }

  const targets: Target[] = []
  for (let i = 0; i < BOT_COUNT; i++) {
    const spawn = i < 4 ? spawnNearWeapon(25, 65) : spawnNearWeapon(0, 999)
    targets.push(
      new Target(targetDeps, spawn, BOT_NAMES[i % BOT_NAMES.length], 0.98 + (i % 5) * 0.022),
    )
  }

  // ---------------- 射击 ----------------
  const shooting = new ShootingSystem({
    camera,
    rig,
    player,
    effects,
    hud,
    solids: level.solids,
    targets,
  })
  shooting.onDrop = (def) => loot.dropWeapon(player.pos, def)

  // ---------------- 覆盖层 ----------------
  const overlay = document.getElementById('overlay') as HTMLDivElement
  const ovTitle = document.getElementById('ovTitle') as HTMLElement
  const ovSub = document.getElementById('ovSub') as HTMLElement
  const ovBtn = document.getElementById('ovBtn') as HTMLButtonElement
  const ovQuit = document.getElementById('ovQuit') as HTMLButtonElement
  const ovKeys = document.getElementById('ovKeys') as HTMLElement

  function resultLine(): string {
    const acc = shooting.shots > 0 ? Math.round(shooting.accuracy * 100) : 0
    return `第 ${placement} 名 / ${TOTAL_PLAYERS} · 淘汰 ${kills} 人 · 命中率 ${acc}%`
  }

  function showOverlay(mode: 'start' | 'pause' | 'dead' | 'win' | 'lockfail'): void {
    overlay.classList.remove('hidden')
    overlay.classList.toggle('dead', mode === 'dead')
    overlay.classList.toggle('win', mode === 'win')
    ovKeys.style.display = mode === 'start' || mode === 'pause' ? 'grid' : 'none'
    ovQuit.style.display =
      mode === 'pause' || mode === 'dead' || mode === 'win' ? 'inline-block' : 'none'

    if (mode === 'start') {
      ovTitle.textContent = 'DROP ZONE'
      ovSub.textContent = `${level.name} · ${TOTAL_PLAYERS} 人 · 活到最后`
      ovBtn.textContent = '点击开始'
    } else if (mode === 'pause') {
      ovTitle.textContent = '已暂停'
      ovSub.textContent = '点击画面锁定鼠标，继续游戏'
      ovBtn.textContent = '继续游戏'
    } else if (mode === 'lockfail') {
      ovTitle.textContent = '鼠标锁定失败'
      ovSub.textContent = '浏览器拦截了指针锁定，请用 Chrome / Edge 打开，或点画面再试一次'
      ovBtn.textContent = '再试一次'
    } else if (mode === 'win') {
      ovTitle.textContent = '大吉大利'
      ovSub.textContent = resultLine()
      ovBtn.textContent = '再来一局'
    } else {
      ovTitle.textContent = '你被淘汰了'
      ovSub.textContent = resultLine()
      ovBtn.textContent = '再来一局'
    }
  }

  function startGame(fromUser = true): void {
    overlay.classList.add('hidden')
    hud.show()
    audio.unlock()
    input.lock()
    paused = false
    running = true

    if (fromUser) {
      window.setTimeout(() => {
        if (running && !paused && !matchOver && !document.pointerLockElement) {
          paused = true
          lockFailures++
          showOverlay(lockFailures >= 2 ? 'lockfail' : 'pause')
        }
      }, 700)
    }
  }

  // ---------------- 跳伞 ----------------
  const drop = new DropController({ player, targets, level, rig, input, hud })

  // ---------------- 重开 ----------------
  function restart(): void {
    kills = 0
    matchOver = false
    placement = TOTAL_PLAYERS
    matchTime = 0
    sinceDamage = 99
    hud.clearFeed()
    hud.setOutside(false)
    hud.setArmor(0)
    hud.setPrompt(null)
    audio.setZoneOutside(false)
    shooting.reset()
    zone.reset()
    loot.reset()
    rig.yaw = 0
    rig.recoil = 0

    if (level.dropPath) {
      player.reset(SPAWN, 0)
      for (const t of targets) t.reset(SPAWN)
      drop.begin()
    } else {
      rig.pitch = -0.06
      player.reset(SPAWN, 0)
      for (const t of targets) t.reset(randomSpawn())
    }
  }

  overlay.addEventListener('click', () => {
    if (!running) {
      startGame()
    } else if (paused) {
      if (matchOver) restart()
      startGame()
    }
  })

  ovQuit.addEventListener('click', (e) => {
    e.stopPropagation()
    input.unlock()
    audio.setPaused(true)
    // 回到选图界面（同一页，去掉 ?map= 参数）
    location.href = './index.html'
  })

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      lockFailures = 0
      return
    }
    if (!running || matchOver) return
    paused = true
    showOverlay('pause')
  })

  document.addEventListener('pointerdown', () => audio.unlock(), { once: true })

  // ---------------- 主循环 ----------------
  const fpsEl = document.createElement('div')
  fpsEl.id = 'fps'
  document.body.appendChild(fpsEl)
  let fpsAccum = 0
  let fpsFrames = 0
  let lastTime = performance.now()

  function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function update(dt: number): void {
    matchTime += dt
    if (input.pressed('KeyM')) audio.toggleMute()

    audio.updateListener(camera)
    rig.updateInput(input.dx, input.dy)

    if (drop.phase !== 'ground') {
      drop.update(dt)
    } else {
      player.update(dt, input, rig.yaw, level.collision)
    }

    const camDist = rig.follow(dt, player.pos, player.aiming, player.sprinting)
    player.group.visible = camDist > 0.9 && drop.phase !== 'plane' && drop.phase !== 'freefall'

    shooting.update(dt, input)
    zone.update(dt)

    loot.update(dt, player.pos)
    if (drop.phase === 'ground' && player.alive && !matchOver) {
      if (input.pressed('KeyF')) {
        const msg = loot.tryPickup(shooting, player)
        if (msg) hud.killFeed(msg)
        else if (loot.nearest) hud.killFeed('没有对应口径的武器，捡不了这盒弹药')
      }
      hud.setPrompt(loot.nearest ? loot.nearest.label : null)
    } else if (drop.phase === 'ground') {
      hud.setPrompt(null)
    }

    if (player.alive && !matchOver) {
      const outside = zone.isOutside(player.pos)
      hud.setOutside(outside)
      audio.setZoneOutside(outside)
      audio.tickZone(dt, outside)
      if (outside) damagePlayer(zone.dpsNow * dt, false, true)

      sinceDamage += dt
      if (sinceDamage > 9 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 7 * dt)
      }
    }

    for (const t of targets) {
      t.update(dt, camera, targets, zone, nav)
      if (t.alive && !matchOver && zone.isOutside(t.pos)) {
        t.takeZoneDamage(zone.dpsNow * dt)
      }
    }

    if (!matchOver && player.alive && aliveBots() === 0) endMatch(true)
    effects.update(dt)

    if (level.sun) {
      level.sun.position.set(player.pos.x + 40, player.pos.y + 70, player.pos.z + 30)
      level.sun.target.position.set(player.pos.x, player.pos.y, player.pos.z)
      level.sun.target.updateMatrixWorld()
    }

    const zs = zone.statusText()
    hud.setHealth(player.hp)
    hud.setArmor(player.armor)
    hud.setStats(aliveTotal(), kills, shooting.accuracy, fmtTime(matchTime))
    hud.setZone(zs.label, zs.time, zone.state === 'shrink')
    minimap.update(dt, player, zone)

    input.endFrame()
  }

  function updateMenuCamera(now: number): void {
    const t = now * 0.00007
    const r = level.bounds * 0.42
    camera.position.set(Math.cos(t) * r, 52 + Math.sin(t * 1.7) * 7, Math.sin(t) * r)
    camera.lookAt(0, 14, 0)
    if (camera.fov !== 60) {
      camera.fov = 60
      camera.updateProjectionMatrix()
    }
  }

  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, 1 / 30)
    lastTime = now

    audio.setPaused(!running || paused)

    if (menuMode) updateMenuCamera(now)
    else if (running && !paused) update(dt)

    renderer.render(scene, camera)

    fpsAccum += dt
    fpsFrames++
    if (fpsAccum >= 0.5) {
      fpsEl.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS${audio.muted ? ' · 静音' : ''}`
      fpsAccum = 0
      fpsFrames = 0
    }
  })

  // ---------------- 选图 ----------------
  function showMapMenu(): void {
    menuMode = true
    overlay.classList.add('hidden')

    const el = document.createElement('div')
    el.id = 'mapSelect'
    el.innerHTML = `
    <div class="menu-glow"></div>
    <div class="map-inner">
      <p class="menu-kicker">BATTLE ROYALE · WEB</p>
      <h1>DROP ZONE</h1>
      <p class="map-sub">选择你的战场</p>
      <div class="map-list">
        ${MAPS.map(
          (m) => `
          <a class="map-card" href="?map=${m.id}">
            <div class="map-name">${m.name}</div>
            <div class="map-tag">${m.tag}</div>
            <p>${m.desc}</p>
            <div class="card-stats"><span>${m.size}</span><span>${m.players} 人</span></div>
            <span class="map-go">进入战场 →</span>
          </a>`,
        ).join('')}
      </div>
      <p class="menu-foot"><a class="menu-back" href="../../index.html">← 返回沙盒</a>左上角小地图 · Esc 暂停</p>
    </div>`
    document.body.appendChild(el)
  }

  // ---------------- 启动 ----------------
  rig.yaw = 0
  if (level.dropPath) {
    drop.begin()
  }
  rig.follow(0.016, player.pos, false, false)
  hud.hide()

  if (chosenMap) {
    showOverlay('start')
  } else {
    showMapMenu()
  }

  if (location.search.includes('autostart') && chosenMap) {
    startGame(false)
  }

  // 开发期调试钩子（生产构建里会被摇掉）
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__demo = {
      shooting,
      player,
      targets,
      level,
      zone,
      loot,
    }
  }
}
