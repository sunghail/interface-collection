# Reactor Studio · 바이오디젤 전이에스테르화 반응기 설계

폐식용유를 바이오디젤로 바꾸는 2단계 packed bed 공정(산촉매 수지 bed로 유리지방산을 에스테르화하고 분리기로 물을 뺀 뒤, CaO bed에서 트리글리세리드를 전이에스테르화)을 설계하는 프로그램입니다.
조건을 바꾸면 bed 크기·체류시간·촉매량·압력강하·전환율·산가를 바로 다시 계산하고, 비누화에 의한 촉매 수명, 속도식 피팅, 시나리오 비교, 최적 조건 탐색까지 한 화면 구조에서 다룹니다.
이 아카이브는 **2026-10-28 기준 웹 UI**를 기본 조건과 합성 예제 데이터로 실행해 캡처한 기록과 웹 UI 소스 전체를 보관합니다.

- 프로그램 slug: `reactor-studio`
- 원본 repository: 미공개 (로컬 프로젝트, Git 저장소 아님)
- 기준: local snapshot 2026-10-28, 모델 버전 `919b03253bbc`
- 실행 환경: desktop — Windows exe(pywebview + Edge WebView2 창) 또는 Python 서버 + 브라우저
- 공통 기술: 순수 HTML/CSS/JavaScript ES modules, 직접 작성한 SVG 차트, Python `http.server` backend(numpy, scipy, CasADi)
- 공통 코드 위치: 없음. 보관 소스는 [Full Studio](full-studio/README.md)의 `source/`에 한 번만 둡니다.
- UI 목록: [프로그램별 색인](../../catalog/my-ui.md)

## 화면 구성

| UI | 역할 | 상태 |
| --- | --- | --- |
| [Full Studio](full-studio/README.md) | 공정 요약·흐름도, 속성 시트, 모든 설정 서랍, 단일 bed z/t, 비누화, 속도 피팅, 직접 구성, 판정 기준, 시나리오 비교, 최적화, 변수 sweep | draft |

![Reactor Studio 공정 요약](full-studio/screenshots/01-process-summary.png)

## 공통 디자인 규칙

- **색:** 밝은 회청색 바탕(`--bg #f3f5f8`)에 흰 카드, 강조색 파랑 `--accent #2f5be9`. 상단 모드 토글의 선택 상태는 본문 글자색(`#1a1f29`). 산촉매 bed는 주황, CaO bed는 파랑으로 흐름도·표·그래프 범례에서 같은 색을 씁니다.
- **판정 색:** 충족 초록, 주의 주황, 미달 빨강. KPI 카드 윗줄·판정 표·흐름도 글자가 같은 색 규칙을 따릅니다.
- **구조:** 상단 바(상태 표시·계산·⋯ 메뉴·`단일 bed / 공정` 토글) → 왼쪽 속성 시트 → 보기 바(segmented 버튼) → KPI 카드 줄 → 카드형 내용.
- **글꼴:** Pretendard → Malgun Gothic → 시스템 글꼴 순서. 숫자는 굵게, 단위는 작게.
- **그래프:** 성분별 고정 색(TG 파랑, FAME 초록, FFA 빨강, 메탄올 청록, 글리세롤 보라, 물 주황 점선, 칼슘 비누 갈색 점선). 오른쪽 축 계열은 범례에 "(오른쪽 축)"을 붙입니다.
- **테마:** 밝은 테마 하나. 다크 모드 없음.

## 이력

- 2026-10-28: 프로그램 등록. 실제 화면 13장, 웹 UI 소스 전체, 캡처 재현 스크립트 보관.
