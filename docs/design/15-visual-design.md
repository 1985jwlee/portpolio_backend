# 15. 시각 디자인 (모던 미니멀)

사용자 결정: **시각 방향은 모던 미니멀.** 이 문서는 [07](07-frontend.md)의 화면·시각화 설계를 **색·글꼴·간격·컴포넌트 모양**으로 구체화하고, 정적 목업(`ui/*.html`)과 토큰(`ui/tokens.css`)의 사용법을 적는다.
구현의 정본은 코드(`apps/web`)이고, 이 문서와 목업은 **그 코드가 따라 만들 기준**이다.

> 다이어그램 해당 여부 — 이 문서는 화면의 모양을 다루므로 mermaid 대신 **실제로 열리는 목업과 스크린샷**이 다이어그램 역할을 한다(§6). 클래스·상속 구조는 해당 없음(코드 구조는 07 §10).

## 1. 디자인 계획과 점검

**주제·독자·과제.** 주제는 "백엔드 작품으로서의 이 사이트". 독자는 채용 담당자와 백엔드 개발자. 첫 화면의 단 하나의 과제는 *"글 한 건이 시스템을 지나가는 모습을 믿게 만드는 것"* 이다.

| 항목 | 선택 |
|---|---|
| 색 | 차가운 중립 회색 스케일(12단) + **강조색 1개(파랑)**. 주 버튼은 강조색이 아니라 **잉크(거의 검정)** 로 분리해, 파랑이 "상호작용·진행·선택"에만 쓰이게 한다 |
| 글꼴 | 본문·제목 **Pretendard Variable**(굵게 갈수록 자간을 조임), 단계 이름·ID·시각·숫자는 **JetBrains Mono**. 백엔드의 말(`written`, `trace`, `+61ms`)은 코드 글꼴로 쓴다 |
| 구조 | 왼쪽 정렬, 본문 열 42rem, 데모는 70rem. 카드는 1px 경계, 그림자는 팝오버·토스트에만 |
| **서명(signature)** | **레일(rail)**: 노드와 선으로 이어진 단계 표시. 홈 히어로, 흐름 화면, 방명록 옆 미니 레일, 연결 상태 배지(같은 노드 모양), 로고(노드 셋)에 반복된다 |

**계획 점검(수정한 것).**
- "어두운 바탕 + 형광 강조" 와 "크림색 바탕 + 세리프 + 테라코타" 는 이 주제의 기본값처럼 흔해서 **버렸다.** 라이트를 기본으로 하되 다크를 같은 무게로 설계했다.
- 히어로 문구를 크게 키우는 대신 **히어로를 라이브 레일로** 바꿨다(문구는 한 줄, 레일이 주인공).
- 번호 매김(1~5)은 **구성도에서만** 썼다. 글이 지나가는 실제 순서이기 때문이다. 다른 곳의 구조 장식(번호, 아이브로)은 뺐다.
- 강조를 한 곳에 쓰기 위해 카드 그림자, 그라데이션, 장식 아이콘을 모두 뺐다.

## 2. 구체 규칙 (모던 미니멀)

| 항목 | 규칙 |
|---|---|
| 여백 | 섹션 사이 3.5rem(56px), 카드 안쪽 1.25rem(20px), 카드 사이 1rem, 폼 필드 사이 1rem, 목록 카드 사이 14px. 4px 격자 |
| 밀도 | 한 화면에 **채운 버튼(주·강조)은 1개 이하**. 나머지는 윤곽(secondary)·유령(ghost) |
| 강조 한도 | 강조색(파랑)은 링크·포커스·선택·진행 중·실시간 표시에만. 장식·제목 색에 쓰지 않는다 |
| 흐름 상태색 | 흐름 컴포넌트와 연결 상태 배지에서만. 다른 곳에서 초록·주황·빨강을 상태 표현 말고 쓰지 않는다 |
| 제목 | 화면당 `h1` 하나. 제목 크기 스케일 1.25배(25·31·39·49). 한글은 `word-break: keep-all` |
| 카드 | 중첩 금지(카드 안 카드). 링크 카드는 hover 에 경계만 진해진다(이동·확대 없음) |
| 그림자 | 팝오버·토스트·다이얼로그에만. 다크에서는 그림자 대신 1px 경계 |
| 모서리 | 컨트롤 8px, 카드 12px, 배지·칩 완전 둥글게, 작은 코드 칩 4px |
| 문구 | 문장형, 능동형, 버튼은 일어나는 일을 이름으로("남기기", "신고하기"). 같은 동작은 흐름 전체에서 같은 이름("남기기"→토스트 "글을 남겼습니다"). 오류는 사과하지 않고 **무엇이 일어났고 어떻게 하면 되는지**를 쓴다 |

