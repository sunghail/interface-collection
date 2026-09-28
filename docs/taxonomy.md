# UI 유형 체계

My UI와 Reference UI 모두 같은 값을 사용합니다.

| 표시 이름 | 저장 값 | 범위 |
| --- | --- | --- |
| Dashboard | `dashboard` | 요약 카드, 지표, 대시보드 |
| Sidebar / Navigation | `sidebar-navigation` | 사이드바, 탭, 메뉴, breadcrumb |
| Settings | `settings` | 설정 화면, 환경설정 패널 |
| Modal / Dialog | `modal-dialog` | 확인창, 편집창, drawer |
| Data Visualization | `data-visualization` | 그래프, 차트, 비교 시각화 |
| Form / Input | `form-input` | 폼, 입력, slider, toggle |
| Table | `table` | 데이터 표, 열 편집, 정렬 |
| Full Layout | `full-layout` | 앱 전체 화면 구성 |
| 기타 | `other` | 위 범주에 속하지 않는 UI |

`primary_type`은 한 개, `types`는 primary_type을 포함하는 중복 없는 목록입니다.
예: 그래프 편집창은 primary_type=`modal-dialog`, types=[`modal-dialog`, `data-visualization`, `form-input`].

화면이 여러 기능을 가진다는 이유만으로 항목을 복제하지 않습니다.
재사용 단위가 다르면 전체 화면과 개별 컴포넌트를 별도 항목으로 기록하고 README에서 서로 연결합니다.
`other`에는 구체적인 태그(예: `file-browser`)를 반드시 덧붙입니다.
