/* =========================================================
   Reading quote versions before the "kind" migration has been run
============================================================
   Quote versions gained a "kind" column (supabase/migrations/20261104000000_quote_version_kind.sql).
   If the site is deployed before that migration is applied, a query that asks for
   the column fails with "undefined column" (42703). Rather than break the team's
   screens and the PDF download, ask again without it: every version is then read
   as an estimate, which is exactly what they all were before. No server-only
   imports. */

type Result<T> = { data: T | null; error: { code?: string } | null };

export async function withKindFallback<T>(run: (includeKind: boolean) => PromiseLike<Result<T>>): Promise<Result<T>> {
  const first = await run(true);
  if (first.error?.code === "42703") return run(false);
  return first;
}