## 3. 토큰

정본은 [`ui/tokens.css`](ui/tokens.css) (Tailwind 4 `@theme` + `:root[data-theme="dark"]` 덮어쓰기). 07 §4.1 의 이름을 그대로 쓰고 아래를 **추가**했다.

| 분류 | 토큰 |
|---|---|
| 바탕·글자 | `--color-bg` `--color-surface` `--color-surface-sunken` `--color-text` `--color-muted` `--color-subtle` `--color-border` `--color-border-strong` |
| 상호작용 | `--color-accent`(+`-hover` `-subtle` `-fg`) · `--color-primary`(+`-hover` `-fg`, 잉크) · `--color-focus` |
| 의미 | `--color-success/warn/danger/info` 와 각 `-subtle`(배지·배너 바탕) |
| 흐름(07 §3.2) | `--flow-pending/active/done/warn/error/dead` + 추가 `--flow-bar` |
| 흐름 단계 별칭 | `--flow-step-written/outboxed/dispatched/received/processed` = `--flow-bar`, `--flow-step-retried` = `--flow-warn`, `--flow-step-failed` = `--flow-error`, `--flow-step-dead` = `--flow-dead` |
| 타이포 | `--font-sans` `--font-mono`, `--text-xs…4xl`(12·14·16·20·25·31·39·49px), `--leading-*`, `--tracking-display` |
| 간격·모양 | `--spacing: 4px`, `--radius-sm/md/lg/full`, `--shadow-sm/md` |
| 모션 | `--dur-fast 150ms` `--dur-base 250ms` `--dur-slow 400ms`, `--ease-standard` (reduced-motion 에서 모두 0.01ms) |
| 레이아웃 | `--container-prose 42rem` `--container-page 70rem`, 브레이크포인트 sm 40 · md 48 · lg 64 · xl 80rem, `--header-h 3.5rem`, `--tap-min 2.75rem` |

**흐름 단계 색을 단계별로 달리하지 않은 이유.** 07 §3.2 는 색을 *상태*(대기·진행·완료·재시도·실패·격리)에 붙인다. 정상 5단계(`written … processed`)는 순서가 정보이지 종류가 다르지 않으므로 **한 색**으로 두고, 예외 3단계(`retried`·`failed`·`dead`)만 상태색을 쓴다. 단계 구분은 이름·막대 길이·숫자로 한다(색에만 의존하지 않음).

### 3.1 타이포

| 역할 | 글꼴 | 쓰는 곳 | 크기·행간 |
|---|---|---|---|
| 본문·제목 | Pretendard Variable → 시스템 한글 폰트 | 모든 글 | 본문 16px / 행간 1.7(한글, `:lang(ko)`) · 1.6(영문) · 제목 1.25 |
| 데이터 | JetBrains Mono Variable → `ui-monospace` | 단계 이름, `trace` ID, 시각, 숫자, 코드 | 12~14px, 숫자는 `tabular-nums`·`zero` |
| 폴백 | `-apple-system, system-ui, Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic, Segoe UI, Roboto` | 위 글꼴이 없을 때 | 동일 |

- **외부 요청 0건**을 지키기 위해 글꼴은 **같은 출처에서 셀프호스팅**한다(`apps/web/public/fonts/`, `font-display: swap`, 본문 글꼴 preload). 07 §4.2 의 "시스템 폰트 스택 우선"을 **"자체 글꼴 + 시스템 폴백"** 으로 바꾸는 제안이다(§10).
- 라이선스: Pretendard 는 SIL OFL 1.1, JetBrains Mono 는 OFL 1.1 로 알려져 있으나 **저장소 `LICENSE` 파일로 직접 확인하기 전에는 미확인**이다. 저장소에는 글꼴 파일을 넣지 않았다.
- 크기 실측(이 작업 중 내려받아 본 값): Pretendard Variable 전체 woff2 약 2.0MB, JetBrains Mono 라틴 서브셋 약 40KB. 전체 Pretendard 는 LCP 예산(2.5초)에 크므로 **KS X 1001 완성형 + 라틴 서브셋으로 줄여야** 한다(줄인 크기는 미확인).

