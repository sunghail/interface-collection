// 미리보기 DB(labweb_preview)에 UI 확인용 합성 데이터를 넣는다.
// 실제 연구실 데이터는 하나도 복사하지 않는다. 모든 이름·값은 직접 만든 예시다.
// 반드시 with-preview-env.js를 통해 실행한다.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// 원본 labweb 체크아웃 경로. 예: LABWEB_DIR=/path/to/labweb
const PROJECT_DIR = process.env.LABWEB_DIR
if (!PROJECT_DIR) throw new Error('LABWEB_DIR 환경변수에 labweb 체크아웃 경로를 지정하세요.')
const req = (m) => require(path.join(PROJECT_DIR, 'node_modules', m))
const { PrismaClient } = req('@prisma/client')
const bcrypt = req('bcryptjs')

const prisma = new PrismaClient()
const os = require('os')
const STATE_DIR = process.env.PREVIEW_STATE_DIR || path.join(os.tmpdir(), 'labweb-preview')
fs.mkdirSync(STATE_DIR, { recursive: true })
const LOGIN_FILE = path.join(STATE_DIR, 'preview-login.json')

async function assertPreviewDb() {
  const [{ db }] = await prisma.$queryRawUnsafe('select current_database() as db')
  if (db !== 'labweb_preview') {
    throw new Error(`미리보기 DB가 아님: ${db}`)
  }
}

function loginSecret() {
  if (fs.existsSync(LOGIN_FILE)) return JSON.parse(fs.readFileSync(LOGIN_FILE, 'utf8'))
  const secret = {
    email: 'preview-admin@example.test',
    password: crypto.randomBytes(18).toString('base64url'),
  }
  fs.writeFileSync(LOGIN_FILE, JSON.stringify(secret, null, 2))
  return secret
}

const day = (offset, hour = 10) => {
  const d = new Date('2026-09-28T00:00:00+09:00')
  d.setDate(d.getDate() + offset)
  d.setHours(hour, 0, 0, 0)
  return d
}

async function seedUsers() {
  const { email, password } = loginSecret()
  const hash = await bcrypt.hash(password, 10)

  const people = [
    { key: 'admin', name: '홍길동', email, role: 'PHD', isAdmin: true, password: hash, bio: '흡착 공정 모델링 (예시)' },
    { key: 'prof', name: '교수 예시', email: 'professor@example.test', role: 'PROFESSOR', bio: '화학공정 설계 · 분리 공정 (예시)' },
    { key: 'phd2', name: '최지우', email: 'phd2@example.test', role: 'PHD', bio: '반응기 설계 (예시)' },
    { key: 'ms1', name: '김철수', email: 'ms1@example.test', role: 'MS', bio: '공정 시뮬레이션 (예시)' },
    { key: 'ms2', name: '이영희', email: 'ms2@example.test', role: 'MS', bio: '촉매 실험 (예시)' },
    { key: 'bs1', name: '박민수', email: 'bs1@example.test', role: 'BS', bio: '데이터 정리 (예시)' },
    {
      key: 'alumni',
      name: '정다은',
      email: 'alumni@example.test',
      role: 'ALUMNI',
      graduatedAt: day(-400),
      currentCompany: '예시화학(주)',
      currentPosition: '공정 엔지니어',
      degreeObtained: 'MS',
    },
  ]

  const users = {}
  for (const { key, ...data } of people) {
    users[key] = await prisma.user.upsert({
      where: { email: data.email },
      update: { ...data, isApproved: true },
      create: { ...data, isApproved: true, joinedAt: day(-700) },
    })
  }
  return users
}

// 목록 표시용 파일 참조. 저장소(Storage)에는 아무것도 올리지 않는다.
async function blob(name, size, mimeType, createdById) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return prisma.workspaceBlob.create({
    data: {
      bucket: 'workspace-resources',
      storagePath: `preview-synthetic/${crypto.randomUUID()}_${safe}`,
      sha256: null,
      size,
      mimeType,
      originalFilename: name,
      createdById,
    },
  })
}

