import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Counter } from "./counter";

export default async function Home() {
  const t = await getTranslations("home");
  return (
    <main>
      <h1 data-testid="title">{t("title")}</h1>
      <Counter />
      <section>
        <h2>{t("image")}</h2>
        <Image src="/sample.png" alt="sample" width={64} height={64} priority />
      </section>
    </main>
  );
}
