// 미리보기 전용 환경으로 명령을 실행한다.
// - DB URL을 같은 서버의 labweb_preview 데이터베이스로 바꾼다 (운영 DB 'postgres'는 절대 건드리지 않음)
// - 대상 DB 이름이 labweb_preview가 아니면 실행을 거부한다
// 사용: node with-preview-env.js <command> [args...]

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// 원본 labweb 체크아웃 경로. 예: LABWEB_DIR=/path/to/labweb
const PROJECT_DIR = process.env.LABWEB_DIR
if (!PROJECT_DIR) throw new Error('LABWEB_DIR 환경변수에 labweb 체크아웃 경로를 지정하세요.')
const PREVIEW_DB = 'labweb_preview'
const PREVIEW_PORT = process.env.PREVIEW_PORT || '9891'

const fileEnv = {}
for (const line of fs.readFileSync(path.join(PROJECT_DIR, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  fileEnv[m[1]] = v
}

function toPreviewUrl(value) {
  const url = new URL(value)
  url.pathname = `/${PREVIEW_DB}`
  return url.toString()
}

const env = { ...process.env }
env.REAL_DATABASE_URL = toPreviewUrl(fileEnv.REAL_DATABASE_URL)
env.REAL_DIRECT_URL = toPreviewUrl(fileEnv.REAL_DIRECT_URL)
env.NEXTAUTH_URL = `http://localhost:${PREVIEW_PORT}`
env.AUTH_URL = `http://localhost:${PREVIEW_PORT}`
env.NEXT_DIST_DIR = '.next-preview'

for (const key of ['REAL_DATABASE_URL', 'REAL_DIRECT_URL']) {
  const dbName = new URL(env[key]).pathname.replace(/^\//, '')
  if (dbName !== PREVIEW_DB) {
    console.error(`[preview-env] 거부: ${key}가 ${dbName}을(를) 가리킴`)
    process.exit(2)
  }
}
console.error(`[preview-env] DB=${PREVIEW_DB} port=${PREVIEW_PORT} distDir=.next-preview`)

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('사용: node with-preview-env.js <command> [args...]')
  process.exit(1)
}

const child = spawn(command, args, { cwd: PROJECT_DIR, env, stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code ?? 1))
