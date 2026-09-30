# 등록 자료 정리

## 공통 경로와 metadata

모든 경로는 확인한 interface-collection 루트 기준이다.

```text
my-ui/<program>/<ui>/
  README.md
  metadata.json
  screenshots/01-overview.png
  preview/index.html           # 실행 가능한 데모가 있을 때
  source/                      # 소스 보관 시
  licenses/README.md
reference-ui/<type>/<creator>--<ui>/
  README.md
  metadata.json
  screenshots/                 # 보관 근거 확인한 이미지
  preview/                     # 보관 근거 확인한 데모
  licenses/README.md
```

새 항목은 해당 template 폴더를 복사한다. 기존 항목 전체에 template을 덮어쓰지 않는다.
템플릿의 모든 자리표시자와 example.com 예시 URL을 실제 값이나 확인 불가 설명으로 교체한다.
metadata의 날짜는 YYYY-MM-DD, created는 최초 등록일 유지, updated는 이번 수정일이다.

유형 값:
`dashboard`, `sidebar-navigation`, `settings`, `modal-dialog`,
`data-visualization`, `form-input`, `table`, `full-layout`, `other`.

- primary_type이 types에 포함되어야 한다.
- ID·경로·program 값은 현재 검증기 규칙과 일치해야 한다.
- 태그는 기존 catalog/by-tag.md를 먼저 보고 kebab-case로 3–8개 정도를 선택한다.
- frameworks에는 실제 사용한 의존성만 적는다. 참고한 디자인 시스템을 사용 framework로 둔갑시키지 않는다.
- 캡처가 없으면 preview_image=null, screenshot-pending 태그, README에 이유를 남긴다.
- preview_url은 실제 HTTP(S) 데모 주소가 있을 때만 쓴다. 로컬 preview/index.html 경로를 URL인 것처럼 입력하지 않는다.
- 상태 My UI: draft/ready/archived, Reference: unreviewed/reviewed/archived.
- 필수값과 enum의 최종 기준은 현재 template과 build_catalog.py이다.

## My UI: 원본 확인과 최소한의 재사용 가능 보관

1. **프로그램 선택:** 프로젝트의 README/작업 기록에서 현재 실행판·소스 위치를 확인한다. v1/v2, 배포판과 개발 소스가 다를 수 있다. UI 아카이브의 과거 snapshot을 현재 앱으로 착각하지 않는다.
2. **등록 단위:** 전체 앱 하나 + 화면별 screenshot이 기본적으로 유용하다. 별도 재사용 단위가 명확한 컴포넌트만 독립 항목으로 만든다. 공통 코드 복사본을 화면마다 만들지 않는다.
3. **소스 선별:** UI와 실행에 필요한 core/services/storage, CSS, 자산, build 설정, package/lockfile 등 실제 의존 범위를 읽고 선택한다. 앱마다 디렉터리 구조가 다르므로 Adsorption의 파일 목록을 일반화하지 않는다.
4. **제외:** 사용자 Vault/프로필, 개인 경로가 들어간 설정, 실제 측정파일, 토큰, .env 비밀값, 로그, 논문, EXE, node_modules, 가상환경, 관련 없는 backend는 기본 제외한다. 전체 프로젝트를 재귀 복사한 뒤 지우는 방식보다 포함할 경로를 정해서 복사한다.
5. **빌드된 preview:** 원칙적으로 불필요한 빌드 출력은 제외한다. 설치 없이 미리보기에 필요한 작은 JS/CSS 번들은 범위를 설명하고 포함할 수 있다. 해당 고지·라이선스도 함께 보관한다.
6. **실행 범위:** source.mode=standalone은 필요한 UI가 단독 실행 가능할 때, excerpt는 프로젝트 일부·backend 의존성이 남을 때, link-only는 파일 대신 원본 링크를 보관할 때 쓴다. 작동하지 않는 원본 test 명령을 남기지 말고 제외 사유를 기록한다.
7. **버전:** 원본 commit이 있으면 정확한 값, 미커밋/비 Git 소스라면 local snapshot 날짜를 기록한다. 원격 HEAD와 동일하다고 추측하지 않는다.

프로그램 README는 templates/program을 사용해 `my-ui/<program>/README.md`에 둔다.
항목 README에는 다음을 실제 확인한 내용으로 채운다.

