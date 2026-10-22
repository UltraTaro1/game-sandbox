// 把吃鸡单独打包成一个自包含 HTML：双击即玩，不需要服务器
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const outFile = path.join(root, 'drop-zone.html')

const result = await esbuild.build({
  entryPoints: [path.join(root, 'games/battle-royale/main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15'],
  write: false,
  outdir: path.join(root, '.build-tmp'),
  define: { 'import.meta.env': '{"DEV":false}' },
  legalComments: 'none',
  logLevel: 'silent',
})

const js = result.outputFiles.find((f) => f.path.endsWith('.js'))
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))
if (!js) throw new Error('no js output')

const jsText = js.text.replace(/<\/script/gi, '<\\/script')
const cssText = (css?.text ?? '').replace(/<\/style/gi, '<\\/style')

let html = fs.readFileSync(path.join(root, 'games/battle-royale/index.html'), 'utf8')
const scriptTag = '<script type="module" src="./main.ts"></script>'
if (!html.includes(scriptTag)) throw new Error('entry script tag not found')

html = html.replace(scriptTag, () => `<script>\n${jsText}\n</script>`)
html = html.replace('</head>', () => `<style>\n${cssText}\n</style>\n</head>`)

fs.writeFileSync(outFile, html)
console.log(`drop-zone.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`)