## 4. 색 대비 증명 (WCAG 2.2 AA)

`ui/tools/contrast.mjs` 가 `tokens.css` 를 **직접 읽어** 라이트·다크 모든 쌍을 계산한다(`bun docs/design/ui/tools/contrast.mjs --md`). 토큰을 바꾸면 다시 돌리고, 구현 단계에서는 이 스크립트를 CI 의 `check` 에 넣는다.

- 기준: 텍스트 4.5:1(큰 글자 3:1), UI 경계·포커스 링·그래픽 3:1. 흐름 색은 아이콘·선·막대(3:1)이면서 상태 글자로도 쓰이므로 **표면 위에서 4.5:1 도 함께** 만족시켰다.
- 포커스 링은 항상 `outline-offset: 2px`(링과 컴포넌트 사이에 바탕색 간격)이므로 링의 인접 색은 바탕이다.
- 장식 경계(`--color-border`)는 대비 기준에서 제외한다(정보를 담지 않음). 정보를 담는 입력 테두리는 `--color-border-strong` 으로 3:1 이상.
- 색조 배경(알림·배너) 위 글자를 위해 본문·보조·캡션이 `*-subtle` 배경에서도 4.5:1 을 넘는지 추가로 확인했다(자동 접근성 검사가 `subtle` on `warn-subtle` 4.45 를 잡아 토큰을 조정했다).

