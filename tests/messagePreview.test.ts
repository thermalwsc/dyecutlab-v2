import { test } from "node:test";
import assert from "node:assert/strict";
import { latestByProject, latestMessage, previewSender, previewText, toPreview } from "../lib/messagePreview.ts";

const msg = (over: Record<string, string> = {}) => ({
  role: "user",
  message: "hello",
  created_at: "2026-10-20T10:00:00.000Z",
  ...over,
});

test("the assistant is called DICI and the customer is You", () => {
  assert.equal(previewSender("baba"), "DICI");
  assert.equal(previewSender("user"), "You");
  assert.equal(previewSender(null), "DICI");
});

test("a preview is one tidy line", () => {
  assert.equal(previewText("  Hello\n\n  there   friend  "), "Hello there friend");
  assert.equal(previewText("**Bold** and `code` and [a link](https://x.test)"), "Bold and code and a link");
  assert.equal(previewText(""), "");
  assert.equal(previewText(null), "");
  assert.equal(previewText("```js\nconsole.log(1)\n```"), "");
});

test("a long message is cut at a word with an ellipsis", () => {
  const long = "word ".repeat(60).trim();
  const out = previewText(long, 40);
  assert.ok(out.endsWith("…"), out);
  assert.ok(out.length <= 40, `${out.length}`);
  assert.ok(!out.includes("wor…") || out.endsWith("word…"), out);
  assert.equal(previewText("short one", 40), "short one");
});

test("the newest message wins whatever the order", () => {
  const rows = [
    msg({ message: "first", created_at: "2026-10-01T09:00:00.000Z" }),
    msg({ message: "last", created_at: "2026-10-03T09:00:00.000Z" }),
    msg({ message: "middle", created_at: "2026-10-02T09:00:00.000Z" }),
  ];
  assert.equal(latestMessage(rows)?.message, "last");
  assert.equal(latestMessage([...rows].reverse())?.message, "last");
});

test("no messages, or only unreadable dates, gives nothing", () => {
  assert.equal(latestMessage([]), null);
  assert.equal(latestMessage(null), null);
  assert.equal(latestMessage([msg({ created_at: "nope" })]), null);
  assert.equal(toPreview(null), null);
  assert.equal(toPreview(msg({ message: "   " })), null);
});

test("each project gets its own newest message", () => {
  const out = latestByProject([
    { ...msg({ message: "a old", created_at: "2026-10-01T09:00:00.000Z" }), project_id: "A" },
    { ...msg({ message: "a new", role: "baba", created_at: "2026-10-05T09:00:00.000Z" }), project_id: "A" },
    { ...msg({ message: "b only" }), project_id: "B" },
    { ...msg({ message: "   " }), project_id: "C" },
  ]);

  assert.deepEqual(Object.keys(out).sort(), ["A", "B"]);
  assert.equal(out.A.text, "a new");
  assert.equal(out.A.from, "DICI");
  assert.equal(out.B.from, "You");
  assert.deepEqual(latestByProject(null), {});
});
