# Content License / 콘텐츠 라이선스

## English

**Code, configuration, design documents and ADRs** in this repository are licensed
under the MIT License (see [LICENSE](LICENSE)).

**Personal content is NOT covered by the MIT License. All rights reserved.**
You may read it on the published site and in this repository, and fork the
repository on GitHub as GitHub's Terms allow, but you may not copy, redistribute,
republish or present it as your own without written permission.

Personal content means:

- everything under `apps/web/content/**` (profile and career text, the about page,
  the privacy notice wording, translations of these, diagram sources used on those pages)
- site variables that describe the owner (`apps/web/content/data/site-vars.yaml`,
  `profile.*.yaml`)
- photographs, portraits, logos and any other images committed as site assets
  (including generated Open Graph images that contain the owner's name or photo)
- blog posts or other personal writing, if added

The UI strings under `apps/web/src/messages/` are part of the code (MIT).
When in doubt, treat text that describes a person (the owner) as personal content.

### Third-party software (reference only, not legal advice)

This project uses third-party software under their own licenses. The list below is a
convenience summary, **not a legal review**; check each project's license before relying on it.

| Component | License (as understood) |
|---|---|
| Bun, ElysiaJS, Next.js, React | MIT |
| Drizzle ORM, Envoy / Envoy Gateway | Apache-2.0 |
| nginx | BSD-2-Clause |
| PostgreSQL | PostgreSQL License |
| Prometheus | Apache-2.0 |
| Grafana | AGPL-3.0 — run as a separate, unmodified service; this repository's code is not a derivative of it |

## 한국어

이 저장소의 **코드, 설정, 설계 문서, ADR** 은 MIT 라이선스입니다([LICENSE](LICENSE) 참고).

**개인 콘텐츠는 MIT 의 적용 대상이 아니며 모든 권리가 유보됩니다.**
공개된 사이트와 이 저장소에서 읽는 것, GitHub 약관이 허용하는 범위의 포크는 가능하지만,
서면 허락 없이 복사·재배포·재게시하거나 본인의 것처럼 제시할 수 없습니다.

개인 콘텐츠의 범위:

- `apps/web/content/**` 전체(자기소개·경력 문구, 소개 페이지, 개인정보 안내 문구, 이들의 번역, 해당 페이지에 쓰인 다이어그램 원본)
- 소유자를 설명하는 사이트 변수(`apps/web/content/data/site-vars.yaml`, `profile.*.yaml`)
- 사진, 초상, 로고 등 사이트 자산으로 커밋된 모든 이미지(소유자 이름·사진이 들어간 생성 OG 이미지 포함)
- 추가될 경우 블로그 글 등 개인 저술

`apps/web/src/messages/` 의 UI 문자열은 코드의 일부(MIT)입니다.
애매하면 **사람(소유자)을 설명하는 글**은 개인 콘텐츠로 취급합니다.

### 서드파티 소프트웨어 (참고용이며 법률 자문이 아님)

이 프로젝트는 각자의 라이선스를 가진 서드파티 소프트웨어를 사용합니다. 아래 표는 편의를 위한
요약이며 **법률 검토가 아닙니다.** 의존하기 전에 각 프로젝트의 라이선스를 직접 확인하세요.

| 구성 요소 | 라이선스(알고 있는 바) |
|---|---|
| Bun, ElysiaJS, Next.js, React | MIT |
| Drizzle ORM, Envoy / Envoy Gateway | Apache-2.0 |
| nginx | BSD-2-Clause |
| PostgreSQL | PostgreSQL License |
| Prometheus | Apache-2.0 |
| Grafana | AGPL-3.0 — 별도의 서비스로, 수정 없이 실행. 이 저장소의 코드는 Grafana 의 파생물이 아님 |
