import type { GameManifest } from './types'

/** 想加新游戏：建一个 games/<id>/index.html + 在这里登记一行 */
export const GAMES: GameManifest[] = [
  {
    id: 'br',
    name: 'DROP ZONE',
    tagline: '第三人称吃鸡',
    desc: '两张地图、64 人、跳伞入场、缩圈结算。山地、河流、桥梁、可拾取的枪械。',
    tags: ['3D', '射击', '跳伞', '单机'],
    href: './games/battle-royale/index.html',
  },
  {
    id: 'reaction',
    name: '反应靶场',
    tagline: '点得准，打得快',
    desc: '30 秒内点掉尽可能多的靶子，连击不断分数越高。用来证明沙盒能同时装 2D 小游戏。',
    tags: ['2D', '休闲'],
    href: './games/reaction/index.html',
  },
]
