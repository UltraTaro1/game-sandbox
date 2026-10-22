/**
 * 五子棋 AI：启发式打分 + 迭代加深的 Alpha-Beta 搜索
 * 棋盘用 Int8Array(225)：0 空 / 1 黑 / 2 白
 */
export type Cell = 0 | 1 | 2

const SIZE = 15
const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

/** 棋型分值（'1' 是自己，'2' 是对方或墙，'0' 是空位） */
const PATTERNS: [string, number][] = [
  ['11111', 5000000],
  ['011110', 300000],
  ['01111', 25000],
  ['11110', 25000],
  ['11011', 25000],
  ['11101', 25000],
  ['10111', 25000],
  ['01110', 12000],
  ['010110', 10000],
  ['011010', 10000],
  ['0111', 1200],
  ['1110', 1200],
  ['1101', 1200],
  ['1011', 1200],
  ['0110', 800],
  ['01011', 900],
  ['11010', 900],
  ['0101', 120],
  ['1010', 120],
  ['011', 80],
  ['110', 80],
  ['010', 20],
]

const idx = (x: number, y: number) => y * SIZE + x
const inBoard = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE

/** 以 (x,y) 为中心，某方向上的 9 格串 */
function lineAt(board: Int8Array, x: number, y: number, dx: number, dy: number, me: Cell): string {
  let s = ''
  for (let i = -4; i <= 4; i++) {
    const nx = x + dx * i
    const ny = y + dy * i
    if (!inBoard(nx, ny)) s += '2'
    else {
      const v = board[idx(nx, ny)]
      s += v === 0 ? '0' : v === me ? '1' : '2'
    }
  }
  return s
}

function scoreString(s: string): number {
  let total = 0
  for (const [pat, val] of PATTERNS) {
    let from = 0
    for (;;) {
      const at = s.indexOf(pat, from)
      if (at < 0) break
      total += val
      from = at + 1
    }
  }
  return total
}

/** 假设 me 落在 (x,y)，这一点的进攻价值 */
function attackScore(board: Int8Array, x: number, y: number, me: Cell): number {
  let total = 0
  for (const [dx, dy] of DIRS) total += scoreString(lineAt(board, x, y, dx, dy, me))
  return total
}

/** 综合分：进攻 + 防守（防守略低一点） */
export function moveScore(board: Int8Array, x: number, y: number, me: Cell): number {
  const opp: Cell = me === 1 ? 2 : 1
  const atk = attackScore(board, x, y, me)
  const def = attackScore(board, x, y, opp)
  return atk + def * 0.85
}

/** 只考虑已有棋子附近 2 格内的空点 */
export function candidates(board: Int8Array): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[idx(x, y)] === 0) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (!inBoard(nx, ny)) continue
          const ni = idx(nx, ny)
          if (board[ni] !== 0 || seen.has(ni)) continue
          seen.add(ni)
          out.push(ni)
        }
      }
    }
  }
  if (!out.length) out.push(idx(7, 7))
  return out
}

/** 全盘评估：me 视角 */
function evaluateBoard(board: Int8Array, me: Cell): number {
  const opp: Cell = me === 1 ? 2 : 1
  let mine = 0
  let theirs = 0
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = board[idx(x, y)]
      if (v === 0) continue
      if (v === me) mine += attackScore(board, x, y, me) * 0.02
      else theirs += attackScore(board, x, y, opp) * 0.02
    }
  }
  return mine - theirs * 0.9
}

export function isWin(board: Int8Array, x: number, y: number, who: Cell): boolean {
  for (const [dx, dy] of DIRS) {
    let count = 1
    for (const sign of [1, -1]) {
      let nx = x + dx * sign
      let ny = y + dy * sign
      while (inBoard(nx, ny) && board[idx(nx, ny)] === who) {
        count++
        nx += dx * sign
        ny += dy * sign
      }
    }
    if (count >= 5) return true
  }
  return false
}

interface Scored {
  i: number
  s: number
}

