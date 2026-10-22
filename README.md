# GAME SANDBOX

一个网页游戏沙盒。所有游戏都从同一个首页进入，每个游戏是独立页面，共用一套外壳和基础能力。

目前包含：

- **DROP ZONE** — 3D 第三人称吃鸡（两张地图，最多 64 人）
- **五子棋** — 人机 / 双人，三档 AI 难度

![预览](preview.png)

## 怎么玩

到 [Releases](https://github.com/UltraTaro1/game-sandbox/releases) 下载 `game-sandbox-win32-x64.zip`，解压后双击 `启动游戏.bat`，浏览器风格的窗口会打开沙盒首页。

首页列出所有游戏，点哪个进哪个，游戏里可以随时返回沙盒。

> 整个 `Sandbox-win32-x64` 文件夹要一起拷贝，不能只拿 exe。
> 首次运行 Windows SmartScreen 可能提示，点「更多信息 → 仍要运行」。

## 开发

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm build      # 构建到 dist/
```

## 结构

```
src/          沙盒外壳 + 通用能力（输入、碰撞、音效、寻路）
games/        每个游戏一个文件夹，自带页面、代码和样式
  battle-royale/
  gomoku/
electron/     桌面壳
```

依赖是单向的：`games → src`。`src/` 不引用任何具体游戏。

沙盒首页从 `src/shell/registry.ts` 读取游戏列表。

## 加一个新游戏

**1. 建文件夹**

```
games/my-game/
├─ index.html     页面
├─ main.ts        入口
└─ game.ts        实现
```

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>我的游戏</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: #070a0e;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`main.ts`：

```ts
import { createGame } from './game'

const mount = document.getElementById('app')
if (mount) createGame(mount)
```

`game.ts`：

```ts
export function createGame(mount: HTMLElement): void {
  mount.innerHTML = '<h1 style="color:#fff">我的游戏</h1>'
  // 渲染、循环、输入，全由你自己管
}
```

**2. 登记**

`src/shell/registry.ts` 加一条：

```ts
{
  id: 'my-game',
  name: '我的游戏',
  tagline: '一句话介绍',
  desc: '详细一点的描述',
  tags: ['2D', '休闲'],
  href: './games/my-game/index.html',
}
```

**3. 加页面入口**

`vite.config.ts` 的 `rollupOptions.input` 里加一行：

```ts
myGame: page('./games/my-game/index.html'),
```

**4.** `pnpm dev` 打开首页，卡片就出来了。

想复用引擎能力（3D、碰撞、音效、寻路），直接从 `src/` 里 import，参考吃鸡的写法。

## 其他命令

```bash
pnpm run pack:exe       # 打包 Windows 免安装程序到项目根目录
pnpm run build:single   # 额外生成一份吃鸡的单文件 HTML
```

## 技术细节

- **渲染**：three.js（吃鸡）/ Canvas 2D（五子棋）
- **音效**：全部 WebAudio 程序化合成，不依赖音频文件
- **构建**：Vite 多页入口，每个游戏独立 chunk。沙盒首页只有 1.2 KB，吃鸡 618 KB 按需加载
- **物理**：自写的 AABB 碰撞，没有引入物理引擎
- **AI**：五子棋用棋型打分 + Alpha-Beta 搜索（2 / 4 / 6 层三档）

## 已知限制

- exe 没有代码签名，Windows 会提示风险
- 吃鸡的资产是程序化几何体 + 少量 CC0 模型，没有写实贴图管线
- 加游戏需要重新构建，没有运行时插件加载
- 没有移动端适配，吃鸡需要键盘鼠标
