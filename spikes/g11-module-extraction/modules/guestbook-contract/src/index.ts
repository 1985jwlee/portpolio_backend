// G11 guestbook 계약: DTO·공개 포트·검증기. @pf/kernel 외에는 임포트하지 않는다(규칙 G-d). 작성: AI 초안 (Authorship: G).
import type { ActorContext, Result } from "@pf/kernel";
import { schemas } from "./schemas";
export { schemas };

export type EntryDto = { id: number; body: string; createdAt: string; mine: boolean };
export type PostError = "invalid_body";

/** 모듈의 공개 포트. 인프로세스 구현과 HTTP 클라이언트 구현이 같은 계약을 만족한다. */
export interface GuestbookPort {
  postEntry(actor: ActorContext, body: string): Promise<Result<EntryDto, PostError>>;
  listEntries(actor: ActorContext): Promise<EntryDto[]>;
}

type S = { type: string; required?: readonly string[]; properties?: Record<string, S>; minLength?: number; maxLength?: number };
/** 최소 검증기: type·required·minLength·maxLength 만. 오류 문자열 또는 null. */
export function validate(schema: S, v: unknown, path = "$"): string | null {
  if (schema.type === "object") {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return `${path}: object 아님`;
    for (const k of schema.required ?? []) if (!(k in v)) return `${path}.${k}: 누락`;
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in v) { const e = validate(sub, (v as Record<string, unknown>)[k], `${path}.${k}`); if (e) return e; }
    return null;
  }
  if (typeof v !== schema.type) return `${path}: ${schema.type} 아님`;
  if (typeof v === "string") {
    if (schema.minLength !== undefined && v.length < schema.minLength) return `${path}: 너무 짧음`;
    if (schema.maxLength !== undefined && v.length > schema.maxLength) return `${path}: 너무 김`;
  }
  return null;
}
