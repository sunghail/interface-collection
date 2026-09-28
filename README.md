# Interface Collection

직접 만든 UI의 **작업 기록 · 재사용 라이브러리**와 외부 UI의 **inspiration · reference archive**를 구분해 보관합니다.

| 공간 | 목적 | 찾아보기 |
| --- | --- | --- |
| **My UI** | 프로그램별 구현, 실행 방법, 개선 이력, 재사용 범위 | [프로그램 목록](my-ui/README.md) · [전체 목록](catalog/my-ui.md) |
| **Reference UI** | 디자인 관찰, 출처, 참고한 이유, 적용 아이디어 | [분류 안내](reference-ui/README.md) · [전체 목록](catalog/reference-ui.md) |

**빠르게 찾기:** [유형별](catalog/by-type.md) · [태그별](catalog/by-tag.md)

## 구조

```text
interface-collection/
├── README.md
├── my-ui/
│   ├── README.md
│   └── <program-slug>/
│       ├── README.md
│       └── <ui-slug>/
│           ├── README.md
│           ├── metadata.json
│           ├── screenshots/
│           ├── preview/
│           ├── source/
│           └── licenses/
├── reference-ui/
│   ├── README.md
│   └── <primary-type>/
│       └── <creator-slug>--<ui-slug>/
│           ├── README.md
│           ├── metadata.json
│           ├── screenshots/
│           ├── preview/
│           └── licenses/
├── templates/
│   ├── program/
│   ├── my-ui/
│   └── reference-ui/
├── docs/
│   ├── taxonomy.md
│   ├── conventions.md
│   ├── rights.md
│   └── examples/
├── catalog/                  # metadata.json에서 생성
└── tools/build_catalog.py    # Python 표준 라이브러리만 사용
```

대표 유형은 한 개, 추가 유형과 태그는 여러 개를 사용합니다. Reference UI를 My UI로 복사하여 출처를 없애지 않습니다. 참고해서 직접 구현했다면 별도 My UI 항목을 만들고 원본을 연결합니다.

## 새 항목 추가

1. My UI의 새 프로그램은 [프로그램 템플릿](templates/program/README.md)을 복사합니다.
2. [My UI 템플릿](templates/my-ui/README.md) 또는 [Reference UI 템플릿](templates/reference-ui/README.md) 폴더 전체를 해당 위치에 복사합니다.
3. README와 `metadata.json`을 작성하고 screenshot/preview를 추가합니다.
4. 루트에서 `python tools/build_catalog.py`를 실행해 검색 색인을 갱신합니다.
5. 변경한 항목과 `catalog/`를 함께 커밋합니다.

Python은 **색인 갱신에만** 필요합니다. GitHub에서 문서와 이미지를 보는 데 설치가 필요하지 않습니다.
Windows에서는 환경에 따라 `py tools/build_catalog.py`도 사용할 수 있습니다.

## 운영 규칙

- [UI 유형 체계](docs/taxonomy.md): Dashboard부터 기타까지 공통 분류.
- [이름·태그·이미지·소스 저장](docs/conventions.md): 일관된 검색과 재사용.
- [출처·라이선스 기록](docs/rights.md): 항목별 권한과 포함 범위 구분.
- [My UI 작성 예시](docs/examples/my-ui.md) · [Reference UI 작성 예시](docs/examples/reference-ui.md).
- 템플릿·작성 예시는 실제 등록 항목이 아니며 색인에서 제외합니다.
- 실제 캡처가 없으면 `screenshot-pending` 태그로 표시합니다. 임의 이미지를 실제 화면으로 표시하지 않습니다.

## 현재 상태

2026-09-28: 아카이브 기본 구조·템플릿·색인 생성 도구 구성. 실제 UI는 아직 등록하지 않았습니다.
이 저장소 전체에 일괄 라이선스를 부여하지 않았습니다. 각 항목의 권리 기록을 확인하세요.

