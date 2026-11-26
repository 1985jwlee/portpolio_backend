/**
 * 필드 암호화. 동기이고, 실패는 `PermanentError` 를 던진다(반환형이 문자열이라 Result 를 쓰지 않는다).
 * 평문·키는 오류 메시지·details 에 싣지 않는다. 구현은 이 패키지 밖에 둔다.
 */
export interface FieldCipher {
	/** `aad` 는 `"<스키마>.<테이블>.<컬럼>:<행 id>"` — 암호문을 다른 행·컬럼으로 옮기면 복호화가 거부된다. */
	encrypt(plain: string, aad: string): string;
	decrypt(envelope: string, aad: string): string;
}