const MIME = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  zip: 'application/zip',
  md: 'text/markdown',
  py: 'text/x-python',
  png: 'image/png',
  gpj: 'application/octet-stream',
}
const mimeOf = (name) => MIME[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream'

async function clearContent() {
  // 미리보기 DB 전용. assertPreviewDb()를 통과한 뒤에만 호출된다.
  await prisma.materialPartitionEntry.deleteMany({})
  await prisma.materialPartition.deleteMany({})
  await prisma.workspaceRevisionEntry.deleteMany({})
  await prisma.workspaceResource.updateMany({ data: { currentRevisionId: null } })
  await prisma.workspaceRevision.deleteMany({})
  await prisma.workspaceResource.deleteMany({})
  await prisma.workspaceSection.deleteMany({})
  await prisma.workspaceMember.deleteMany({})
  await prisma.workspace.deleteMany({})
  await prisma.workspaceBlob.deleteMany({})
  await prisma.material.deleteMany({})
  await prisma.labMeetingPresenter.deleteMany({})
  await prisma.labMeeting.deleteMany({})
  await prisma.calendarEvent.deleteMany({})
  await prisma.post.deleteMany({})
}

async function seedBoard(u) {
  const posts = [
    { type: 'NOTICE', isPinned: true, author: u.prof, title: '[공지] 10월 랩미팅 일정 및 발표 순서 안내', days: -1 },
    { type: 'NOTICE', isPinned: true, author: u.admin, title: '[공지] 공용 GC 장비 사용 예약 방법 변경', days: -6 },
    { type: 'SEMINAR', author: u.phd2, title: '세미나 정리: 흡착 등온선 모델 비교 (Langmuir vs Sips)', days: -2 },
    { type: 'FREE', author: u.ms1, title: 'Aspen Plus 수렴 안 될 때 확인할 설정 모음', days: -3 },
    { type: 'FREE', author: u.ms2, title: '촉매 시료 보관함 정리했습니다', days: -4 },
    { type: 'SEMINAR', author: u.admin, title: '세미나 자료: PSA 사이클 스케줄링 기초', days: -8 },
    { type: 'FREE', author: u.bs1, title: '실험실 공용 노트북 업데이트 완료', days: -9 },
    { type: 'FREE', author: u.ms1, title: '학회 포스터 인쇄 업체 추천 부탁드립니다', days: -12 },
  ]
  for (const post of posts) {
    await prisma.post.create({
      data: {
        type: post.type,
        isPinned: Boolean(post.isPinned),
        title: post.title,
        content: `<p>${post.title} — UI 확인용 예시 게시글입니다.</p>`,
        authorId: post.author.id,
        createdAt: day(post.days, 14),
      },
    })
  }
  return posts.length
}

// src/lib/event-categories.ts와 같은 색
const CATEGORY_COLOR = {
  SEMINAR: '#3B82F6',
  MEETING: '#10B981',
  LAB_MEETING: '#6366F1',
  DEADLINE: '#EF4444',
  TRIP: '#8B5CF6',
  VACATION: '#F59E0B',
  OTHER: '#6B7280',
}

async function seedCalendar(u) {
  const now = new Date()
  const at = (dayOfMonth, hour, minutes = 0) =>
    new Date(now.getFullYear(), now.getMonth(), dayOfMonth, hour, minutes)
  const nextMonth = (dayOfMonth, hour, minutes = 0) =>
    new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth, hour, minutes)
  const events = [
    { title: '추계 튜토리얼 (예시)', category: 'SEMINAR', start: nextMonth(2, 13), end: nextMonth(2, 17) },
    { title: '주간 랩미팅', category: 'LAB_MEETING', start: nextMonth(7, 10), end: nextMonth(7, 12) },
    { title: '연차보고 마감', category: 'DEADLINE', start: nextMonth(12, 18), end: nextMonth(12, 18), isImportant: true },
    { title: '여름 휴가 (김철수)', category: 'VACATION', start: at(4, 9), end: at(5, 18), isAllDay: true },
    { title: '주간 랩미팅', category: 'LAB_MEETING', start: at(2, 10), end: at(2, 12) },
    { title: '주간 랩미팅', category: 'LAB_MEETING', start: at(9, 10), end: at(9, 12) },
    { title: '주간 랩미팅', category: 'LAB_MEETING', start: at(16, 10), end: at(16, 12) },
    { title: '주간 랩미팅', category: 'LAB_MEETING', start: at(23, 10), end: at(23, 12) },
    { title: '추계 화학공학회 (예시)', category: 'SEMINAR', start: at(18, 9), end: at(19, 18), isAllDay: true, isImportant: true },
    { title: '과제 중간보고서 제출', category: 'DEADLINE', start: at(25, 18), end: at(25, 18), isImportant: true },
    { title: '장비 점검 (GC)', category: 'MEETING', start: at(11, 14), end: at(11, 16) },
    { title: '현장 방문', category: 'TRIP', start: at(27, 9), end: at(27, 18), isAllDay: true },
    { title: '공동연구 회의', category: 'MEETING', start: at(29, 15), end: at(29, 16, 30) },
  ]
  for (const event of events) {
    await prisma.calendarEvent.create({
      data: {
        title: event.title,
        startTime: event.start,
        endTime: event.end,
        isAllDay: Boolean(event.isAllDay),
        isImportant: Boolean(event.isImportant),
        category: event.category,
        color: CATEGORY_COLOR[event.category],
        createdById: u.admin.id,
      },
    })
  }
  return events.length
}

