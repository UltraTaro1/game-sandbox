/**
 * 反应靶场：验证沙盒能装非 3D 的小游戏。
 * 30 秒内点掉随机出现的靶子，连击有加成。
 */
export function createGame(mount: HTMLElement): void {
  const wrap = document.createElement('div')
  wrap.className = 'rt-wrap'
  wrap.innerHTML = `
    <div class="rt-hud">
      <span>得分 <b id="rtScore">0</b></span>
      <span>连击 <b id="rtCombo">x1</b></span>
      <span>时间 <b id="rtTime">30</b></span>
    </div>
    <div class="rt-field" id="rtField"></div>
    <div class="rt-over" id="rtOver">
      <div class="rt-panel">
        <h2>时间到</h2>
        <p>最终得分 <b id="rtFinal">0</b></p>
        <div class="rt-actions">
          <button id="rtAgain">再来一局</button>
          <a href="../../index.html">返回沙盒</a>
        </div>
      </div>
    </div>`
  mount.appendChild(wrap)

  const field = wrap.querySelector('#rtField') as HTMLDivElement
  const scoreEl = wrap.querySelector('#rtScore') as HTMLElement
  const comboEl = wrap.querySelector('#rtCombo') as HTMLElement
  const timeEl = wrap.querySelector('#rtTime') as HTMLElement
  const overEl = wrap.querySelector('#rtOver') as HTMLDivElement
  const finalEl = wrap.querySelector('#rtFinal') as HTMLElement
  const againBtn = wrap.querySelector('#rtAgain') as HTMLButtonElement

  let score = 0
  let combo = 1
  let timeLeft = 30
  let spawnTimer = 0
  let tickTimer = 0
  let ended = false

  const clearTargets = () => {
    while (field.firstChild) field.removeChild(field.firstChild)
  }

  const spawn = () => {
    if (ended) return
    const t = document.createElement('div')
    t.className = 'rt-target'
    const pad = 70
    t.style.left = `${pad + Math.random() * (window.innerWidth - pad * 2)}px`
    t.style.top = `${pad + 80 + Math.random() * (window.innerHeight - pad * 2 - 120)}px`
    t.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (ended) return
      score += 10 * combo
      combo = Math.min(combo + 1, 9)
      scoreEl.textContent = String(score)
      comboEl.textContent = `x${combo}`
      t.remove()
    })
    field.appendChild(t)
    window.setTimeout(() => {
      if (t.isConnected) {
        t.remove()
        combo = 1
        comboEl.textContent = 'x1'
      }
    }, 1100)
  }

  const end = () => {
    ended = true
    window.clearInterval(spawnTimer)
    window.clearInterval(tickTimer)
    clearTargets()
    finalEl.textContent = String(score)
    overEl.classList.add('on')
  }

  const start = () => {
    ended = false
    score = 0
    combo = 1
    timeLeft = 30
    scoreEl.textContent = '0'
    comboEl.textContent = 'x1'
    timeEl.textContent = '30'
    overEl.classList.remove('on')
    clearTargets()

    spawnTimer = window.setInterval(spawn, 620)
    tickTimer = window.setInterval(() => {
      timeLeft--
      timeEl.textContent = String(Math.max(0, timeLeft))
      if (timeLeft <= 0) end()
    }, 1000)
    spawn()
  }

  againBtn.addEventListener('click', start)
  start()
}