- 역할·주요 기능·설계 의도.
- screenshot과 캡처 조건.
- framework/library 이름·확인한 버전.
- 실행 디렉터리·설치/실행 명령·작은 샘플 데이터 생성법.
- 재사용할 소스 경로, 연결된 데이터 모델·CSS·API.
- 테스트한 동작과 미확인 환경, native/backend 기능의 제한.
- 원본 출처와 직접 작성한 코드의 라이선스 상태.
- 변경 이력.

직접 작성한 코드의 공개 라이선스가 정해지지 않았다면 UNSPECIFIED/unverified로 기록한다.
사용자가 정하지 않은 MIT 등의 라이선스를 임의 부여하지 않는다. 외부 코드·폰트·아이콘의 원래 고지는 유지한다.

### 소스 snapshot 무결성

정확한 보관본 대조가 필요한 경우 source-manifest.json에 상대 경로와 SHA-256, 원본과 다른 파일의 이유를 적는다.
Git의 CRLF/LF 정규화 때문에 로컬 파일과 원격 blob의 해시가 달라질 수 있다.

- 원본 바이트 보존을 선택하면 항목의 .gitattributes에 `source/** -text` 등 해당 snapshot 범위만 지정한다.
- 또는 의도적으로 줄바꿈을 정규화하고 그 정책과 정규화된 해시를 기록한다.
- manifest를 제공한다면 stage 후 `git show :<repo-relative-source-path>`의 바이트도 대조한다.
- 다른 기존 항목이나 저장소 전체의 줄바꿈 정책을 바꾸지 않는다.

## 실제 화면과 안전한 preview

- 사용자 Vault나 기존 browser profile에 샘플을 삽입하지 않는다. 격리 브라우저 context, 임시 데이터 디렉터리, 별도 preview를 사용한다.
- 합성 데이터는 원본 실험값을 단순 익명화한 척하지 말고 직접 수식/fixture로 만든다. 실제 데이터가 아니라는 설명을 화면 또는 캡처 설명에 명확히 둔다.
- 현재 UI를 실행해 캡처한다. 그래픽 생성 이미지나 목업을 실제 screenshot으로 등록하지 않는다.
- 대표 화면과 핵심 동작 상태를 필요한 만큼 찍는다. 캡처 수는 고정하지 않는다.
- viewport·DPR/배율·테마·날짜·앱 revision과 테스트 환경을 기록한다. 1440px 가로는 권장값이며 작은 UI를 강제로 늘리지 않는다.
- 결과 이미지를 열어 글자·레이아웃·잘린 영역·개인정보 노출을 확인한다.
- 실제 구현과 다른 preview wrapper·합성 데이터 주입이 있다면 파일을 분리하고 차이를 명시한다.
- native API·backend를 가짜로 연결해서 전체 기능이 검증됐다고 하지 않는다. 웹 preview에서 지원하지 않는 기능을 README에 명시한다.
- GitHub 파일 보기 화면은 HTML을 실행하지 않는다. HTTP 서버 명령과 정확한 URL을 적고, 실제 배포하지 않은 Pages 주소를 만들지 않는다.
- 임시 테스트 서버·프로세스는 목적이 끝나면 정리한다. 사용자가 볼 preview를 계속 켜뒀다면 주소와 실행 상태를 보고한다. 다른 작업의 앱을 종료하지 않는다.

## Reference UI: 출처와 관찰 기록

원본 페이지를 확인하고 original URL, creator, creator URL, repository, commit/tag, 확인 날짜를 기록한다.
알 수 없는 값은 확인 전/null로 구분하고, 조사한 내용과 추측을 섞지 않는다.

- 기본은 링크와 내가 작성한 관찰 메모. 외부 repository 전체를 복사하지 않는다.
- 라이선스와 적용 범위를 확인해 screenshot·코드·폰트 각각 보관할 근거를 적는다.
- unverified/UNKNOWN이면 링크·메모만 보관하고 외부 screenshot·source는 넣지 않는다. 현재 검증기도 이 조건을 검사한다.
- verified/permission-granted이면 evidence URL 또는 항목 내부 근거 파일을 넣는다. 비공개 허가 메일은 공개 저장소에 노출하지 않는다.
- 참고한 이유는 “깔끔함” 대신 정보 계층, 긴 이름 처리, 키보드 이동, 모션 피드백 등 구체적인 패턴으로 적는다.
- 적용할 내 프로그램과 아직 검토할 제약, 실제 구현이 생기면 연결할 My UI 항목을 적는다.
- 외부 UI를 참고해 만든 내 구현은 별도 My UI 항목으로 기록하고 출처를 유지한다.