async function seedLabMeetings(u) {
  const meetings = [
    { title: '주간 랩미팅', days: -5, presenters: [u.admin, u.ms1], files: [
      [u.admin, 'PSA 사이클 최적화 중간 결과.pptx', 4_812_331],
      [u.ms1, '공정 시뮬레이션 진행 상황.pptx', 2_120_004],
    ] },
    { title: '주간 랩미팅', days: -12, presenters: [u.phd2, u.ms2], files: [
      [u.phd2, '반응기 온도 분포 해석.pptx', 6_302_117],
      [u.ms2, '촉매 활성 비교 실험 계획.pptx', 1_904_882],
    ] },
    { title: '논문 세미나', days: -19, presenters: [u.bs1], files: [
      [u.bs1, 'Adsorption Isotherm Review 발표.pdf', 3_551_020],
    ] },
    { title: '주간 랩미팅', days: -26, presenters: [u.admin], files: [
      [u.admin, '흡착제 후보 스크리닝 결과.pptx', 5_010_442],
    ] },
  ]

  for (const meeting of meetings) {
    const created = await prisma.labMeeting.create({
      data: {
        title: meeting.title,
        date: day(meeting.days, 10),
        description: 'UI 확인용 예시 랩미팅',
        presenters: { create: meeting.presenters.map((user) => ({ userId: user.id })) },
      },
    })
    for (const [presenter, filename, size] of meeting.files) {
      await prisma.material.create({
        data: {
          title: filename.replace(/\.[^.]+$/, ''),
          category: 'PPT',
          filename,
          url: `/api/storage/uploads/materials/preview-synthetic_${crypto.randomUUID()}`,
          size,
          mimeType: mimeOf(filename),
          uploaderId: presenter.id,
          presenterId: presenter.id,
          labMeetingId: created.id,
          createdAt: day(meeting.days, 9),
        },
      })
    }
  }
  return meetings.length
}

async function addPartitionTree(partitionId, uploaderId, tree, parent = null) {
  for (const node of tree) {
    const normalizedPath = parent ? `${parent.normalizedPath}/${node.name}` : node.name
    if (node.children) {
      const folder = await prisma.materialPartitionEntry.create({
        data: {
          partitionId,
          parentId: parent?.id ?? null,
          kind: 'FOLDER',
          name: node.name,
          normalizedPath,
          uploaderId: node.by ?? uploaderId,
          createdAt: day(node.days ?? -10, 11),
        },
      })
      await addPartitionTree(partitionId, uploaderId, node.children, folder)
    } else {
      const b = await blob(node.name, node.size, mimeOf(node.name), node.by ?? uploaderId)
      await prisma.materialPartitionEntry.create({
        data: {
          partitionId,
          parentId: parent?.id ?? null,
          kind: 'FILE',
          name: node.name,
          normalizedPath,
          blobId: b.id,
          uploaderId: node.by ?? uploaderId,
          createdAt: day(node.days ?? -8, 15),
        },
      })
    }
  }
}

