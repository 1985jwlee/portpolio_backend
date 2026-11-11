// G11 guestbook 계약 스키마. 아무것도 임포트하지 않는다(게이트가 이 파일의 해시를 본다). 작성: AI 초안 (Authorship: G).
export const schemas = {
  EntryDto: {
    type: "object",
    required: ["id", "body", "createdAt", "mine"],
    properties: { id: { type: "number" }, body: { type: "string", minLength: 1, maxLength: 200 }, createdAt: { type: "string" }, mine: { type: "boolean" } },
  },
  PostEntryRequest: { type: "object", required: ["body"], properties: { body: { type: "string" } } },
  EntryPostedV1: { type: "object", required: ["schemaVersion", "entryId", "ownerKey"], properties: { schemaVersion: { type: "number" }, entryId: { type: "number" }, ownerKey: { type: "string" } } },
} as const;