| 용도 | 전경 | 배경 | 기준 | 라이트 | 다크 |
|---|---|---|---|---|---|
| 본문 | `color-text` | `color-bg` | 4.5:1 | 16.90 ✓ | 15.95 ✓ |
| 본문 | `color-text` | `color-surface` | 4.5:1 | 17.48 ✓ | 14.62 ✓ |
| 본문 | `color-text` | `color-surface-sunken` | 4.5:1 | 15.72 ✓ | 15.46 ✓ |
| 보조 텍스트 | `color-muted` | `color-bg` | 4.5:1 | 7.61 ✓ | 8.81 ✓ |
| 보조 텍스트 | `color-muted` | `color-surface` | 4.5:1 | 7.87 ✓ | 8.08 ✓ |
| 보조 텍스트 | `color-muted` | `color-surface-sunken` | 4.5:1 | 7.08 ✓ | 8.54 ✓ |
| 캡션(subtle) | `color-subtle` | `color-bg` | 4.5:1 | 5.78 ✓ | 6.05 ✓ |
| 캡션(subtle) | `color-subtle` | `color-surface` | 4.5:1 | 5.98 ✓ | 5.55 ✓ |
| 캡션(subtle) | `color-subtle` | `color-surface-sunken` | 4.5:1 | 5.38 ✓ | 5.86 ✓ |
| 링크 | `color-accent` | `color-bg` | 4.5:1 | 5.77 ✓ | 8.10 ✓ |
| 링크 | `color-accent` | `color-surface` | 4.5:1 | 5.97 ✓ | 7.43 ✓ |
| 링크 | `color-accent` | `color-surface-sunken` | 4.5:1 | 5.37 ✓ | 7.86 ✓ |
| 링크 hover | `color-accent-hover` | `color-bg` | 4.5:1 | 7.74 ✓ | 10.47 ✓ |
| 주 버튼 글자 | `color-primary-fg` | `color-primary` | 4.5:1 | 17.48 ✓ | 15.95 ✓ |
| 주 버튼 hover | `color-primary-fg` | `color-primary-hover` | 4.5:1 | 12.91 ✓ | 19.06 ✓ |
| 강조 버튼 글자 | `color-accent-fg` | `color-accent` | 4.5:1 | 5.97 ✓ | 8.10 ✓ |
| 강조 버튼 hover | `color-accent-fg` | `color-accent-hover` | 4.5:1 | 8.00 ✓ | 10.47 ✓ |
| 선택 칩(accent/subtle) | `color-accent` | `color-accent-subtle` | 4.5:1 | 5.17 ✓ | 6.34 ✓ |
| 선택 칩 본문 | `color-text` | `color-accent-subtle` | 4.5:1 | 15.13 ✓ | 12.48 ✓ |
| 배지 success | `color-success` | `color-success-subtle` | 4.5:1 | 5.26 ✓ | 7.41 ✓ |
| 배지 warn | `color-warn` | `color-warn-subtle` | 4.5:1 | 5.68 ✓ | 8.17 ✓ |
| 배지 danger | `color-danger` | `color-danger-subtle` | 4.5:1 | 5.17 ✓ | 6.84 ✓ |
| 배지 info | `color-info` | `color-info-subtle` | 4.5:1 | 5.17 ✓ | 6.34 ✓ |
| 의미색 글자 success | `color-success` | `color-surface` | 4.5:1 | 5.93 ✓ | 8.31 ✓ |
| 의미색 글자 warn | `color-warn` | `color-surface` | 4.5:1 | 6.39 ✓ | 9.16 ✓ |
| 의미색 글자 danger | `color-danger` | `color-surface` | 4.5:1 | 5.90 ✓ | 7.20 ✓ |
| 본문 on warn-subtle | `color-text` | `color-warn-subtle` | 4.5:1 | 15.54 ✓ | 13.04 ✓ |
| 보조 on warn-subtle | `color-muted` | `color-warn-subtle` | 4.5:1 | 7.00 ✓ | 7.20 ✓ |
| 캡션 on warn-subtle | `color-subtle` | `color-warn-subtle` | 4.5:1 | 5.32 ✓ | 4.95 ✓ |
| 본문 on danger-subtle | `color-text` | `color-danger-subtle` | 4.5:1 | 15.30 ✓ | 13.89 ✓ |
| 보조 on danger-subtle | `color-muted` | `color-danger-subtle` | 4.5:1 | 6.89 ✓ | 7.67 ✓ |
| 캡션 on danger-subtle | `color-subtle` | `color-danger-subtle` | 4.5:1 | 5.24 ✓ | 5.27 ✓ |
| 본문 on success-subtle | `color-text` | `color-success-subtle` | 4.5:1 | 15.51 ✓ | 13.05 ✓ |
| 보조 on success-subtle | `color-muted` | `color-success-subtle` | 4.5:1 | 6.99 ✓ | 7.21 ✓ |
| 캡션 on success-subtle | `color-subtle` | `color-success-subtle` | 4.5:1 | 5.31 ✓ | 4.95 ✓ |
| 본문 on info-subtle | `color-text` | `color-info-subtle` | 4.5:1 | 15.13 ✓ | 12.48 ✓ |
| 보조 on info-subtle | `color-muted` | `color-info-subtle` | 4.5:1 | 6.82 ✓ | 6.90 ✓ |
| 캡션 on info-subtle | `color-subtle` | `color-info-subtle` | 4.5:1 | 5.18 ✓ | 4.73 ✓ |
| 입력 테두리 | `color-border-strong` | `color-bg` | 3:1 | 3.70 ✓ | 4.09 ✓ |
| 입력 테두리 | `color-border-strong` | `color-surface` | 3:1 | 3.83 ✓ | 3.75 ✓ |
| 포커스 링 | `color-focus` | `color-bg` | 3:1 | 5.77 ✓ | 10.28 ✓ |
| 포커스 링 | `color-focus` | `color-surface` | 3:1 | 5.97 ✓ | 9.43 ✓ |
| 흐름 pending | `flow-pending` | `color-surface` | 4.5:1 | 5.01 ✓ | 5.55 ✓ |
| 흐름 pending | `flow-pending` | `color-surface-sunken` | 3:1 | 4.50 ✓ | 5.86 ✓ |
| 흐름 active | `flow-active` | `color-surface` | 4.5:1 | 5.97 ✓ | 7.43 ✓ |
| 흐름 active | `flow-active` | `color-surface-sunken` | 3:1 | 5.37 ✓ | 7.86 ✓ |
| 흐름 done | `flow-done` | `color-surface` | 4.5:1 | 5.93 ✓ | 8.31 ✓ |
| 흐름 done | `flow-done` | `color-surface-sunken` | 3:1 | 5.33 ✓ | 8.78 ✓ |
| 흐름 warn | `flow-warn` | `color-surface` | 4.5:1 | 6.39 ✓ | 9.16 ✓ |
| 흐름 warn | `flow-warn` | `color-surface-sunken` | 3:1 | 5.75 ✓ | 9.68 ✓ |
| 흐름 error | `flow-error` | `color-surface` | 4.5:1 | 5.90 ✓ | 7.20 ✓ |
| 흐름 error | `flow-error` | `color-surface-sunken` | 3:1 | 5.31 ✓ | 7.61 ✓ |
| 흐름 dead | `flow-dead` | `color-surface` | 4.5:1 | 11.27 ✓ | 8.18 ✓ |
| 흐름 dead | `flow-dead` | `color-surface-sunken` | 3:1 | 10.14 ✓ | 8.65 ✓ |
| 흐름 bar | `flow-bar` | `color-surface` | 4.5:1 | 5.97 ✓ | 7.43 ✓ |
| 흐름 bar | `flow-bar` | `color-surface-sunken` | 3:1 | 5.37 ✓ | 7.86 ✓ |

