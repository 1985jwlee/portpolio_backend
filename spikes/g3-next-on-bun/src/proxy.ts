import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// 시험용 스위치: ?csp=no-attr 이면 style-src-attr 를 뺀다(기준 7 의 대조). 제품 코드에는 없다.
function buildCsp(nonce: string, withStyleAttr: boolean): string {
  const parts = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    ...(withStyleAttr ? ["style-src-attr 'unsafe-inline'"] : []),
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ];
  return parts.join("; ");
}

export default function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const withStyleAttr = req.nextUrl.searchParams.get("csp") !== "no-attr";
  const csp = buildCsp(nonce, withStyleAttr);

  // Next 는 요청 헤더의 CSP 에서 nonce 를 읽어 자기 스크립트에 붙인다.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const res = intl(new NextRequest(req, { headers }));
  res.headers.set("content-security-policy", csp);
  return res;
}

// design/01 §8.5: /healthz /readyz /metrics /api 와 정적 자원은 제외한다.
export const config = {
  matcher: ["/((?!api|healthz|readyz|metrics|_next|_vercel|.*\\..*).*)"],
};
