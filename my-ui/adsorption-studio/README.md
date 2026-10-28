# Adsorption Studio · 가수분해액 액상 흡착 설계

목질계(톱밥) 묽은산 가수분해액에서 발효 저해물질(HMF, Furfural, Levulinic·Formic·Acetic acid)은 흡착제로 제거하고 당(Glucose, Xylose)은 남기는 처리 공정을 설계하는 프로그램입니다.
회분 흡착 시험 데이터(시간별 농도, 평형 측정)를 넣으면 등온식과 LDF 속도를 피팅하고, 흡착제를 비교한 뒤 회분 교반 탱크의 투입량이나 packed bed 컬럼의 크기(교체 주기 동안 목표 유지)를 계산합니다.
[Reactor Studio](../reactor-studio/README.md)를 바탕으로 만들어 화면 구조와 디자인 규칙을 그대로 따르고, 처음 쓰는 사람을 위한 **5단계 안내 화면**을 더했습니다.
이 아카이브는 **2026-10-28 기준 웹 UI**를 예시(가상) 데이터와 프로그램에 들어 있는 문헌 프리셋으로 실행해 캡처한 기록과 웹 UI 소스 전체를 보관합니다.

- 프로그램 slug: `adsorption-studio`
- 원본 repository: 미공개 (로컬 프로젝트, Git 저장소 아님)
- 기준: local snapshot 2026-10-28, 모델 버전 `b6ac074a31f8`
- 실행 환경: desktop — Windows exe(pywebview + Edge WebView2 창, 설치판·USB용 폴더) 또는 Python 서버 + 브라우저
- 공통 기술: 순수 HTML/CSS/JavaScript ES modules, 직접 작성한 SVG 차트, Python `http.server` backend(numpy, scipy)
- 공통 코드 위치: 없음. 보관 소스는 [Full Studio](full-studio/README.md)의 `source/`에 한 번만 둡니다.
- 바탕 프로그램: [Reactor Studio · Full Studio](../reactor-studio/full-studio/README.md)
- UI 목록: [프로그램별 색인](../../catalog/my-ui.md)

## 화면 구성

| UI | 역할 | 상태 |
| --- | --- | --- |
| [Full Studio](full-studio/README.md) | 5단계 안내(데이터 세팅 → 설계 조건 → 흡착제 선택 → 결과 → 저장), 흡착제 입력 창·프리셋, 설명 위젯, 피팅, 흡착제 비교, 단일 bed z/t, 공정 요약, 모든 설정 | draft |

![Adsorption Studio 1단계 데이터 세팅](full-studio/screenshots/01-guide-data.png)

## 공통 디자인 규칙

- **Reactor Studio와 같은 틀:** 밝은 회청색 바탕(`--bg #f3f5f8`)에 흰 카드, 강조색 파랑 `--accent #2f5be9`, 상단 바(상태·계산·⋯ 메뉴·모드 토글) → 왼쪽 패널 → 보기 바 → KPI 카드 → 카드형 내용. 판정 색은 충족 초록 `--ok`, 주의 주황 `--warn`, 미달 빨강 `--bad`.
- **모드 토글:** `단계별`(처음 쓰는 사람용 5단계)과 `단일 bed`(모든 화면). 단계별에서는 상단 `계산` 버튼을 숨기고 단계 안에서 계산합니다.
- **단계 바:** 번호 칩(완료 ✓, 현재 파랑, 아직 못 가는 단계는 흐리게) + 단계마다 "무엇을 할지" 한 줄 안내 + 아래쪽 `← 이전 / 다음 →`. 다음 단계에 필요한 것이 빠지면 버튼 옆에 이유를 주황 글씨로 씁니다.
- **성분 색:** Glucose 파랑, Xylose 초록, HMF 빨강, Furfural 주황, Levulinic acid 보라, Formic acid 청록, Acetic acid 갈색. 표·그래프·범례가 같은 색을 씁니다. 성분 이름은 영어, 나머지 화면 글은 한국어(교반·여과·충전·통액·감소율 같은 공정 용어).
- **설명 위젯:** 입력 항목 옆 `? 설명` 칩을 누르면 그 자리에 설명 카드(무엇인지, 어떻게 넣는지, 단위 환산표, 예시)가 뜹니다.
- **표 색칠:** 제거율 표는 제거 대상 초록, 보존 성분(당) 빨강, 무관 회색 농도로 칠하고, 성분별 최고값에 ★를 붙입니다.
- **글꼴:** Pretendard → Malgun Gothic → 시스템 글꼴 순서. 숫자는 굵게, 단위는 작게.
- **테마:** 밝은 테마 하나. 다크 모드 없음.

## 이력

- 2026-10-28: 프로그램 등록. 실제 화면 14장, 웹 UI 소스 전체(29개 파일), 캡처 재현 스크립트 보관.
