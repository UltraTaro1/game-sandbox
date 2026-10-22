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
    /^\/(src|games|tools|release|public|node_modules|Sandbox-win32-x64|\.git)/,
    /\.md$/,
    /preview\.png$/,
    /\.bat$/,
  ],
})

console.log('输出目录:', paths)