실패 0건 / 전체 112건


결과: **112개 쌍 모두 통과(실패 0).**

## 5. 컴포넌트 시각 규격 (shadcn/ui)

모든 컴포넌트가 상태 `default · hover · focus-visible · disabled · loading(해당 시) · error(해당 시)` 를 갖는다. 목업이 각 상태를 보여 준다.

| 컴포넌트 | 변형 | 규칙 |
|---|---|---|
| **Button** | `primary`(잉크) · `accent`(파랑, 드묾) · `secondary`(윤곽) · `ghost` · `danger` · `icon` | 높이 40px(터치 기기 44px), 8px 반경, 글자 14px 600. `disabled` 는 `aria-disabled` + 투명도 45%(눌러도 반응 없음). `loading` 은 `aria-busy` + 왼쪽 스피너 + 문구가 진행형("남기는 중…") |
| **Input · Textarea** | 기본 · 오류 | 테두리 `border-strong`, 포커스 링 2px + 테두리 포커스 색. 오류는 `aria-invalid` + 테두리 위험색 + 필드 아래 오류 문구(노드 ✕ + 글자, `aria-describedby`). 글자 수는 `mono` 12px, 450자부터 주의색 |
| **Label · 도움말** | — | 라벨 14px 600, 도움말 12px muted. 도움말과 오류는 같은 자리를 쓴다 |
| **Card** | 기본 · 링크 | 1px 경계, 12px 반경, 20px 안쪽. 링크 카드는 포커스 시 링, hover 시 경계 강화 |
| **Badge** | 중립 · success · warn · danger · info | 완전 둥글게, 12px 600, 색조 바탕 + 같은 계열 글자(대비 4.5:1 이상) |
| **Dialog** | 신고 · 쓰기 잠금 | 28rem, 12px 반경, 배경막 50%, 포커스 트랩·복귀. 위험 동작 버튼은 `danger` |
| **Toast(Sonner)** | ok · info · warn · err | 왼쪽에 흐름 노드 모양(✓ · ◐ · ↻ · ✕), 6초, `role=status`(오류는 `alert`). 모바일에서는 하단 전체 폭 |
| **Skeleton** | — | 글 카드 3개 모양, 모션 축소 시 정지 |
| **DropdownMenu** | 언어·테마·사용자 | 목업에서는 분절 버튼(`seg`)으로 대신 보여 준다. 구현은 shadcn 기본 + 토큰 |
| **Switch** | 쓰기 잠금 | `role=switch`, 켜짐은 위험색(되돌릴 수 있지만 사용자 영향이 크므로). 켤 때 확인 다이얼로그 |
| **Table** | 신고 큐 | 데스크톱은 표, **모바일은 카드**(표 의미를 깨지 않도록 마크업 둘을 CSS 로 전환) |
| **Tooltip** | 흐름 노드 | 원 값(`written`)과 설명. 호버·포커스 모두 |

**연결 상태 배지·배너(07 §7.3).** 배지는 항상 헤더에, 배너는 이상 상태에서만. 상태마다 흐름 노드 모양을 쓴다.

| 상태 | 모양·색 | 배지 문구 | 배너 |
|---|---|---|---|
| live | ● 초록 | 연결됨 | 없음 |
| connecting | ◐ 파랑 | 연결 중… | 없음 |
| unstable | ◐ 주황 | 불안정 | status |
| backoff | ↻ 주황 | 재연결 대기 n초 | status + "지금 다시 연결" |
| idle | ○ 회색 | 일시 중지 | status |
| stopped(4409) | ○ 회색 | 다른 탭에서 열림 | status |
| stopped(4400) | ✕ 빨강 | 실시간 비활성 | **alert** + "새로고침" |
| offline | ✕ 빨강 | 오프라인 | status |