async function seedPartitions(u) {
  const adsorption = await prisma.materialPartition.create({
    data: {
      name: '흡착 실험 데이터',
      description: '등온선·파과곡선 측정 원자료와 정리본 (예시 데이터)',
      emoji: '🧪',
      color: '#0EA5E9',
      category: 'DATA',
      creatorId: u.admin.id,
    },
  })
  await addPartitionTree(adsorption.id, u.admin.id, [
    {
      name: '2026-09 등온선',
      days: -14,
      children: [
        { name: 'Zeolite13X_CO2_등온선_273K_298K_323K_세온도_비교_정리본_v2_최종검토용.xlsx', size: 184_220, days: -6 },
        { name: 'Zeolite13X_N2_등온선_298K.csv', size: 22_410, days: -7, by: u.ms2.id },
        { name: '측정조건_메모.md', size: 3_210, days: -7 },
      ],
    },
    {
      name: '2026-09 파과곡선',
      days: -12,
      children: [
        { name: 'CO2_N2_혼합가스_파과곡선_298K_1bar_유량50sccm_반복측정_R1.csv', size: 1_204_331, days: -5, by: u.ms1.id },
        { name: 'CO2_N2_혼합가스_파과곡선_298K_1bar_유량50sccm_반복측정_R2.csv', size: 1_198_020, days: -5, by: u.ms1.id },
        { name: '파과곡선_그래프.png', size: 412_880, days: -4, by: u.ms1.id },
      ],
    },
    {
      name: '공정 시뮬레이션',
      days: -20,
      children: [
        { name: 'PSA_4bed_cycle.gPJ', size: 88_120, days: -9 },
        { name: 'cycle_schedule_generator.py', size: 6_540, days: -9 },
      ],
    },
    { name: '흡착제_후보_목록.xlsx', size: 48_200, days: -3, by: u.phd2.id },
    { name: 'README.md', size: 2_048, days: -15 },
  ])

  const reactor = await prisma.materialPartition.create({
    data: {
      name: 'CLC 반응기 데이터',
      description: '산소 운반체 반응 실험 기록 (예시 데이터)',
      emoji: '🔥',
      color: '#F97316',
      category: 'DATA',
      creatorId: u.phd2.id,
    },
  })
  await addPartitionTree(reactor.id, u.phd2.id, [
    { name: 'TGA_산화환원_사이클.zip', size: 8_204_110, days: -11 },
    { name: '반응기_온도분포.xlsx', size: 96_320, days: -10 },
  ])

  const other = await prisma.materialPartition.create({
    data: {
      name: '공용 양식',
      description: '보고서·발표 템플릿 (예시)',
      emoji: '📄',
      color: '#8B5CF6',
      category: 'OTHER',
      creatorId: u.prof.id,
    },
  })
  await addPartitionTree(other.id, u.prof.id, [
    { name: '연구실_발표_템플릿.pptx', size: 1_402_220, days: -30 },
    { name: '주간보고_양식.docx', size: 38_120, days: -30 },
  ])

  return { adsorption, reactor, other }
}

// 이전 버전에 같은 경로가 있으면 같은 logicalId를 이어 쓴다(실제 버전 발행과 같은 방식).
// same: true 인 파일은 이전 blob을 그대로 써서 '변경 없음'으로 보이게 한다.
async function addRevisionTree(revisionId, createdById, tree, previous, parent = null, out = new Map()) {
  for (const node of tree) {
    const normalizedPath = parent ? `${parent.normalizedPath}/${node.name}` : node.name
    const before = previous?.get(normalizedPath)
    const data = {
      revisionId,
      parentId: parent?.id ?? null,
      kind: node.children ? 'FOLDER' : 'FILE',
      name: node.name,
      normalizedPath,
      ...(before ? { logicalId: before.logicalId } : {}),
    }
    if (node.children) {
      const folder = await prisma.workspaceRevisionEntry.create({ data })
      out.set(normalizedPath, { logicalId: folder.logicalId, blobId: null })
      await addRevisionTree(revisionId, createdById, node.children, previous, folder, out)
    } else {
      const blobId =
        before && node.same
          ? before.blobId
          : (await blob(node.name, node.size, mimeOf(node.name), createdById)).id
      const file = await prisma.workspaceRevisionEntry.create({ data: { ...data, blobId } })
      out.set(normalizedPath, { logicalId: file.logicalId, blobId })
    }
  }
  return out
}

