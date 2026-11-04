@.claude/AGENT.md
# CLAUDE.md — 저장소 가이드

**이 저장소가 무엇인지**만 담는다. 저장소에 단 하나뿐인 `CLAUDE.md` 다.
판정에 쓰는 것(스택 선택·파이프라인·운영 방침)은 `.claude/AGENT.md`, 코딩 규칙은 `.claude/agent-rules/` 가 정본이다.

## 1. 개요

portpolio_backend — 포트폴리오 백엔드 저장소. 상세는 `README.md`.
도메인 지식은 `docs/domains/` 에 두고 여기에는 포인터만 둔다(문서를 만들면 아래 표에 한 줄 추가).

| 디렉토리 | 무엇을 하나 | 도메인 문서 |
|---|---|---|
| (아직 없음) | | |

## 2. 저장소 전체 도메인 문서

| 문서 (`docs/domains/`) | 언제 펼치는가 |
|---|---|
| `tech-stack.md` | 스택·버전·도구·구현 초기 관문. 의존성 추가·교체 전 |
| `architecture.md` | 구성·경계·흐름·신뢰 경계·배포. 모듈 추가·의존 변경 전 |
| `database-schema.md` | 테이블·제약·보관 정책. 마이그레이션 작성 전 |

결정의 근거는 `docs/adr/` 이다.
