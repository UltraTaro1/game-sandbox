// 用正确的 JSON 更新 release 说明
import fs from 'node:fs'

const body = fs.readFileSync('release-notes.md', 'utf8')
fs.writeFileSync('_patch.json', JSON.stringify({ body }), 'utf8')
console.log('payload bytes:', fs.statSync('_patch.json').size)
console.log('body head:', body.slice(0, 40).replace(/\n/g, ' '))
