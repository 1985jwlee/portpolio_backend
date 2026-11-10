# G7 측정 환경 (2026-11-10)

ADR-050 의 ‘실측’ 조건(스크립트·원시 결과·환경·커밋 해시)을 채우는 기록이다. 판정 기준은 [README.md](README.md), 결과 해석은 [tech-stack §11.1](../../docs/domains/tech-stack.md) 의 G7 행.

## 측정한 곳 — 개발 PC 하나뿐
| 항목 | 값 |
|---|---|
| 장비 | [G2 ENV.md](../g2-ws-soak/ENV.md) 와 같은 개발 PC: WSL2(Ubuntu 24.04), Intel i5-12400 6코어, RAM 15GB. 이 폴더의 결과 JSON 에는 CPU·RAM·OS 가 기록되지 않아 **장비는 같은 날 같은 PC 의 G2·G14 기록을 따른다** |
| Bun | 1.4.4 (결과 JSON) |
| Docker | 29.8.0 (결과 JSON) |
| nginx 이미지 | `nginx:stable` 1.30.6, `nginx:stable-alpine` 1.30.6, `nginx:mainline` 1.31.8 (결과 JSON `images`) |
| **호스트(집 서버) 재측정** | **하지 않았다.** README ‘한계’: 호스트의 Docker 네트워크 대역은 다를 수 있다 — compose 에서 대역을 고정하고 `set_real_ip_from` 을 같게 둔다(S1·S8). 호스트의 Docker 는 29.1.3 이다 |

## 실행한 시험과 코드 버전
| 시험 | 결과 파일 | 코드 커밋 | 조건 |
|---|---|---|---|
| G7 ①② | `results/2026-11-10T08-22-15-318Z-verify.json` | `5771274` | 기준 1~10 PASS. `nginx:stable` 3회 반복, 결과 동일 |

## 한계
- 실제 Funnel 경유 헤더는 이 시험이 아니라 [ADR-051](../../docs/adr/ADR-051-funnel-g14-measurement-results.md) 에서 실측했다. 여기서는 그 헤더를 **흉내 낸 요청**으로 nginx 쪽만 검증한다.
- G7 ③(TLS 자동화)은 Funnel 이 TLS 를 끝내므로 해당 없음.
- IPv6 는 주소 문자열 정규화만 확인했고 IPv6 클라이언트의 실제 경로는 확인하지 않았다.
