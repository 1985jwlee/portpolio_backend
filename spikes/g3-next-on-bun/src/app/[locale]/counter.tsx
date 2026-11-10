"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function Counter() {
  const t = useTranslations("home");
  const [n, setN] = useState(0);
  return (
    <div>
      <span>{t("counter")}: </span>
      <output data-testid="count">{n}</output>
      <button data-testid="inc" onClick={() => setN((v) => v + 1)}>
        +1
      </button>
    </div>
  );
}
