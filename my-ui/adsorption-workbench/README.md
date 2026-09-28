# Adsorption Workbench

RAT 측정파일을 정리하고 Adsorption Isotherm, Kinetics, 비교 세트와 Fitting 입력 조건을 다루는 데스크톱 프로그램입니다.
이 아카이브는 **2026-09-28 현재 V1의 웹 UI 층**을 보관합니다.

- 원본 프로젝트: [Adsorption_analysis_microtrac_RAT](https://github.com/sunghail/Adsorption_analysis_microtrac_RAT)
- 기준: 로컬 V1 수정본, `v1-local-2026-09-28`. 원격 원본 repository의 HEAD와 동일하다고 주장하지 않습니다.
- 원본 실행 환경: Python / pywebview / Windows WebView2.
- 보관본 실행 환경: HTTP 서버 + 최신 Chromium 계열 브라우저.
- 공통 기술: JavaScript, SVG, React, Bklit chart components, Motion, Visx.
- 테마: 밝은 작업 화면, 왼쪽 navigation, blue accent, 카드형 분석 영역.

| UI | 역할 | 보관 상태 |
| --- | --- | --- |
| [Full Workbench](full-workbench/README.md) | 데이터 관리·Isotherm·Kinetics·그래프 편집·비교·Fitting 조건표·설정 | 웹 UI 보관본 및 합성 데이터 preview |

![Adsorption Workbench Isotherm](full-workbench/screenshots/02-isotherm.png)

공통 소스는 Full Workbench 안에 한 번만 보관합니다. 화면별 재사용 위치는 해당 README의 파일 안내를 따릅니다.
2026-09-28: 실제 화면 7개, 소스, 의존성 기록, 실행 가능한 합성 데이터 preview 최초 등록.
