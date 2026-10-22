// 把 game.ts 里的跳伞段落抽成 engine/drop.ts
import fs from 'node:fs'

const file = 'games/battle-royale/game.ts'
let text = fs.readFileSync(file, 'utf8')
const lines = text.split('\n')

const start = lines.findIndex((l) => l.includes('// ---------------- 跳伞 ----------------'))
const end = lines.findIndex((l, i) => i > start && l.includes('// ---------------- 重开 ----------------'))
if (start < 0 || end < 0) throw new Error('没找到跳伞段落')

const replacement = [
  '  // ---------------- 跳伞 ----------------',
  '  const drop = new DropController({ player, targets, level, rig, input, hud })',
  '',
]

const next = [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join('\n')
text = next

// 引用改名
text = text.replace(/dropPhase/g, 'drop.phase')
text = text.replace(/updateDrop\(dt\)/g, 'drop.update(dt)')
text = text.replace(/beginDrop\(\)/g, 'drop.begin()')
text = text.replace(/if \(dropPath\) \{/g, 'if (level.dropPath) {')
text = text.replace(/^\s*player\.yaw = Math\.atan2\(-planeDir\.x, -planeDir\.z\)\n/gm, '')

// 加导入
text = text.replace(
  "import { HUD } from './ui/hud'",
  "import { HUD } from './ui/hud'\nimport { DropController } from './engine/drop'",
)

fs.writeFileSync(file, text, 'utf8')
console.log('已抽取，剩余行数', text.split('\n').length)
