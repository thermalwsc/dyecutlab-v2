import { test } from "node:test";
import assert from "node:assert/strict";
import { withKindFallback } from "../lib/quoteKindFallback.ts";

test("when the kind column exists, one query is enough", async () => {
  const asked: boolean[] = [];
  const result = await withKindFallback(async (includeKind) => {
    asked.push(includeKind);
    return { data: ["row"], error: null };
  });
  assert.deepEqual(asked, [true]);
  assert.deepEqual(result.data, ["row"]);
});

test("when the column does not exist yet, it asks again without it", async () => {
  const asked: boolean[] = [];
  const result = await withKindFallback(async (includeKind) => {
    asked.push(includeKind);
    return includeKind ? { data: null, error: { code: "42703" } } : { data: ["old row"], error: null };
  });
  assert.deepEqual(asked, [true, false]);
  assert.deepEqual(result.data, ["old row"]);
  assert.equal(result.error, null);
});

test("any other error is passed on, not retried", async () => {
  const asked: boolean[] = [];
  const result = await withKindFallback(async (includeKind) => {
    asked.push(includeKind);
    return { data: null, error: { code: "42501" } };
  });
  assert.deepEqual(asked, [true]);
  assert.equal(result.error?.code, "42501");
});
