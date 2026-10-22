# GAME SANDBOX

一个可以往里塞游戏的网页沙盒。目前包含两个完整可玩的游戏：

- **DROP ZONE** — 3D 第三人称吃鸡（两张地图、64 人、跳伞、缩圈）
- **五子棋** — 人机 / 双人，三档 AI 难度

纯前端运行，不联网，可以打包成免安装 exe。

![预览](preview.png)

---

## 怎么跑

### 方式一：双击 exe（推荐给玩家）

```
双击 启动游戏.bat
```

或进 `Sandbox-win32-x64/` 双击 `Sandbox.exe`。

> **整个 `Sandbox-win32-x64` 文件夹是一个整体**，不能只拷 exe，`resources`、`locales`、`*.dll` 都是运行时需要的。发给别人请压缩整个文件夹。

首次启动 Windows 可能弹 SmartScreen 警告（exe 没有代码签名），点「更多信息 → 仍要运行」。

### 方式二：单文件版（只有吃鸡）

双击 `drop-zone.html` 就能玩，不需要 Node 和环境。

### 方式三：开发模式

```bash
pnpm install
pnpm dev                 # http://127.0.0.1:5173
```

---

## 目录结构

```
game-sandbox/
├─ index.html                  沙盒首页
├─ vite.config.ts              三个页面入口
├─ electron/main.cjs           桌面壳：本地静态服务 + 窗口
│
├─ src/                        ← 通用层（不含任何具体游戏）
│  ├─ main.ts                  首页入口
│  ├─ style/base.css           共用样式
│  ├─ shell/                   registry 清单 · hub 首页 · types 类型
│  ├─ core/                    input 输入 · collision 碰撞
│  ├─ systems/                 audio 音效 · cameraRig 镜头 · effects 特效 · navgrid 寻路
│  └─ world/terrain.ts         地形工具
│
├─ games/                      ← 游戏层（一个游戏一个包）
│  ├─ battle-royale/
│  │  ├─ index.html            页面（HUD 标记）
│  │  ├─ main.ts               入口
│  │  ├─ game.ts               一局游戏的编排
│  │  ├─ style.css             这个游戏的样式
│  │  ├─ engine/               人机、射击、缩圈、拾取、地图、玩家、跳伞…
│  │  └─ ui/hud.ts             血条、准星、武器图标
│  └─ gomoku/
│     ├─ index.html            页面（棋盘 + 侧边面板）
│     ├─ main.ts               入口
│     ├─ game.ts               棋盘绘制、交互、对局流程
│     ├─ ai.ts                 棋型打分 + Alpha-Beta 搜索
│     └─ sound.ts              WebAudio 合成音效
│
├─ public/gomoku/wood.jpg      棋盘木纹贴图（实拍，CC0）
├─ tools/                      构建与调试脚本
├─ Sandbox-win32-x64/          打包好的 exe
└─ drop-zone.html              吃鸡单文件版
```

## 分层规则

```
沙盒外壳 (shell)  ──列出游戏、负责导航，不碰游戏内部
        ↓
游戏 (games)      ──自带页面/代码/样式，游戏之间互不依赖
        ↓
引擎 (src)        ──只提供通用能力，不依赖任何游戏
```

依赖只能是单向的：`games → src`。`src/` 里出现任何 `import games/` 就说明分层被破坏了。

---

## 加一个新游戏

**1. 建文件夹**

```
games/my-game/
├─ index.html     页面
├─ main.ts        入口（3 行）
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
      html, body { margin: 0; height: 100%; background: #070a0e; }
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
  // 渲染、循环、输入、清理，全由你自己管
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

---

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器（沙盒 + 各游戏页面） |
| `pnpm build` | 类型检查 + 打包到 `dist/` |
| `pnpm run build:single` | 生成 `drop-zone.html`（吃鸡单文件版） |
| `pnpm run pack:exe` | 打成 Windows 免安装程序 |
| `pnpm run preview` | 预览构建产物 |

### 打包 exe 的两个坑

1. pnpm 默认拦截 Electron 的安装脚本，装依赖要加参数：
   ```bash
   pnpm add -D electron @electron/packager --allow-build=electron
   ```
2. 如果网络有中间人代理，下载 Electron 二进制会报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`，打包前设一个环境变量：
   ```bash
   set NODE_TLS_REJECT_UNAUTHORIZED=0
   ```
   （只影响下载，不影响运行）

---

## 发布新版本

代码仓库只放源码，安装包走 GitHub Releases（仓库不接受单文件超 100 MB，exe 压缩后 154 MB）。

**1. 提交代码**

```bash
git add -A
git commit -m "改了什么"
git push
```

**2. 重新打包**

```bash
pnpm build
pnpm run pack:exe
```

**3. 压缩**（exe 文件夹 + 启动脚本 + 单文件版 + 说明）

```powershell
tar -a -c -f game-sandbox-win32-x64.zip "Sandbox-win32-x64" "启动游戏.bat" "drop-zone.html" "README.md"
```

**4. 发 Release**

- **网页**：仓库右侧 Releases → Draft a new release → 新建 tag（如 `v0.2.0`）→ 把 zip 拖进附件区 → Publish
- **命令行**：用 GitHub API 创建 release 再上传附件，或者直接让 AI 助手代劳

> `.gitignore` 已排除 `Sandbox-win32-x64/`、`*.zip`、`dist/`、`drop-zone.html`、`node_modules/`，不会误提交。
>
> 打包脚本的忽略规则别写死前导斜杠（`^/src` 匹配不上），要用 `/^\/?(src|games|...)(\/|$)/`，否则会把根目录的 zip 和旧 exe 一起打进 asar（曾经把 asar 从 4 MB 撑到 155 MB）。

---

## 两个游戏

### DROP ZONE（3D 吃鸡）

- 两张地图：训练场 164×164（16 人）、孤岛 640×640（64 人）
- 孤岛有山地、一条横贯全图的河（三座桥）、8 个建筑群、车辆残骸
- 全体跳伞入场：飞机 → 自由落体 → 62m 自动开伞
- 四把枪：AR-4 突击步枪、SG-9 霰弹枪、DMR 精准射手、AWM 狙击枪（带倍镜）
- 护甲吸收 60% 伤害，武器/弹药/护甲/头盔都可拾取
- 缩圈 6 个阶段，一局约 5.5 分钟

操作：`WASD` 移动 · `Shift` 冲刺 · `Space` 跳伞/跳跃 · `左键` 射击 · `右键` 瞄准 · `R` 换弹 · `1/2` 换枪 · `F` 拾取 · `M` 静音 · `Esc` 暂停

### 五子棋

- 15×15 标准棋盘，黑先
- **AI**：棋型打分（22 种棋型）+ Alpha-Beta 搜索，三档难度（2 / 4 / 6 层）
- 会主动成五、堵活四、天元开局
- 悔棋（人机模式撤两步）、重开、静音
- 棋盘用实拍木纹，棋子带高光与投影，胜利时红线标出五子

操作：点击棋盘交叉点落子。

---

## 技术细节

- **渲染**：three.js（吃鸡）/ Canvas 2D（五子棋）
- **音效**：全部 WebAudio 程序化合成，没有音频文件
- **资源**：棋盘木纹来自 ambientCG（CC0）
- **构建**：Vite 多页入口，每个游戏独立 chunk（沙盒首页 1.2 KB，吃鸡 618 KB 按需加载）

---

## 已知限制

- **exe 没有代码签名**，Windows 会提示风险
- 吃鸡的资产是程序化几何体 + 少量 CC0 模型，没有写实贴图管线
- 加游戏需要重新构建（没有运行时插件加载）
