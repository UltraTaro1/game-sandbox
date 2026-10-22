/** 沙盒里每个游戏的清单：只放元数据 + 页面地址 */
export interface GameManifest {
  id: string
  name: string
  tagline: string
  desc: string
  tags: string[]
  /** 独立页面地址（每个游戏一个 HTML） */
  href: string
}
