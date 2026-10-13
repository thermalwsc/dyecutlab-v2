/* =========================================================
   DYE CUT LAB — paging through a project's saved chat
============================================================
   The history route returns the newest messages first-page-style, and the page
   asks for earlier ones with "before". Reading the whole conversation every
   time gets slower with every message, and the database caps one read at
   1,000 rows, which would drop the NEWEST messages. Pure functions, covered by
   tests/chatPaging.test.ts. */

export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 100;

export type PageRequest = { limit: number; before: string | null };

export function parsePageRequest(params: URLSearchParams): PageRequest {
  const asked = Number(params.get("limit"));
  const limit = Number.isInteger(asked) && asked >= 1 ? Math.min(asked, PAGE_MAX) : PAGE_DEFAULT;

  const rawBefore = params.get("before");
  const before = rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? new Date(rawBefore).toISOString() : null;

  return { limit, before };
}

/* rowsNewestFirst: the rows read with limit + 1. Returns the page in reading
   order (oldest first) and whether earlier messages exist. */
export function toPage<T>(rowsNewestFirst: T[] | null | undefined, limit: number) {
  const rows = Array.isArray(rowsNewestFirst) ? rowsNewestFirst : [];
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse(), hasMore };
}
