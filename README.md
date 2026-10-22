# GAME SANDBOX

一个网页游戏沙盒，每个游戏是独立页面，共用一套外壳。

目前包含：

- **DROP ZONE** — 3D 第三人称吃鸡，两张地图，支持 64 人对战
- **五子棋** — 人机 / 双人，三档 AI 难度

![预览](preview.png)

## 怎么玩

**Windows**：到 [Releases](https://github.com/UltraTaro1/game-sandbox/releases) 下载 `game-sandbox-win32-x64.zip`，解压后双击 `启动游戏.bat`。

**只想玩吃鸡**：直接双击 `drop-zone.html`，用浏览器打开即可。

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

沙盒首页从 `src/shell/registry.ts` 读取游戏列表。

## 加游戏

1. 新建 `games/你的游戏/`，写 `index.html` + `main.ts` + `game.ts`
2. 导出 `createGame(mount)` 作为入口
3. 在 `registry.ts` 登记一条
4. 在 `vite.config.ts` 的 `input` 里加一行

## 其他命令

```bash
pnpm run build:single   # 生成吃鸡单文件版
pnpm run pack:exe       # 打包 Windows 免安装程序
```

## 素材

棋盘木纹来自 [ambientCG](https://ambientcg.com)（CC0），其余为程序化生成或 WebAudio 合成。
