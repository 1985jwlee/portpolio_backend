import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  output: "standalone",
  // 모노레포가 아니므로 이 폴더가 추적 루트다(실제 저장소에서는 outputFileTracingRoot 필요, tech-stack §4)
  poweredByHeader: false,
};

export default withNextIntl(config);
