// 用 @electron/packager 打成 Windows 免安装程序
import { packager } from '@electron/packager'

const paths = await packager({
  dir: '.',
  name: 'Sandbox',
  platform: 'win32',
  arch: 'x64',
  out: '.',
  overwrite: true,
  asar: true,
  prune: true,
  ignore: [
    // 源码、依赖、打包产物都不进 asar（前导斜杠可有可无）
    /^\/?(src|games|tools|release|public|node_modules|Sandbox-win32-x64)(\/|$)/,
    /^\/?\.git(\/|$)/,
    // 根目录的大文件 / 分发物 / 配置
    /\.zip$/,
    /\.md$/,
    /\.bat$/,
    /preview\.png$/,
    /pnpm-lock\.yaml$/,
    /pnpm-workspace\.yaml$/,
    /tsconfig\.json$/,
    /vite\.config\.ts$/,
  ],
})

console.log('输出目录:', paths)