모바일에서는 배지가 **모양만** 남고 문구는 스크린리더용으로 숨긴다.

## 6. 화면별 목업

모든 목업은 외부 요청 0건의 **단일 HTML** 이고, 라이트·다크 토글, 데스크톱·모바일 반응형, 포커스 링, `aria-live` 영역, `prefers-reduced-motion` 처리를 갖는다. 개인 정보(이름·경력·연락처)는 `[사용자 제공 필요]` 자리표시이고 글·신고 내용은 **가짜 예시**다.

| 목업 | 화면(07) | 보여 주는 것 | 스크린샷 |
|---|---|---|---|
| [index](ui/index.html) | — | 목업 목차 | — |
| [home](ui/home.html) | 홈 | 히어로 레일(실행 루프, 모션 축소 시 정지), 진입 카드 4장 | [라이트](ui/screenshots/home-light-desktop.png) · [다크](ui/screenshots/home-dark-desktop.png) · [모바일](ui/screenshots/home-light-mobile.png) |
| [about](ui/about.html) | 자기소개 | 자리표시 슬롯, 변수 안내, 경력 타임라인 | [라이트](ui/screenshots/about-light-desktop.png) |
| [guestbook](ui/guestbook.html) | 방명록 | 작성 폼(검증·글자 수·로딩), 반응 막대(토글), 수정 충돌 안내, 신고 다이얼로그(→"신고함"), 연결 상태 8종, 목록 상태 4종, 옆 미니 레일 | [라이트](ui/screenshots/guestbook-light-desktop.png) · [다크](ui/screenshots/guestbook-dark-desktop.png) · [모바일](ui/screenshots/guestbook-light-mobile.png) · [재연결 대기](ui/screenshots/guestbook-backoff-light-desktop.png) |
| [flow](ui/flow.html) | 흐름 시각화 | 내 흐름 레일(정상·재시도 후 복구·격리·지연), 최근 흐름, 익명 요약 막대/표 전환 | [라이트](ui/screenshots/flow-light-desktop.png) · [재시도 진행 중](ui/screenshots/flow-retry-light-desktop.png) · [다크](ui/screenshots/flow-dark-desktop.png) · [격리(모바일)](ui/screenshots/flow-dead-dark-mobile.png) |
| [architecture](ui/architecture.html) | 아키텍처 | 번호가 붙은 구성도(<64rem 에서는 단계 목록만), 설계 결정 카드 | [라이트](ui/screenshots/architecture-light-desktop.png) |
| [ops](ui/ops.html) | 운영 지표 | Grafana 임베드 자리(예시 패널), 실패 폴백 | [라이트](ui/screenshots/ops-light-desktop.png) · [다크](ui/screenshots/ops-dark-desktop.png) |
| [admin-reports](ui/admin-reports.html) | 관리자 | 신고 큐, 메모 열람(열람 기록 안내), 쓰기 잠금 스위치, 403, 빈 큐 | [라이트](ui/screenshots/admin-reports-light-desktop.png) |
| [error-404](ui/error-404.html) | 404 | 경로 안내와 추정 링크 | [라이트](ui/screenshots/error-404-light-desktop.png) |
| [maintenance](ui/maintenance.html) | 점검 | 쓰기 잠금(503) 화면, 정적 폴백(데모 영역 "점검 중") | [라이트](ui/screenshots/maintenance-light-desktop.png) |

화면에 `목업 전용` 상자가 있는 곳(연결 상태·목록 상태·시나리오 선택 등)은 **구현에 없는 컨트롤**이다. 흐름 화면의 시나리오 선택이 대표적이다 — 실제 화면에서 장애는 사용자가 만들지 않는다.

## 7. 흐름 시각화의 시각 문법

사이트의 주인공이므로 07 §3 과 **정확히 같은 단계명·상태·모양**을 쓴다.

