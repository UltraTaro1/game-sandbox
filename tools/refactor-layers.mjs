// 分层重构：把吃鸡专有的引擎代码从 src/ 移进 games/battle-royale/，
// 让 src/ 只剩真正通用的东西。只用 Node 的文件 API，避开 PowerShell 编码问题。
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const GAME = 'games/battle-royale'

const MOVES = [
  ['src/entities/player.ts', `${GAME}/engine/player.ts`],
  ['src/entities/target.ts', `${GAME}/engine/target.ts`],
  ['src/entities/weaponModel.ts', `${GAME}/engine/weaponModel.ts`],
  ['src/systems/shooting.ts', `${GAME}/engine/shooting.ts`],
  ['src/systems/zone.ts', `${GAME}/engine/zone.ts`],
  ['src/systems/loot.ts', `${GAME}/engine/loot.ts`],
  ['src/systems/minimap.ts', `${GAME}/engine/minimap.ts`],
  ['src/world/level.ts', `${GAME}/engine/level.ts`],
  ['src/world/maps.ts', `${GAME}/engine/maps.ts`],
  ['src/world/island.ts', `${GAME}/engine/island.ts`],
  ['src/ui/hud.ts', `${GAME}/ui/hud.ts`],
]

const abs = (rel) => path.join(root, rel)
const exists = (p) => fs.existsSync(p)

// 1. 备份
if (!exists(abs('_backup_src'))) {
  fs.cpSync(abs('src'), abs('_backup_src'), { recursive: true })
  console.log('已备份 src/ → _backup_src/')
}

// 2. 记录「旧路径 → 新路径」
const moveMap = new Map()
for (const [from, to] of MOVES) {
  if (!exists(abs(from))) {
    console.log('跳过（不存在）:', from)
    continue
  }
  moveMap.set(abs(from), abs(to))
}

// 3. 物理移动
for (const [from, to] of moveMap) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
  console.log('移动', path.relative(root, from), '→', path.relative(root, to))
}

/** 把相对 import 重新算成指向新位置的写法 */
function rewrite(fileAbs, oldDirAbs) {
  let src = fs.readFileSync(fileAbs, 'utf8')
  let changed = 0

  src = src.replace(/(from\s+)(['"])([^'"]+)\2/g, (whole, pre, quote, spec) => {
    if (!spec.startsWith('.')) return whole

    const base = path.resolve(oldDirAbs, spec)
    const candidates = [base, `${base}.ts`]
    const hit = candidates.find((c) => moveMap.has(c) || (exists(c) && c.startsWith(abs('src'))))
    if (!hit) return whole

    const targetAbs = moveMap.get(hit) ?? hit
    let rel = path.relative(path.dirname(fileAbs), targetAbs).replace(/\\/g, '/')
    if (rel.endsWith('.ts')) rel = rel.slice(0, -3)
    if (!rel.startsWith('.')) rel = `./${rel}`

    const next = `${pre}${quote}${rel}${quote}`
    if (next !== whole) changed++
    return next
  })

  fs.writeFileSync(fileAbs, src, 'utf8')
  if (changed) console.log(`  改导入 ${changed} 处:`, path.relative(root, fileAbs))
}

// 4. 被移动文件的导入（用它们原来的目录来解析）
for (const [from] of moveMap) {
  const to = moveMap.get(from)
  rewrite(to, path.dirname(from))
}

// 5. 游戏入口文件的导入
const gameFile = abs(`${GAME}/game.ts`)
if (exists(gameFile)) rewrite(gameFile, path.dirname(gameFile))

// 6. 删掉插件遗留的死 CSS
const cssFile = abs('src/style.css')
const css = fs.readFileSync(cssFile, 'utf8')
const cleaned = css.replace(/\/\* -+ 插件管理 -+ \*\/[\s\S]*?\.pm-tip \{[^}]*\}\n/, '')
if (cleaned !== css) {
  fs.writeFileSync(cssFile, cleaned, 'utf8')
  console.log('已删除插件遗留 CSS，减少', css.length - cleaned.length, '字符')
}

console.log('完成')
