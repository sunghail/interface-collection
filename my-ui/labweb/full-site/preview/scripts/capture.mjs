// 미리보기 서버(localhost:9891, 합성 DB)에 로그인해서 화면을 PNG로 저장한다.
// 사용: node capture.mjs <outDir> <jobs.json>
//   jobs.json: [{ "name": "01-home", "path": "/", "theme": "light", "fullPage": false,
//                 "login": true, "width": 1440, "height": 1000, "waitFor": "text=...", "delay": 800,
//                 "actions": [{ "click": "selector" }, { "wait": 500 }] }]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// playwright-core 모듈 경로(또는 이름). 브라우저는 CHROME_PATH가 있으면 그것을 쓴다.
const PW = process.env.PLAYWRIGHT_CORE || 'playwright-core'
const { chromium } = require(PW)

const BASE = process.env.PREVIEW_URL || 'http://localhost:9891'
const CHROME = process.env.CHROME_PATH || undefined
const STATE_DIR = process.env.PREVIEW_STATE_DIR || path.join(os.tmpdir(), 'labweb-preview')
const login = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'preview-login.json'), 'utf8'))

const [outDir, jobsFile] = process.argv.slice(2)
if (!outDir || !jobsFile) {
  console.error('사용: node capture.mjs <outDir> <jobs.json>')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'))

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const version = browser.version()

// 사이트에 로그인 시도 제한이 있으므로 한 번 로그인한 세션을 파일로 재사용한다.
const AUTH_FILE = path.join(STATE_DIR, 'auth-state.json')

async function makeContext({ theme = 'light', width = 1440, height = 1000, loggedIn = true }) {
  const reuseSession = loggedIn && fs.existsSync(AUTH_FILE)
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: theme,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    ...(reuseSession ? { storageState: AUTH_FILE } : {}),
  })
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('theme', value)
    } catch {}
  }, theme)

  // 개발 서버의 next/image가 WebP 변환 요청에서 응답하지 않는다(PNG 요청은 즉시 응답).
  // 캡처 때만 이미지를 PNG로 받는다. 같은 원본을 같은 크기로 줄인 결과라 화면 구성은 운영과 같다.
  await context.route('**/_next/image?**', (route) =>
    route.continue({
      headers: { ...route.request().headers(), accept: 'image/png,image/*;q=0.8,*/*;q=0.5' },
    })
  )

  if (loggedIn && !reuseSession) {
    const page = await context.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'load' })
    await page.fill('input[name="email"]', login.email)
    await page.fill('input[name="password"]', login.password)
    await page.click('button[type="submit"]')
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
        timeout: 45000,
        waitUntil: 'commit',
      })
    } catch (error) {
      const message = await page
        .locator('[role="alert"], .text-red-500, .text-rose-600')
        .first()
        .textContent()
        .catch(() => null)
      throw new Error(`로그인 실패: url=${page.url()} message=${message ?? '(없음)'}`)
    }
    await page.close()
    await context.storageState({ path: AUTH_FILE })
  }
  return context
}

const contexts = new Map()
const results = []

for (const job of jobs) {
  const key = `${job.theme ?? 'light'}|${job.width ?? 1440}x${job.height ?? 1000}|${job.login !== false}`
  if (!contexts.has(key)) {
    contexts.set(
      key,
      await makeContext({
        theme: job.theme,
        width: job.width,
        height: job.height,
        loggedIn: job.login !== false,
      })
    )
  }
  const context = contexts.get(key)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  try {
    // 소개/업무 메뉴 모드는 localStorage 'navMode'로 정해진다
    await page.addInitScript((mode) => {
      try {
        localStorage.setItem('navMode', mode)
      } catch {}
    }, job.navMode ?? 'work')

    await page.goto(`${BASE}${job.path}`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {})
    if (job.login !== false && new URL(page.url()).pathname.startsWith('/login')) {
      fs.rmSync(AUTH_FILE, { force: true })
      throw new Error('세션이 만료되어 로그인 화면으로 돌아감 (저장된 세션 삭제함)')
    }
    if (job.waitFor) await page.waitForSelector(job.waitFor, { timeout: 20000 })
    for (const action of job.actions ?? []) {
      if (action.click) await page.click(action.click)
      if (action.hover) await page.hover(action.hover)
      if (action.wait) await page.waitForTimeout(action.wait)
      if (action.eval) await page.evaluate(action.eval)
    }

    // 화면 안에 보이는 이미지가 다 뜰 때까지 기다린다
    await page
      .waitForFunction(
        () =>
          [...document.images]
            .filter((img) => {
              const r = img.getBoundingClientRect()
              return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight
            })
            .every((img) => img.complete && img.naturalWidth > 0),
        null,
        { timeout: 20000 }
      )
      .catch(() => {})
    await page.waitForTimeout(job.delay ?? 1500)

    // 개발 모드에만 있는 Next.js 표시(N 배지)를 지운다. 운영 화면에는 없는 요소다.
    await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((el) => el.remove()))
    const file = path.join(outDir, `${job.name}.png`)
    await page.screenshot({ path: file, fullPage: Boolean(job.fullPage) })
    const size = fs.statSync(file).size
    results.push({ name: job.name, url: page.url().replace(BASE, ''), bytes: size, errors })
  } catch (error) {
    results.push({ name: job.name, failed: String(error.message).split('\n')[0], errors })
  } finally {
    await page.close()
  }
}

await browser.close()
console.log(JSON.stringify({ browser: `Chrome ${version}`, results }, null, 2))
