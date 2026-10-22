// 把全局 style.css 按「谁在用」拆成三份，每个模块只管自己的样式
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const cssPath = path.join(root, 'src/style.css')
const css = fs.readFileSync(cssPath, 'utf8')

/** 按顶层大括号切成一条条规则（注释会跟着所属规则走） */
function splitBlocks(text) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push(text.slice(start, i + 1))
        start = i + 1
      }
    }
  }
  if (start < text.length) out.push(text.slice(start))
  return out
}

const REACTION = [/^\.rt-/, /^@keyframes rt/]
const HUB = [/^#hub/, /^\.hub-/, /^@keyframes cardIn/]
const BR = [
  /^#hud/,
  /^#crosshair/,
  /^\.ch\b/,
  /^#hitmarker/,
  /^#scope/,
  /^\.sc-/,
  /^#topbar/,
  /^\.stat\b/,
  /^#minimap/,
  /^#zoneHud/,
  /^#killfeed/,
  /^#pickupPrompt/,
  /^#bottom/,
  /^#vitals/,
  /^#armor/,
  /^#health/,
  /^#hpText/,
  /^#weapon/,
  /^#reloadText/,
  /^#damageVignette/,
  /^#overlay/,
  /^\.panel\b/,
  /^\.keys\b/,
  /^\.hint\b/,
  /^#fps/,
  /^#app canvas/,
  /^#mapSelect/,
  /^\.map-/,
  /^\.menu-foot/,
  /^\.menu-back/,
]

const pick = (sel) => {
  if (REACTION.some((r) => r.test(sel))) return 'reaction'
  if (HUB.some((r) => r.test(sel))) return 'hub'
  if (BR.some((r) => r.test(sel))) return 'br'
  return 'base'
}

const buckets = { base: [], hub: [], br: [], reaction: [] }
for (const block of splitBlocks(css)) {
  const head = block.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim()
  if (!head) {
    buckets.base.push(block) // 纯注释块
    continue
  }
  buckets[pick(head)].push(block)
}

const files = {
  base: 'src/style/base.css',
  hub: 'src/shell/hub.css',
  br: 'games/battle-royale/style.css',
  reaction: 'games/reaction/style.css',
}

const header = {
  base: '/* 所有页面共用：reset、字体、通用按钮 */\n',
  hub: '/* 沙盒首页专用 */\n',
  br: '/* 吃鸡专用：HUD、准星、覆盖层、选图页 */\n',
  reaction: '/* 反应靶场专用 */\n',
}

for (const [key, rel] of Object.entries(files)) {
  const out = path.join(root, rel)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const body = buckets[key].join('\n').replace(/\n{3,}/g, '\n\n').trim()
  fs.writeFileSync(out, header[key] + body + '\n', 'utf8')
  console.log(`${rel}  ${body.split('\n').length} 行`)
}
