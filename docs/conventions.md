# 이름 · 태그 · 보관 규칙

## 경로와 식별자

- 폴더/파일: 영문 소문자 `kebab-case`. README 제목은 한국어 사용 가능.
- 프로그램은 기능과 무관하게 고정된 slug 사용: `adsorption-workbench`.
- My UI ID: `my--<program>--<ui-slug>`.
- Reference UI ID: `ref--<creator>--<ui-slug>`.
- ID는 분류를 옮겨도 유지합니다. 제작자를 모르면 `unknown`을 쓰고 확인 뒤 ID 변경 여부를 별도 기록합니다.
- 날짜: `YYYY-MM-DD`. `created`는 최초 등록일, `updated`는 마지막 변경일.
- revision은 원본 버전/commit 또는 보관본 버전을 명시합니다. `final2`, `new-new` 같은 이름은 피합니다.
- 변경 내용은 README 이력과 Git diff에 남깁니다.

## 태그

유형은 `types`, 검색 키워드는 `tags`, 라이브러리는 `frameworks`에 기록합니다.
태그는 3–8개 권장, 영문 소문자 kebab-case로 중복 없이 사용합니다.

예: `light`, `desktop`, `responsive`, `scientific`, `drag-drop`, `keyboard`, `animation`, `accessible`, `screenshot-pending`.
유사어를 늘리지 않고 기존 [태그 색인](../catalog/by-tag.md)을 먼저 확인합니다.
상태: My UI는 `draft | ready | archived`, Reference UI는 `unreviewed | reviewed | archived`.
ready는 재사용 절차를 확인했다는 의미이며 제품 전체 품질 인증이 아닙니다.

## Screenshot / preview

- `screenshots/01-overview.png`: 대표 실제 캡처. 이것을 metadata의 `preview_image`로 지정.
- `screenshots/02-sidebar-expanded.png`: 동작/상태별 추가 캡처.
- `preview/demo.gif` 또는 `preview/demo.mp4`: 짧은 동작 영상.
- `preview/index.html`: 실행 가능한 독립 데모. 파일 더블클릭 또는 필요한 서버 명령을 README에 명시.
- GitHub README는 HTML 데모를 실행하지 않습니다. 대표 이미지는 삽입하고 HTML/영상은 링크합니다. Pages는 별도 배포 전까지 있다고 표기하지 않습니다.
- 대표 이미지는 내용이 읽히는 원본 비율로, 권장 가로 1440px. 작은 컴포넌트를 억지로 16:9로 늘리지 않습니다.
- 캡처에 viewport, 배율, 테마, UI revision, 날짜를 기록합니다.
- 개인정보, 실험 원본, 계정 정보가 포함된 화면은 샘플 데이터로 바꿉니다.
- 파일 크기는 PNG/WebP 각 2MB, GIF 5MB 정도를 목표로 합니다. 큰 영상은 별도 호스팅/저장 정책을 정한 뒤 링크합니다.
- 이미지가 없거나 외부 이미지 보관 권한이 미확인이라면 preview_image를 null로 두고 이유와 원본 preview 링크를 기록합니다.
- 외부 캡처마다 URL·제작자·캡처일·보관 근거를 `licenses/README.md`에 기록합니다.

## Source code

- My UI의 `source/`에는 실제 소스와 실행에 필요한 설정·lockfile·작은 샘플 데이터만 넣습니다.
- `node_modules`, 가상환경, 빌드 출력, EXE, 실제 측정자료, 비밀키는 넣지 않습니다.
- 단독 실행 가능 여부, 설치/실행 명령, runtime 버전, 외부 의존성, import 경로를 README에 적습니다.
- 프로그램 전체를 화면별로 복제하지 않습니다. 공통 코드는 필요할 때 프로그램 안의 `shared/`로 분리하고 실행 경로를 명시합니다.
- 일부 코드만 발췌했다면 `source.mode=excerpt`, 의존 프로젝트와 commit을 기록합니다.
- 링크만 보관하면 `source.mode=link-only`. 코드가 없는데 실행 가능한 UI라고 표시하지 않습니다.
- Reference UI의 소스는 기본 미포함. 허용되는 복사만 원본 라이선스·NOTICE와 함께 보관합니다.

## Metadata와 색인

각 항목의 `metadata.json`이 목록의 기준이며 README는 사용법과 판단 근거를 담당합니다.
색인에는 미리보기, 프로그램, 유형, 태그, 프레임워크, 상태, ID가 표시됩니다.

```sh
python tools/build_catalog.py
python tools/build_catalog.py --check
git grep -n '"scientific"' -- my-ui reference-ui
git grep -n '"react"' -- my-ui reference-ui
```

`--check`는 metadata와 필수 파일, 생성 색인의 최신 상태를 확인하며 파일을 수정하지 않습니다.
원격 URL의 유효성, 외부 라이선스 해석, 소스 실행 가능성까지 인증하는 검사는 아닙니다.

