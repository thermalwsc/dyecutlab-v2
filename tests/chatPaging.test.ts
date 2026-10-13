import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_DEFAULT, PAGE_MAX, parsePageRequest, toPage } from "../lib/chatPaging.ts";

const ask = (query: string) => parsePageRequest(new URLSearchParams(query));

test("no query gives the default page with no cut-off", () => {
  assert.deepEqual(ask(""), { limit: PAGE_DEFAULT, before: null });
});

test("limit is a whole number from 1 up to the maximum", () => {
  assert.equal(ask("limit=20").limit, 20);
  assert.equal(ask(`limit=${PAGE_MAX}`).limit, PAGE_MAX);
  assert.equal(ask("limit=100000").limit, PAGE_MAX);
  for (const bad of ["0", "-5", "2.5", "lots", ""]) assert.equal(ask(`limit=${bad}`).limit, PAGE_DEFAULT, bad);
});

test("before must be a real date and comes back normalised", () => {
  assert.equal(ask("before=2026-10-12T10:00:00Z").before, "2026-10-12T10:00:00.000Z");
  for (const bad of ["yesterday", "not-a-date", "'; drop table projects; --"]) assert.equal(ask(`before=${encodeURIComponent(bad)}`).before, null, bad);
});

test("a page is returned oldest first, and says when earlier messages exist", () => {
  const newestFirst = [5, 4, 3, 2, 1].map((n) => ({ n }));
  assert.deepEqual(toPage(newestFirst, 3), { messages: [{ n: 3 }, { n: 4 }, { n: 5 }].map((x) => x), hasMore: true });
});

test("when everything fits there is nothing earlier", () => {
  const page = toPage([{ n: 2 }, { n: 1 }], 3);
  assert.deepEqual(page, { messages: [{ n: 1 }, { n: 2 }], hasMore: false });
  assert.equal(toPage([{ n: 3 }, { n: 2 }, { n: 1 }], 3).hasMore, false, "exactly a full page is not 'more'");
});

test("nothing or garbage gives an empty page", () => {
  assert.deepEqual(toPage(null, 50), { messages: [], hasMore: false });
  assert.deepEqual(toPage(undefined, 50), { messages: [], hasMore: false });
  assert.deepEqual(toPage("nope" as never, 50), { messages: [], hasMore: false });
});
