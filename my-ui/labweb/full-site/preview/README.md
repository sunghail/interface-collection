# 캡처 재현

LabWeb은 서버·DB·로그인이 필요한 앱이라 이 폴더에는 바로 여는 데모가 없습니다.
대신 `screenshots/`를 만든 방법을 스크립트로 남깁니다. 운영 DB와 분리된 **미리보기 DB**에 합성 데이터를 넣고, 원본 앱을 그 DB로 실행해 찍습니다.

## 준비

- labweb 체크아웃 (commit `2c2b558`)과 그 `.env.local`
- 로컬 Supabase의 PostgreSQL (미리보기 DB를 같은 서버에 따로 만듭니다)
- Node.js, `playwright-core` 모듈, Chrome 또는 Playwright 브라우저

| 환경변수 | 뜻 | 기본값 |
| --- | --- | --- |
| `LABWEB_DIR` | labweb 체크아웃 경로 (필수) | 없음 |
| `PREVIEW_PORT` | 미리보기 서버 포트 | `9891` |
| `PREVIEW_URL` | 캡처할 주소 | `http://localhost:9891` |
| `PREVIEW_STATE_DIR` | 테스트 로그인 정보·세션·시드 id를 둘 곳 | 시스템 임시 폴더의 `labweb-preview` |
| `PLAYWRIGHT_CORE` | `playwright-core` 모듈 경로 또는 이름 | `playwright-core` |
| `CHROME_PATH` | 사용할 브라우저 실행 파일 | Playwright 기본 브라우저 |

## 순서

`with-preview-env.js`는 `.env.local`의 DB 주소에서 데이터베이스 이름만 `labweb_preview`로 바꾸고, 대상이 그 이름이 아니면 실행을 거부합니다.
`seed.js`도 쓰기 전에 `current_database()`가 `labweb_preview`인지 확인합니다.

```sh
# 1. 미리보기 DB 만들기 (운영 DB와 별개)
docker exec supabase_db_Supabase psql -U postgres -c "CREATE DATABASE labweb_preview;"

# 2. 스키마 적용 (빈 DB에 migrate deploy)
node preview/scripts/with-preview-env.js npx --package=prisma@5 prisma migrate deploy

# 3. 합성 데이터 넣기 (테스트 계정 비밀번호는 무작위로 만들어 PREVIEW_STATE_DIR에만 저장)
node preview/scripts/with-preview-env.js node preview/scripts/seed.js

# 4. 미리보기 서버 (별도 빌드 폴더 .next-preview 사용)
node preview/scripts/with-preview-env.js npx next dev -p 9891

# 5. 캡처
node preview/scripts/capture.mjs ./out ./jobs.json
```

`jobs.json`은 화면 목록입니다. 파티션·협업공간 id는 3단계가 `PREVIEW_STATE_DIR/seed-ids.json`에 남깁니다.

```json
[
  { "name": "01-home", "path": "/", "navMode": "intro", "delay": 2500 },
  { "name": "02-members", "path": "/members", "navMode": "intro", "fullPage": true },
  { "name": "03-board", "path": "/board" },
  { "name": "07-partition-folder", "path": "/materials/partition/<partitionData>?path=2026-09%20%ED%8C%8C%EA%B3%BC%EA%B3%A1%EC%84%A0" },
  { "name": "10-workspace-resource", "path": "/workspaces/<workspace>/resources/<resourceReport>?path=figures" },
  { "name": "12-home-dark", "path": "/", "navMode": "intro", "theme": "dark", "delay": 2500 },
  { "name": "13-mobile-partition", "path": "/materials/partition/<partitionData>", "width": 390, "height": 844 }
]
```

## 캡처 스크립트가 하는 일

- 1440×1000, DPR 1, `ko-KR`, `Asia/Seoul`로 고정. 테마(`theme`)와 메뉴 모드(`navMode`)는 localStorage로 지정.
- 사이트에 **로그인 시도 제한**(약 10분)이 있어 한 번 로그인한 세션을 파일로 재사용합니다. 제한에 걸리면 기다렸다 다시 실행하세요.
- 개발 서버의 `next/image`가 WebP 변환 요청에 응답하지 않아 이미지 요청만 PNG로 받습니다.
- 개발 모드 전용 Next.js 표시(`nextjs-portal`)를 캡처 직전에 지웁니다.

## 정리

```sh
docker exec supabase_db_Supabase psql -U postgres -c "DROP DATABASE labweb_preview;"
```

`next dev`를 별도 빌드 폴더로 실행하면 Next.js가 labweb의 `next-env.d.ts`와 `tsconfig.json`을 자동 수정합니다. 캡처 뒤 `git checkout -- next-env.d.ts tsconfig.json`으로 되돌리고 `.next-preview/`를 지웁니다.
