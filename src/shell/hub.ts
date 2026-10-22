import { GAMES } from './registry'
import type { GameManifest } from './types'

const card = (g: GameManifest) => `
  <a class="hub-card" href="${g.href}">
    <div class="hub-name">${g.name}</div>
    <div class="hub-tagline">${g.tagline}</div>
    <p>${g.desc}</p>
    <div class="card-stats">${g.tags.map((t) => `<span>${t}</span>`).join('')}</div>
    <span class="map-go">开始 →</span>
  </a>`

/** 沙盒首页：列出所有已登记的游戏 */
export function showHub(): void {
  const el = document.createElement('div')
  el.id = 'hub'
  el.innerHTML = `
    <div class="hub-glow"></div>
    <div class="hub-inner">
      <p class="menu-kicker">GAME SANDBOX</p>
      <h1>SANDBOX</h1>
      <p class="map-sub">选一个游戏开玩</p>
      <div class="hub-grid">${GAMES.map(card).join('')}</div>
      <p class="menu-foot">每个游戏独立加载</p>
    </div>`
  document.body.appendChild(el)
}