async function seedWorkspace(u) {
  const workspace = await prisma.workspace.create({
    data: {
      name: 'PSA 공정 최적화',
      description: '흡착 공정 설계 과제 협업공간 (예시)',
      members: {
        create: [
          { userId: u.admin.id, isLeader: true },
          { userId: u.phd2.id },
          { userId: u.ms1.id },
          { userId: u.ms2.id },
        ],
      },
    },
  })
  const reports = await prisma.workspaceSection.create({
    data: { workspaceId: workspace.id, name: '보고서', order: 0 },
  })
  const sims = await prisma.workspaceSection.create({
    data: { workspaceId: workspace.id, name: '시뮬레이션', order: 1 },
  })

  const resources = [
    {
      section: reports,
      title: '과제 중간보고서',
      description: '2차 연도 중간보고서 작성본',
      by: u.admin,
      versions: [
        [
          { name: '중간보고서_본문.docx', size: 912_330 },
          { name: 'figures', children: [{ name: 'Fig1_공정도.png', size: 220_410 }] },
        ],
        [
          { name: '중간보고서_본문.docx', size: 1_004_812 },
          {
            name: 'figures',
            children: [
              { name: 'Fig1_공정도.png', size: 220_410, same: true },
              { name: 'Fig2_파과곡선_비교.png', size: 301_774 },
              { name: 'Fig3_에너지_소비_비교.png', size: 254_018 },
            ],
          },
          { name: '참고문헌.bib', size: 14_220 },
        ],
      ],
    },
    {
      section: sims,
      title: '4-bed PSA 모델',
      description: 'gPROMS 모델과 사이클 스케줄',
      by: u.ms1,
      versions: [
        [
          { name: 'model', children: [{ name: 'PSA_4bed.gPJ', size: 88_120 }, { name: 'parameters.md', size: 4_310 }] },
          { name: 'cycle_schedule_generator.py', size: 6_540 },
        ],
      ],
    },
    {
      section: reports,
      title: '학회 발표 슬라이드',
      description: '추계 학회 구두 발표',
      by: u.phd2,
      versions: [[{ name: '추계학회_발표.pptx', size: 7_402_118 }]],
    },
  ]

  const created = []
  for (const r of resources) {
    const resource = await prisma.workspaceResource.create({
      data: {
        workspaceId: workspace.id,
        sectionId: r.section.id,
        title: r.title,
        description: r.description,
        type: 'FILE',
        uploaderId: r.by.id,
      },
    })

    let previous = null
    let previousPaths = null
    for (const [index, tree] of r.versions.entries()) {
      const revision = await prisma.workspaceRevision.create({
        data: {
          resourceId: resource.id,
          baseRevisionId: previous?.id ?? null,
          version: index + 1,
          status: 'PUBLISHED',
          title: index === 0 ? '초안 공유' : '그림 추가 및 본문 보완',
          createdById: r.by.id,
          publishedById: r.by.id,
          publishedAt: day(-10 + index * 4, 16),
          createdAt: day(-10 + index * 4, 15),
        },
      })
      previousPaths = await addRevisionTree(revision.id, r.by.id, tree, previousPaths)
      previous = revision
    }
    await prisma.workspaceResource.update({
      where: { id: resource.id },
      data: { currentRevisionId: previous.id },
    })
    created.push(resource)
  }

  return { workspace, resources: created }
}

async function main() {
  await assertPreviewDb()
  const users = await seedUsers()
  await clearContent()
  const posts = await seedBoard(users)
  const events = await seedCalendar(users)
  const meetings = await seedLabMeetings(users)
  const partitions = await seedPartitions(users)
  const ws = await seedWorkspace(users)

  const ids = {
    partitionData: partitions.adsorption.id,
    workspace: ws.workspace.id,
    resourceReport: ws.resources[0].id,
  }
  fs.writeFileSync(path.join(STATE_DIR, 'seed-ids.json'), JSON.stringify(ids, null, 2))
  console.log(JSON.stringify({ users: Object.keys(users).length, posts, events, meetings, ...ids }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
