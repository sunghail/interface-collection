---
name: archive-interface-ui
description: Register or update a program UI or external UI reference in sunghail/interface-collection, including source scope, real screenshots, metadata, rights records, searchable indexes, and authorized GitHub publication. Use for archiving UI in this repository, not ordinary UI implementation.
---

# Interface Collection 등록

대상 저장소: https://github.com/sunghail/interface-collection

사용자가 만든 UI는 **프로그램별 작업 기록·재사용 라이브러리**, 외부 UI는 **디자인 참고 아카이브**로 등록한다. 한국어로 결과를 간결하게 보고한다. 이 스킬을 읽었다는 이유만으로 새 프로젝트, UI 재설계, 다른 에이전트 메시지 발송을 시작하지 않는다.

## 1. 작업 위치와 범위 확인

- 현재 사용자가 지목한 프로그램·버전·화면을 원본으로 삼는다. 과거 작업 기록의 다음 단계는 실행 지시가 아니다.
- 원본 앱 폴더와 아카이브 체크아웃을 구분한다. 캡처용 수정·합성 데이터는 아카이브 preview나 격리 작업 공간에 두고 제품 코드를 바꾸지 않는다.
- 이 PC의 기존 체크아웃 후보는 `C:/Users/owner/Desktop/Mainproject/Adsorption/interface-collection`이다. 다른 PC에서는 이 경로를 가정하지 않는다.
- 후보에서 `git remote get-url origin`, `git status --short`, `git branch --show-current`로 저장소·기존 변경을 확인한다. HTTPS/SSH 표기는 달라도 소유자와 저장소가 sunghail/interface-collection인지 확인한다.
- 없으면 사용자가 허용한 작업 공간의 별도 폴더로 대상 저장소를 clone한다. 기존 다른 저장소의 remote를 교체하지 않는다.
- 같은 프로그램/UI의 metadata와 기존 README를 먼저 찾아 갱신 여부를 결정한다. 항목이 있으면 대개 그 경로와 ID를 유지한다.

## 2. 저장소의 현재 양식 읽기

확인한 아카이브 루트에서 다음을 읽는다. 이 스킬의 예시보다 실제 저장소의 최신 양식이 우선이다.

1. `README.md`, `docs/taxonomy.md`, `docs/conventions.md`.
2. 해당 `templates/my-ui/` 또는 `templates/reference-ui/`의 README와 metadata.
3. 권리 기록이 필요한 파일 범위에 맞춰 `docs/rights.md`.
4. 스키마·검사 문제가 생기면 `tools/build_catalog.py`.

실제 등록 예시는 `my-ui/adsorption-workbench/full-workbench/`에 있다. 이 예시의 프로그램 이름, 온도, 라이브러리, 7개 캡처 수, 브라우저 버전 등을 새 항목에 그대로 옮기지 않는다.

## 3. 경로 선택 후 자료 정리

[references/registration.md](references/registration.md)를 읽고 해당 모드의 절차를 수행한다.

| 구분 | 항목 경로 | ID |
| --- | --- | --- |
| My UI | `my-ui/<program-slug>/<ui-slug>/` | `my--<program-slug>--<ui-slug>` |
| Reference UI | `reference-ui/<primary-type>/<creator-slug>--<ui-slug>/` | `ref--<creator-slug>--<ui-slug>` |

대표 유형은 하나, 추가 유형은 `types`, 검색 키워드는 `tags`로 표현한다. 여러 유형에 해당한다고 같은 소스를 복제하지 않는다. 동작하는 전체 화면이 한 덩어리이면 full-workbench 같은 한 항목으로 먼저 보관해도 된다.

필수 결과:
- 항목 README, 완성된 metadata, 권리 기록.
- 가능한 경우 실제 UI 캡처와 동작하는 preview. 캡처 불가이면 사유와 미완료 상태를 정확히 적는다.
- My UI의 소스 또는 정확한 소스 링크, 실행 환경·기능·재사용 위치·의존성·검증 한계.
- Reference UI의 원본 URL·제작자·repository·license·확인일·참고 이유.
- 신규 프로그램 README 또는 기존 프로그램의 목록 갱신.

## 4. 검증과 게시

[references/publishing.md](references/publishing.md)를 읽고 변경 범위에 필요한 검사와 게시를 수행한다.

루트의 `tools/build_catalog.py`로 색인을 생성한다. 생성된 catalog를 손으로 편집하지 않는다. 메인 README는 발견성을 위한 실제 항목 링크와 현황만 필요한 만큼 갱신한다.

업로드를 요청받았거나 현재 대화에서 게시 권한이 이미 주어졌다면 준비·검증 후 진행한다. 양식 설명이나 로컬 정리만 요청했다면 원격 push로 확대하지 않는다. 스킬 호출 자체가 모든 향후 게시를 승인하는 것은 아니다.

## 완료 보고

- 등록한 GitHub 항목 링크와 저장 경로.
- 포함한 화면·소스·preview, 실측/개인 데이터 제외 여부.
- 실제 확인한 동작과 남은 제약.
- 원격 게시 확인 또는 로컬 준비까지만 완료했는지 구분.
- 다른 에이전트가 계속할 경우 원본 버전, 항목 경로, 미완료 부분만 짧게 남긴다.

코드 전체나 장황한 Git 로그를 채팅에 붙이지 않는다.
