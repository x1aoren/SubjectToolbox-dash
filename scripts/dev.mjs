import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const npx = isWindows ? 'npx.cmd' : 'npx'

const children = [
  spawn(npx, ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit', shell: isWindows }),
  spawn(npx, ['vite'], { stdio: 'inherit', shell: isWindows }),
]

let closing = false
function shutdown(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  setTimeout(() => process.exit(code), 200)
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!closing) shutdown(code ?? 0)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
