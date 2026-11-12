import type { Lang } from "../../lib/translationGuard";
import { setPortalLanguage } from "./langActions";

/* 中文 / English. Each button is its own tiny form, so it works without any script. */
export default function LanguageSwitch({ lang, label }: { lang: Lang; label: string }) {
  const option = (value: Lang, text: string) => (
    <form action={setPortalLanguage}>
      <input type="hidden" name="lang" value={value} />
      <button
        type="submit"
        lang={value}
        aria-pressed={lang === value}
        className={`min-h-[40px] rounded-full border-2 border-black px-4 text-[14px] font-extrabold transition ${
          lang === value ? "bg-black text-white" : "bg-white text-black hover:bg-zinc-100"
        }`}
      >
        {text}
      </button>
    </form>
  );

  return (
    <div role="group" aria-label={label} className="mt-5 flex flex-wrap items-center gap-2">
      {option("zh", "中文")}
      {option("en", "English")}
    </div>
  );
}
