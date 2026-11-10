# results/ 색인 (G3)

원시 결과는 합치지 않고 그대로 둔다(ADR-050). 환경과 한계는 [../ENV.md](../ENV.md), 진단 기록 원문은 [notes.md](notes.md). 시각은 UTC.

| 파일 | 무엇인가 | 판정 | 비고 |
|---|---|---|---|
| `…14-51-17Z-first-smoke.stdout-stderr.log` | 첫 실행(기준 1~5·8·9, 1회) | 결과 JSON 없음 | **시험 본체는 끝까지 돌았지만 결과 기록 코드가 `docker` 없는 PC 에서 예외**(`docker --version` 의 stdout 이 비어 있음). 하네스 결함이며 기준과 무관. 한 줄 고침 |
| `…14-53-03Z-smoke2.stdout-stderr.log`, `…14-54-22-303Z-verify.json` | 같은 범위 재실행(1회) | FAIL | 기준 1~5·8 PASS, **9 FAIL**(SIGTERM 후 10초 안에 종료 안 됨). 브라우저 기준 6·7·10 제외 |
| `…15-00-33Z-full.stdout-stderr.log`, `…15-03-16-181Z-verify.json` | **본 시험**(기준 1~9, 3회 반복, Docker 제외) | FAIL (기준 9 만) | 1~8 은 3/3 PASS. **9 는 1/3** |
