import { findBestMove, isWin, type Cell } from './ai'
import { sound } from './sound'

const SIZE = 15
const EMPTY = 0
const BLACK: Cell = 1
const WHITE: Cell = 2

type Mode = 'ai' | 'pvp'
type Level = 'easy' | 'normal' | 'hard'

export function createGame(mount: HTMLElement): void {
  // ---------------- 画布 ----------------
  const canvas = document.createElement('canvas')
  canvas.id = 'board'
  mount.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const wood = new Image()
  let woodReady = false
  wood.onload = () => {
    woodReady = true
    draw()
  }
  wood.src = '/gomoku/wood.jpg'

  let size = 0 // 画布边长（CSS 像素）
  let pad = 0 // 棋盘留白
  let cell = 0 // 格距

  function resize(): void {
    const rect = mount.getBoundingClientRect()
    size = Math.floor(Math.min(rect.width, rect.height))
    const dpr = Math.min(window.devicePixelRatio, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    pad = size * 0.055
    cell = (size - pad * 2) / (SIZE - 1)
    draw()
  }

  // ---------------- 状态 ----------------
  const board = new Int8Array(SIZE * SIZE)
  let turn: Cell = BLACK
  let mode: Mode = 'ai'
  let level: Level = 'normal'
  let history: { x: number; y: number }[] = []
  let winner: Cell | 0 = 0
  let winLine: { x: number; y: number }[] = []
  let thinking = false
  let hover: { x: number; y: number } | null = null
  let lastMove: { x: number; y: number } | null = null
  const humanColor: Cell = BLACK

  const at = (x: number, y: number) => board[y * SIZE + x]
  const put = (x: number, y: number, who: Cell) => {
    board[y * SIZE + x] = who
  }

  // ---------------- 绘制 ----------------
  function px(i: number): number {
    return pad + i * cell
  }

  function drawStone(x: number, y: number, who: Cell, alpha = 1): void {
    const cx = px(x)
    const cy = px(y)
    const r = cell * 0.42
    ctx.save()
    ctx.globalAlpha = alpha

    // 阴影
    ctx.beginPath()
    ctx.arc(cx + r * 0.12, cy + r * 0.16, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(20,12,4,0.35)'
    ctx.filter = `blur(${r * 0.12}px)`
    ctx.fill()
    ctx.filter = 'none'

    // 棋子本体
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r)
    if (who === BLACK) {
      g.addColorStop(0, '#6b6b72')
      g.addColorStop(0.45, '#1e1e22')
      g.addColorStop(1, '#050506')
    } else {
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.55, '#eceae4')
      g.addColorStop(1, '#b9b5ab')
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()

    // 高光
    const hl = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, 0, cx - r * 0.38, cy - r * 0.42, r * 0.55)
    hl.addColorStop(0, who === BLACK ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)')
    hl.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = hl
    ctx.fill()

    ctx.restore()
  }

  function draw(): void {
    if (!size) return
    // 木纹底
    if (woodReady) {
      ctx.drawImage(wood, 0, 0, size, size)
      ctx.fillStyle = 'rgba(90,52,20,0.18)'
      ctx.fillRect(0, 0, size, size)
    } else {
      const bg = ctx.createLinearGradient(0, 0, size, size)
      bg.addColorStop(0, '#d8a35e')
      bg.addColorStop(1, '#b57b3a')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, size, size)
    }

    // 暗角
    const vig = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.72)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.32)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, size, size)

    // 网格
    ctx.strokeStyle = 'rgba(48,30,12,0.72)'
    ctx.lineWidth = Math.max(1, size * 0.0012)
    for (let i = 0; i < SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(px(0), px(i))
      ctx.lineTo(px(SIZE - 1), px(i))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px(i), px(0))
      ctx.lineTo(px(i), px(SIZE - 1))
      ctx.stroke()
    }

    // 星位
    ctx.fillStyle = 'rgba(40,24,8,0.85)'
    for (const [sx, sy] of [
      [3, 3],
      [11, 3],
      [3, 11],
      [11, 11],
      [7, 7],
    ]) {
      ctx.beginPath()
      ctx.arc(px(sx), px(sy), Math.max(2, cell * 0.08), 0, Math.PI * 2)
      ctx.fill()
    }

    // 棋子
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = at(x, y)
        if (v) drawStone(x, y, v as Cell)
      }
    }

    // 最后一手
    if (lastMove && !winner) {
      ctx.beginPath()
      ctx.arc(px(lastMove.x), px(lastMove.y), cell * 0.1, 0, Math.PI * 2)
      ctx.fillStyle = '#ff4d3d'
      ctx.fill()
    }

    // 悬停预览
    if (hover && !winner && !thinking && at(hover.x, hover.y) === EMPTY) {
      drawStone(hover.x, hover.y, mode === 'ai' ? humanColor : turn, 0.45)
    }

    // 胜利连线
    if (winLine.length >= 5) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,80,60,0.9)'
      ctx.lineWidth = cell * 0.12
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(255,80,60,0.8)'
      ctx.shadowBlur = cell * 0.5
      ctx.beginPath()
      ctx.moveTo(px(winLine[0].x), px(winLine[0].y))
      const end = winLine[winLine.length - 1]
      ctx.lineTo(px(end.x), px(end.y))
      ctx.stroke()
      ctx.restore()
    }
  }

  // ---------------- 胜负 ----------------
  function checkWin(x: number, y: number, who: Cell): boolean {
    if (!isWin(board, x, y, who)) return false
    // 找出连成一线的五子
    const dirs: [number, number][] = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]
    for (const [dx, dy] of dirs) {
      const line: { x: number; y: number }[] = [{ x, y }]
      for (const sign of [1, -1]) {
        let nx = x + dx * sign
        let ny = y + dy * sign
        while (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && at(nx, ny) === who) {
          line.push({ x: nx, y: ny })
          nx += dx * sign
          ny += dy * sign
        }
      }
      if (line.length >= 5) {
        line.sort((a, b) => a.x - b.x || a.y - b.y)
        winLine = line
        return true
      }
    }
    return true
  }

  function endGame(who: Cell): void {
    winner = who
    if (mode === 'pvp') {
      setStatus(who === BLACK ? '黑棋胜利' : '白棋胜利')
      sound.win()
    } else if (who === humanColor) {
      setStatus('你赢了')
      sound.win()
    } else {
      setStatus('电脑赢了')
      sound.lose()
    }
    draw()
  }

  function place(x: number, y: number): boolean {
    if (winner || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false
    if (at(x, y) !== EMPTY) return false

    put(x, y, turn)
    history.push({ x, y })
    lastMove = { x, y }
    sound.place(turn === WHITE)

    if (checkWin(x, y, turn)) {
      draw()
      endGame(turn)
      return true
    }

    turn = turn === BLACK ? WHITE : BLACK
    draw()
    updateStatus()

    if (mode === 'ai' && turn !== humanColor && !winner) {
      thinking = true
      updateStatus()
      window.setTimeout(() => {
        const move = findBestMove(board, turn as Cell, level, level === 'hard' ? 1500 : 700)
        thinking = false
        if (!move) return
        put(move.x, move.y, turn)
        history.push({ x: move.x, y: move.y })
        lastMove = { x: move.x, y: move.y }
        sound.place(turn === WHITE)
        if (checkWin(move.x, move.y, turn)) {
          draw()
          endGame(turn)
          return
        }
        turn = turn === BLACK ? WHITE : BLACK
        draw()
        updateStatus()
      }, 60)
    }
    return true
  }

  // ---------------- 交互 ----------------
  function pick(e: PointerEvent): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const x = Math.round((mx - pad) / cell)
    const y = Math.round((my - pad) / cell)
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null
    const dx = mx - px(x)
    const dy = my - px(y)
    if (Math.hypot(dx, dy) > cell * 0.62) return null
    return { x, y }
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = pick(e)
    const changed = (p?.x !== hover?.x) || (p?.y !== hover?.y)
    hover = p
    if (changed) draw()
  })
  canvas.addEventListener('pointerleave', () => {
    hover = null
    draw()
  })
  canvas.addEventListener('pointerdown', (e) => {
    sound.unlock()
    if (winner || thinking) return
    if (mode === 'ai' && turn !== humanColor) return
    const p = pick(e)
    if (!p) return
    if (!place(p.x, p.y)) sound.nope()
  })

  // ---------------- 面板 ----------------
  const panel = document.getElementById('panel') as HTMLElement
  panel.innerHTML = `
    <h1>五子棋</h1>
    <p id="status" class="status">黑棋先行</p>
    <div class="group">
      <span class="label">对手</span>
      <button data-mode="ai" class="on">人机</button>
      <button data-mode="pvp">双人</button>
    </div>
    <div class="group">
      <span class="label">难度</span>
      <button data-level="easy">简单</button>
      <button data-level="normal" class="on">普通</button>
      <button data-level="hard">困难</button>
    </div>
    <div class="group">
      <button id="undo">悔棋</button>
      <button id="restart">重开</button>
      <button id="mute">静音</button>
    </div>
    <p class="tips">点击棋盘落子</p>`

  const statusEl = panel.querySelector('#status') as HTMLElement
  const setStatus = (t: string) => {
    statusEl.textContent = t
  }
  const updateStatus = () => {
    if (winner) return
    if (thinking) return setStatus('电脑思考中…')
    if (mode === 'pvp') return setStatus(turn === BLACK ? '黑棋回合' : '白棋回合')
    setStatus(turn === humanColor ? '你的回合（黑）' : '电脑回合（白）')
  }

  panel.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      mode = (b as HTMLElement).dataset.mode as Mode
      panel.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b))
      restart()
    })
  })
  panel.querySelectorAll('[data-level]').forEach((b) => {
    b.addEventListener('click', () => {
      level = (b as HTMLElement).dataset.level as Level
      panel.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('on', x === b))
      updateStatus()
    })
  })

  function restart(): void {
    board.fill(0)
    history = []
    winner = 0
    winLine = []
    lastMove = null
    turn = BLACK
    thinking = false
    draw()
    updateStatus()
    if (mode === 'ai' && turn !== humanColor) {
      // 人机模式下玩家执黑，永远先手，这里不用处理
    }
  }

  function undo(): void {
    if (!history.length) return
    const steps = mode === 'ai' ? 2 : 1
    for (let i = 0; i < steps && history.length; i++) {
      const last = history.pop()!
      put(last.x, last.y, EMPTY)
    }
    winner = 0
    winLine = []
    lastMove = history.length ? history[history.length - 1] : null
    turn = (history.length % 2 === 0 ? BLACK : WHITE) as Cell
    thinking = false
    sound.undo()
    draw()
    updateStatus()
  }

  ;(panel.querySelector('#undo') as HTMLButtonElement).addEventListener('click', undo)
  ;(panel.querySelector('#restart') as HTMLButtonElement).addEventListener('click', () => {
    restart()
    sound.undo()
  })
  ;(panel.querySelector('#mute') as HTMLButtonElement).addEventListener('click', (e) => {
    const muted = sound.toggle()
    ;(e.currentTarget as HTMLElement).textContent = muted ? '开音' : '静音'
  })

  // ---------------- 启动 ----------------
  window.addEventListener('resize', resize)
  resize()
  updateStatus()

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__gomoku = {
      board,
      place,
      findBestMove,
      get turn() {
        return turn
      },
      get winner() {
        return winner
      },
      restart,
    }
  }
}
