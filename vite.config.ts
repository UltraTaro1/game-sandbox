import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // 沙盒和各游戏页面各占一个入口
      input: {
        hub: page('./index.html'),
        battleRoyale: page('./games/battle-royale/index.html'),
        gomoku: page('./games/gomoku/index.html'),
      },
    },
  },
})