function ordered(board: Int8Array, me: Cell, limit: number): Scored[] {
  const opp: Cell = me === 1 ? 2 : 1
  const list: Scored[] = []
  for (const i of candidates(board)) {
    const x = i % SIZE
    const y = (i - x) / SIZE
    const s = moveScore(board, x, y, me) + moveScore(board, x, y, opp) * 0.15
    list.push({ i, s })
  }
  list.sort((a, b) => b.s - a.s)
  return list.slice(0, limit)
}

/** 立即能赢的点 */
function findWin(board: Int8Array, me: Cell): number {
  for (const i of candidates(board)) {
    const x = i % SIZE
    const y = (i - x) / SIZE
    board[i] = me
    const win = isWin(board, x, y, me)
    board[i] = 0
    if (win) return i
  }
  return -1
}

function negamax(
  board: Int8Array,
  depth: number,
  alpha: number,
  beta: number,
  me: Cell,
  turn: Cell,
  deadline: number,
): number {
  if (Date.now() > deadline) return evaluateBoard(board, me)
  if (depth === 0) return evaluateBoard(board, me)

  const limit = depth >= 3 ? 8 : 6
  const moves = ordered(board, turn, limit)
  if (!moves.length) return evaluateBoard(board, me)

  const maximizing = turn === me
  let best = maximizing ? -Infinity : Infinity

  for (const { i } of moves) {
    const x = i % SIZE
    const y = (i - x) / SIZE
    board[i] = turn

    let value: number
    if (isWin(board, x, y, turn)) {
      value = turn === me ? 1e7 + depth : -(1e7 + depth)
    } else {
      value = negamax(board, depth - 1, alpha, beta, me, turn === 1 ? 2 : 1, deadline)
    }
    board[i] = 0

    if (maximizing) {
      if (value > best) best = value
      if (best > alpha) alpha = best
    } else {
      if (value < best) best = value
      if (best < beta) beta = best
    }
    if (beta <= alpha) break
  }
  return best
}

export interface AiResult {
  x: number
  y: number
  score: number
  depth: number
}

/** 求最佳着法。timeMs 是思考时间上限 */
export function findBestMove(
  board: Int8Array,
  me: Cell,
  level: 'easy' | 'normal' | 'hard',
  timeMs = 800,
): AiResult | null {
  const empty = board.every((v) => v === 0)
  if (empty) return { x: 7, y: 7, score: 0, depth: 0 }

  // 1. 直接赢
  const win = findWin(board, me)
  if (win >= 0) {
    const x = win % SIZE
    return { x, y: (win - x) / SIZE, score: 1e7, depth: 0 }
  }
  // 2. 挡对方的立即胜
  const opp: Cell = me === 1 ? 2 : 1
  const block = findWin(board, opp)
  if (block >= 0) {
    const x = block % SIZE
    return { x, y: (block - x) / SIZE, score: 9e6, depth: 0 }
  }

  const depth = level === 'easy' ? 2 : level === 'normal' ? 4 : 6
  const limit = level === 'easy' ? 4 : level === 'normal' ? 10 : 14
  const deadline = Date.now() + Math.min(timeMs, level === 'hard' ? 1500 : 600)

  const moves = ordered(board, me, limit)
  if (!moves.length) return null

  // easy：按启发式直接挑，带一点随机
  if (level === 'easy') {
    const top = moves.slice(0, 3)
    const pick = top[Math.floor(Math.random() * top.length)]
    const x = pick.i % SIZE
    return { x, y: (pick.i - x) / SIZE, score: pick.s, depth }
  }

  let bestMove = moves[0]
  let bestScore = -Infinity

  for (const { i } of moves) {
    const x = i % SIZE
    const y = (i - x) / SIZE
    board[i] = me

    let value: number
    if (isWin(board, x, y, me)) {
      board[i] = 0
      return { x, y, score: 1e7, depth }
    }
    value = negamax(board, depth - 1, -Infinity, Infinity, me, opp, deadline)
    board[i] = 0

    if (value > bestScore) {
      bestScore = value
      bestMove = { i, s: value }
    }
    if (Date.now() > deadline) break
  }

  const bx = bestMove.i % SIZE
  return { x: bx, y: (bestMove.i - bx) / SIZE, score: bestScore, depth }
}
