# 권리 기록

상태: unverified. 내 코드의 재사용 라이선스는 정하지 않았습니다(UNSPECIFIED). 공개 재사용을 허용한다는 뜻이 아닙니다.

| 보관 파일/범위 | 제작자 | 원본 URL·revision | 라이선스/허가 근거 | 확인일 | 수정 |
| --- | --- | --- | --- | --- | --- |
| `source/web/` 웹 UI 29개 파일 | sunghail (Adsorption Studio) | 비공개 로컬 프로젝트 `03_Liquid_phase_adsorption/reactor_studio/web`, 2026-10-28 snapshot (모델 버전 `b6ac074a31f8`) | 미정 — UNSPECIFIED | 2026-10-28 | 없음. 원본과 바이트 동일([source-manifest.json](../source-manifest.json)) |
| `preview/scripts/capture.py` 캡처 재현 스크립트 | sunghail (Adsorption Studio) | 이 아카이브용으로 작성 | 미정 — UNSPECIFIED | 2026-10-28 | 주소를 인자로 받음, 로컬 경로 없음 |
| `screenshots/` 14장 | sunghail (Adsorption Studio 화면) | 위 snapshot을 예시 프로젝트와 내장 문헌 프리셋으로 실행해 캡처 | 직접 만든 UI의 캡처 | 2026-10-28 | 캡처 조건은 항목 README 참고 |
| 캡처 속 문헌 프리셋 5개의 수치 (흡착제 이름·시험값·피팅 결과) | 프로그램 작성자가 아래 논문의 표·그림 값으로 계산 | Hu 2021 [10.1021/acsomega.1c01894](https://doi.org/10.1021/acsomega.1c01894), Soleimani 2013 [10.1080/00986445.2013.867258](https://doi.org/10.1080/00986445.2013.867258), Jeong 2016 [10.5658/wood.2016.44.5.705](https://doi.org/10.5658/wood.2016.44.5.705), Han 2022 [10.1016/j.biortech.2022.126979](https://doi.org/10.1016/j.biortech.2022.126979), Burgos 학위논문 2024(XAD-4 시간별 곡선) | 수치(사실)만 사용하고 출처를 표시. 논문 본문·그림·표 파일은 복사하지 않음 | 2026-10-28 | 논문 조건(시간·투입량)으로 다시 계산한 값. 빠진 성분·속도는 가정으로 채움(각 프리셋 메모에 기록) |
| 흡착제 제품명(Amberlite, Nuchar, Sigma) | 각 제조사 | — | 상표. 문헌에 나온 시료를 가리키는 이름으로만 사용 | 2026-10-28 | 없음 |
| 화면의 한글·라틴 글꼴 Pretendard | Kil Hyung-jin (orioncactus/pretendard) | https://github.com/orioncactus/pretendard | SIL OFL 1.1 | 2026-10-28 | 글꼴 파일 미복사. CSS가 이름으로만 지정하며 캡처 PC에 설치된 글꼴이 렌더링됨 |
| 화면의 기호·이모지 글꼴 (⚙, ✓, 📂, 💾 등) | 캡처 PC 시스템 글꼴 | Windows 기본 글꼴 | 해당 OS 라이선스 | 2026-10-28 | 글꼴 파일 미복사 |

외부 JS·CSS 라이브러리, 아이콘 세트, 이미지 자산은 쓰지 않았습니다. 그래프·흐름도·로고는 모두 소스 안의 SVG 코드로 그립니다.
캡처의 `예시 고분자 수지`는 프로그램이 정해 둔 "참값" 파라미터로 만든 가상 데이터입니다(프로그램 안 메모: "예시 데이터 (가상)"). 실험 측정값이 아닙니다.
문헌 프리셋은 논문 값을 프로그램 입력 형식으로 옮긴 것이며, 설계에 그대로 쓸 수 있는 검증 데이터가 아닙니다.