| 상태 | 모양 | 색 토큰 | 글자 | 비고 |
|---|---|---|---|---|
| 대기 | ○ 빈 원 | `--flow-pending` | 대기 | |
| 진행 중 | ◐ 반원 | `--flow-active` | 진행 중 | 반원이 1.6초 주기로 깜빡임(모션 축소 시 정지) |
| 완료 | ● 채운 원 + 체크 | `--flow-done` | 완료 | 재시도를 거쳤다면 "완료 · 재시도 n회" |
| 재시도 | ↻ | `--flow-warn` | 재시도 n회 | 이 단계 뒤 선이 주황으로 채워져 **재시도가 있었음**을 남긴다 |
| 실패 | ✕ 원 안 | `--flow-error` | 실패 | |
| 격리 | ▣ | `--flow-dead` | 격리됨 | 뒤 단계는 "중단", 선은 이어지지 않음 |
| 지연 | ⏱ | `--flow-warn` | 지연 | 5초 안에 다음 단계가 없을 때(07 §3.1) |

- **레이아웃**: `md`(768px) 이상은 가로 5열, 미만은 세로 트랙. 단계 이름(`mono` 14px 600), 한글 이름(12px muted), 상태 글자, 시각(`mono` 12px).
- **선 채움**: 단계 사이 선이 150~300ms(`--dur-base`)로 채워진다. 모션 축소 시 즉시.
- **글자 대체**: 모든 노드에 단계·상태·시각이 **보이는 글자**로 있다. 스크린리더는 단계가 바뀔 때마다 `role=status` 에 "글 작성 흐름: 5단계 중 3단계 완료" 한 문장을 받는다(5개를 각각 알리지 않는다).
- **익명 요약**: 막대 길이는 상대 비율, **숫자를 항상 병기**, 표 보기 토글, 창 5분/1시간. 정상 5단계는 한 색, 예외 3단계는 상태색 + 노드 모양. "다른 방문자의 내용·식별자는 보이지 않습니다" 문구를 고정 표시.
- **최근 흐름**: 최근 5건만 남고 새로고침하면 사라진다(07 §3.1).

## 8. 다크·라이트·모바일

| 항목 | 규칙 |
|---|---|
| 테마 | 기본은 `prefers-color-scheme`, 수동 전환은 쿠키 `theme`. SSR 이 `<html data-theme>` 를 써서 깜빡임을 막는다(목업은 `localStorage`) |
| 다크 | 순검정·순백 금지(`#0d1015` 바탕, `#e8ebf0` 글자). 단계 색은 밝은 계열로 올려 같은 대비를 유지. 그림자 대신 경계 |
| 모바일 | 헤더는 로고 + 연결 모양 + 테마 + 메뉴(나머지는 메뉴 안). 흐름은 세로 트랙, 신고 큐는 카드, 구성도는 숨기고 단계 목록, 터치 대상 44px, 토스트는 전체 폭 |
| 본문 열 | 42rem(한글 한 줄 약 36자). 데모(방명록·흐름·지표)는 70rem 안 |

## 9. 접근성 체크리스트 (목업에서 확인한 것)

| 항목 | 방법 | 결과 |
|---|---|---|
| 자동 검사 | axe-core(`wcag2a`·`aa`·`21aa`·`22aa`)를 10개 화면 × 라이트·다크(데스크톱)에서 실행 | **위반 0건** (처음 1건 — `subtle` on `warn-subtle` 4.45:1 — 은 토큰을 조정해 해결) |
| 콘솔·네트워크 | headless Chrome 153 으로 40개 조합(10 × 2 × 2)을 열어 확인 | 콘솔 오류 0, **외부 요청 0**, 390px 가로 스크롤 없음 |
| 키보드 | Tab 이동 시 포커스 링(2px, 오프셋 2px) 표시, 모바일 메뉴 `aria-expanded` 와 Esc 로 닫고 포커스 복귀, 스킵 링크 | 확인 |
| 모션 축소 | `prefers-reduced-motion: reduce` 에서 홈 레일 정적·흐름 즉시 완료, 지속시간 토큰 0.01ms | 확인 |
| 실시간 | 새 글은 `aria-live="polite"` 에 "새 글 1개"만, 글자 수는 450·500자에서만 한 번 | 구현됨 |
| 폼 | 라벨 연결, 오류 `aria-describedby`, 한도 근접 알림 | 구현됨 |
| 색에만 의존하지 않기 | 모든 상태에 모양 + 글자 | 확인 |
| 터치 대상 | 거친 포인터에서 44px | CSS 로 적용(기기 시험은 미실시) |

