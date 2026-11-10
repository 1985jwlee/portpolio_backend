# G7 — nginx 클라이언트 주소 정규화 (S0-6)

[tech-stack §11](../../docs/domains/tech-stack.md) 관문 G7 ①②, [ADR-051](../../docs/adr/ADR-051-funnel-g14-measurement-results.md) 결정 3(`X-Forwarded-For` 만 신뢰, `X-Real-IP` 폐기)의 검증. **제품 코드가 아니다**(스파이크). 증거 규칙은 [ADR-050](../../docs/adr/ADR-050-evidence-rule.md).

> 이전 로컬 결과(tech-stack §11.1: 공식 이미지 모두 realip 포함 등)는 재현 스크립트가 없어 ‘참고값’이다. 신뢰 대역·헤더가 Cloudflare 전제였던 것도 Funnel 기준으로 다시 확인한다.

## 시험 전에 고정한 기준 (2026-11-10)
대상 이미지: `nginx:stable`(주 이미지), `nginx:stable-alpine`, `nginx:mainline`. 시험 구성은 실제 배포를 흉내 낸다 — 호스트 `127.0.0.1:<포트>` → docker-proxy → nginx 컨테이너(소스 주소는 Docker 네트워크 게이트웨이) → 업스트림.

| # | 기준 | 합격 |
|---|---|---|
| 1 | 세 이미지 모두 `nginx -V` 에 `--with-http_realip_module` 포함 | 3/3 |
| 2 | 신뢰 대역 안의 홉이 보낸 `X-Forwarded-For: 1.2.3.4` → 업스트림이 받는 `X-Client-IP` = `1.2.3.4` | 일치 |
| 3 | 클라이언트가 보낸 `X-Real-IP`·`X-Client-IP`·`CF-Connecting-IP` 는 업스트림에 **전달되지 않거나 정규화된 값으로 덮인다** | 위조값 0건 도달 |
| 4 | 다중값 `X-Forwarded-For: 6.6.6.6, 1.2.3.4` → `X-Client-IP` = **마지막 값** `1.2.3.4` (Funnel 이 덮어쓰는 한 단일 값이지만 방어) | 일치 |
| 5 | 신뢰 대역 밖 소스에서 온 위조 `X-Forwarded-For` 는 **무시**되고 `X-Client-IP` = 실제 소스 주소 | 위조값 미반영 |
| 6 | IPv6 클라이언트 주소(`2001:db8::1`)가 그대로 정규화된다 | 일치 |
| 7 | `limit_req` 가 **정규화된 주소**를 키로 쓴다: 같은 주소 A 의 연속 요청은 429, 동시에 다른 주소 B 는 200 | A 에서 429 ≥ 1, B 는 429 0 |
| 8 | WebSocket 업그레이드가 nginx 를 통과해 업스트림에서 왕복한다(101 + 에코) | 성공 |
| 9 | 비정상 입력: 8KB `X-Forwarded-For` 와 잘못된 주소 문자열(`not-an-ip`)에 nginx 가 죽지 않고 4xx/200 으로 응답 | 프로세스 생존 |
| 10 | 위 시험을 `nginx:stable` 에서 3회 반복해 **결과가 같다** | 3/3 |

## 구성
| 파일 | 역할 |
|---|---|
| `nginx.trusted.conf` | 신뢰 대역을 Docker 네트워크 게이트웨이 대역으로 둔 설정(기준 2~4·6~8) |
| `nginx.untrusted.conf` | 신뢰 대역을 일부러 다른 대역으로 둔 설정(기준 5) |
| `upstream.ts` | 받은 헤더·소켓 주소를 JSON 으로 돌려주고 `/ws` 에서 에코하는 업스트림 |
| `verify.ts` | 컨테이너를 띄우고 위 기준을 모두 시험한 뒤 정리하고 `results/` 에 원시 결과를 남긴다 |

## 실행
```bash
cd spikes/g7-nginx-realip && bun verify.ts          # 전부(3회 반복 포함)
```
컨테이너·네트워크는 시험 후 지운다. 호스트 포트는 `127.0.0.1:38080`·`38081`.

## 한계
- 개발 PC 의 Docker(WSL2)에서 잰다. 실제 Funnel 경유 헤더(`X-Forwarded-For` 덮어쓰기)는 ADR-051 에서 실측했고, 여기서는 그 헤더를 **흉내 낸 요청**으로 nginx 쪽만 검증한다.
- 호스트(집 서버)의 Docker 네트워크 대역은 다를 수 있다. 실제 대역은 compose 에서 고정하고 `set_real_ip_from` 을 같게 둔다(S1/S8).
- TLS 자동화(G7 ③)는 Funnel 이 TLS 를 끝내므로 해당 없음.
