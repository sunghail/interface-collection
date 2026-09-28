# My UI 작성 예시 — Adsorption 그래프 편집

아래는 **작성 방식 예시**입니다. 실제 프로그램 소스나 screenshot을 이 저장소에 등록한 상태는 아닙니다.

- 예정 경로: `my-ui/adsorption-workbench/kinetic-graph-editor/`
- ID: `my--adsorption-workbench--kinetic-graph-editor`
- 대표 유형: `modal-dialog`
- 추가 유형: `data-visualization`, `form-input`
- 태그: `light`, `desktop`, `scientific`, `screenshot-pending`
- Framework / library: Vanilla JavaScript / pywebview. 정확한 버전은 등록 시 확인.
- 상태: draft.

## README 본문 예시

### Kinetic Graph Editor

Kinetic의 점 제외, 시간 범위, Trendline을 한 화면에서 조절하는 편집 UI.

**주요 기능:** 점 선택·제외/복원, Preprocessing, 시간 구간 설정, Trendline 비교, 편집 프리셋.
**설계 의도:** 그래프를 보면서 변경 결과를 확인하고, 원본 측정 데이터와 편집 상태를 분리한다.

**재사용 후보:** 범위 입력 패널, 점 선택 상호작용, 변경 적용/취소 흐름.
**소스 범위:** 등록 전. 그래프 모델과 저장소 의존성이 있어 독립 실행 가능 여부를 별도 확인해야 한다.
**Preview:** 실제 샘플 화면 캡처 예정. 실험 원본·파일 경로는 노출하지 않는다.
**라이선스:** 미정. UI 코드와 외부 chart/font 라이선스 범위를 확인 후 기재한다.
**확인:** 아카이브 항목으로서 실행 검증은 아직 하지 않았다.

등록 시 이 예시를 복사하는 것으로 끝내지 말고 source, 실행 명령, 실제 캡처, 버전, 권리 기록을 채웁니다.