**한계.** 자동 검사는 접근성 문제의 일부만 잡는다. 스크린리더(NVDA·VoiceOver) 시험, 확대 400% 점검, 실제 터치 기기 시험은 **하지 못했고** 구현 후반 점검 항목으로 남긴다(07 §6). 스크린샷은 이 머신의 Chrome 에 글꼴 파일을 **임시로 로드**해 찍었다(목업 HTML 에는 글꼴이 들어 있지 않고 폴백 글꼴로 열린다). 이 머신에는 컬러 이모지 글꼴이 없어 이모지는 임시 글꼴로 대체해 찍었다.

## 10. 목업에서 구현으로

1. `ui/tokens.css` → `apps/web/src/styles/tokens.css`(07 §4.1 경로). `@import "tailwindcss"; @import "./tokens.css";` 로 불러온다.
2. **shadcn 변수 매핑**(shadcn 의 변수 이름은 버전에 따라 다르므로 구현 시 확인 — 미확인): `--background` ← `--color-bg`, `--foreground` ← `--color-text`, `--card` ← `--color-surface`, `--primary` ← `--color-primary`(`-foreground` ← `-fg`), `--muted` ← `--color-surface-sunken`, `--muted-foreground` ← `--color-muted`, `--accent` ← `--color-accent-subtle`, `--destructive` ← `--color-danger`, `--border` ← `--color-border`, `--input` ← `--color-border-strong`, `--ring` ← `--color-focus`, `--radius` ← 8px.
3. `ui/src/base.css` 의 클래스는 **구현에서 Tailwind 유틸리티와 컴포넌트로 옮긴다**(그대로 복사하지 않는다). 레일은 `FlowTrack`, 노드는 `FlowNode state` 컴포넌트로 만들고 `sprite.html` 의 SVG 를 인라인 SVG 컴포넌트로 쓴다.
4. 단계 이름·문구는 i18n 키(`flow.step.*`, `errors.<code>` 등)로 뺀다. 목업은 한국어 고정이다.
5. 대비 스크립트를 CI `check` 에 넣고 토큰을 바꾸는 PR 에서 돌린다. 시각 회귀(스크린샷 비교)는 E2E 도구가 정해진 뒤 추가한다(08).
6. 목업 다시 만들기: `bun docs/design/ui/build-mockups.ts`. 수정은 `ui/src/` 와 `tokens.css` 에서 하고 `*.html` 은 산출물이다.

## 11. 07·F15 와의 관계

| 항목 | 상태 |
|---|---|
| 07 §3 흐름 단계·상태·모양·접근성 규칙 | **그대로 따름** |
| 07 §4.1 토큰 이름 | 따르되 추가(`--color-accent`, `-subtle`, `--flow-bar`, `--flow-step-*` 등). `--color-primary` 의 의미를 **잉크(중립)** 로 확정 |
| 07 §4.2 글꼴 "시스템 폰트 스택 우선" | **제안**: 자체 글꼴(Pretendard·JetBrains Mono) + 시스템 폴백. 외부 요청 0건은 유지(같은 출처). 채택은 라이선스 확인·서브셋 크기 측정 후(미결) |
| 07 §2.2 방명록 와이어프레임 | 접속자 수를 본문 머리로, **옆에 내 글 흐름 미니 레일**을 추가(07 에 없는 요소) |
| 07 §2.3 "보내기" | 따름(실제 공개 글, 시나리오 선택은 목업 전용) |
| F15 신고 후 버튼 "신고함" | 목업에 반영 |

## 12. 미결

| 항목 | 결정 시점 |
|---|---|
| Pretendard·JetBrains Mono 라이선스 파일 확인, 서브셋 크기 실측, 채택 여부(미채택 시 시스템 폰트) | 구현 시작 전(S5-1) |
| shadcn 변수 이름·`@theme` 연동 방식(현재 버전 기준) | S5-1 |
| 로고(노드 셋)와 파비콘·OG 이미지 | 콘텐츠 확정 후 |
| 스크린리더·400% 확대·실기기 터치 점검 | 구현 후반 |
| 시각 회귀 시험 도구 | E2E 도구 결정 시 |
| 다크 모드의 Grafana 임베드 테마 일치 여부 | G6 |
