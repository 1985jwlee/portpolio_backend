# ADR-002: 라이브는 Docker Compose, K8s 는 로컬 k3d 검증본
- 상태: Accepted
- 날짜: 2026-11-03
- 근거: 원 계획안 모순 #6·#7, Phase 0·4 / 명세 NFR Scalability, AC-014 / 인터뷰 R9-Q2

## 맥락
원 계획안은 K8s(Gateway API·HPA·PDB)로 프로덕션화를 증명하려 했다. 명세는 **완전 무료로 상시 공개**(집 PC 또는 Oracle Always Free)를 제약으로 둔다. 무료 자원에서 K8s 컨트롤 플레인 오버헤드까지 상시 감당하는 것은 부담이 크다(실측은 아직 없음). 또한 커뮤니티 ingress-nginx 는 2026-03 에 retire 되어 더는 패치가 없다고 원 계획안이 기록했다.

## 결정
- **라이브**: Docker Compose 한 벌. 집 PC 와 Oracle 양쪽에서 같은 파일로 뜬다. 차이는 오버라이드 파일로만 둔다.
- **K8s**: 같은 컨테이너 이미지를 **로컬 k3d** 에 배포·검증하는 매니페스트를 유지한다. 외부 진입은 **Gateway API(HTTPRoute)** 로 하고 ingress-nginx 는 쓰지 않는다.
- 라이브와 k3d 는 **같은 이미지**를 쓴다. 환경 차이는 설정으로만 흡수한다.

## 설계 상세

### Compose 구성(라이브)
| 서비스 | M1 | 비고 |
|---|---|---|
| `proxy` | O | **경로 라우팅(`/`, `/api`, `/ws`, `/grafana`), TLS 종료(Oracle 경로), 원 접속 주소 정규화.** 제품 선정은 구현 시(미결). 집 PC 경로에서는 `cloudflared` 가 이 컨테이너를 가리킨다. K8s 검증본에서는 Gateway API 가 이 역할을 대신한다 |
| `web` | O | Next.js |
| `api`, `ws-gateway`, `worker` | O | ADR-001, 같은 이미지 |
| `postgres` | O | 볼륨 필수 |
| `prometheus`, `grafana` | O | ADR-007, 컨테이너 2개 추가 |
| `cloudflared` | 집 PC | Cloudflare Tunnel (ADR-003) |
| `redis` | 후속 | 재고 선점·전달 계층 후보 (ADR-006·010) |

파일 구성(제안): `compose.yml`(공통) + `compose.home.yml` + `compose.oracle.yml`(Arm 플랫폼·리소스 차이).

### K8s 검증본(k3d)
- 매니페스트 디렉토리를 별도로 두고 `Deployment` 를 엔트리포인트별로 분리한다.
- 진입: `Gateway` + `HTTPRoute`(`/api`, `/ws`, `/` → web). 사용하는 Gateway API 구현체는 구현 시 선정한다(미결).
- 검증 항목: readiness/liveness probe, `PodDisruptionBudget`, 롤링 업데이트 중 소켓 재접속(ADR-014), HPA 동작.
- 이 환경은 **검증용**이다. README 는 라이브가 K8s 위에서 도는 것처럼 쓰지 않는다.

### 메모리 예산(측정 예정)
무료 자원 한도 대비 컨테이너 합계를 **구현 후 측정해서** ADR 에 채운다. 지금은 수치를 두지 않는다.

## 대안과 기각 이유
- **Oracle 에 k3s 로 라이브 운영**: 가입에 카드가 필요하다는 보고, 유휴 회수 정책, 계정 종료 사례가 있고 제한된 메모리 안에 K8s 오버헤드까지 넣어야 한다.
- **단일 유료 VPS + k3s(원 계획안 안)**: "완전 무료·카드 불필요" 제약과 양립하지 않는다.
- **Compose 만**: HPA·PDB·소켓 재접속 검증이 사라진다.

## 결과
- 얻는 것: 0원 상시 공개와 K8s 역량 증명을 모두 취한다.
- 치르는 것: Compose 와 매니페스트 두 벌을 동기화해야 한다. 라이브에서 K8s 가 실제 돈 것은 아니라는 점을 정직하게 밝혀야 한다.

## 위험과 완화
| 위험 | 완화 |
|---|---|
| 두 벌이 어긋나 k3d 에서 되는 것이 라이브에서 안 됨 | 같은 이미지, 환경 변수 계약을 하나의 문서로 관리, AC-014 로 양쪽 시험 |
| Oracle ARM 과 x86 이미지 차이 | 멀티 아키텍처 이미지 빌드(CI) |

## 검증 방법
AC-014(두 호스팅에서 핵심 시나리오 통과) + k3d 에서 probe·PDB·롤링 중 재접속 시험.

## 실서비스라면
관리형 K8s 또는 단일 노드 k3s 를 쓰고 Compose 는 로컬 개발용으로만 둔다.

## 재검토 조건
무료로 K8s 를 상시 운영할 안정적 경로가 생기거나 호스팅 제약이 풀릴 때.

## 관련 ADR
ADR-001, ADR-003(호스팅), ADR-014(배포·무중단)
