import type * as THREE from 'three'
import { buildLevel, type Level } from './level'
import { buildIsland } from './island'

export interface MapInfo {
  id: string
  name: string
  tag: string
  desc: string
  players: number
  size: string
  build: (scene: THREE.Scene) => Level
}

export const MAPS: MapInfo[] = [
  {
    id: 'training',
    name: '训练场',
    tag: '小地图 · 16 人',
    desc: '164×164 的平整靶场。楼少、视野开阔，适合练枪、试手感、熟悉武器。',
    players: 16,
    size: '164 × 164',
    build: (scene) => buildLevel(scene),
  },
  {
    id: 'island',
    name: '孤岛',
    tag: '大地图 · 48 人 · 跳伞',
    desc: '480×480 的海岛。群山、横贯全图的河流与三座桥，镇上停着废弃的车，坐飞机跳伞入场。',
    players: 48,
    size: '480 × 480',
    build: (scene) => buildIsland(scene),
  },
]
