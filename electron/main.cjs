// Electron 外壳：起一个只读本地服务器，再用窗口打开 dist
const { app, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function serve(req, res) {
  let rel = decodeURIComponent((req.url || '/').split('?')[0])
  if (rel.endsWith('/')) rel += 'index.html'
  const file = path.normalize(path.join(ROOT, rel))

  // 防止跳出 dist
  if (!file.startsWith(ROOT)) {
    res.writeHead(403)
    return res.end('forbidden')
  }

  const send = (f) => {
    fs.readFile(f, (err, data) => {
      if (err) {
        res.writeHead(404)
        return res.end('not found')
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
      res.end(data)
    })
  }

  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) return send(path.join(file, 'index.html'))
    send(file)
  })
}

app.whenReady().then(() => {
  const server = http.createServer(serve)
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      backgroundColor: '#05070a',
      autoHideMenuBar: true,
      title: 'Game Sandbox',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    win.loadURL(`http://127.0.0.1:${port}/`)
    win.on('closed', () => server.close())
  })
})

app.on('window-all-closed', () => app.quit())
