import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_MAX,
  failedUpdate,
  finishedUpdate,
  parseThreadMessage,
  planTranslation,
  readerLang,
  recipientLang,
  skippedUpdate,
  threadDatabaseMessage,
  threadLabels,
  viewMessage,
  type ThreadMessageRow,
} from "../lib/factoryThread.ts";

/* Every message here is made up. */

const NOW = new Date("2026-11-11T10:00:00Z");

function parse(message: string, sender: "team" | "factory" = "team") {
  return parseThreadMessage((name) => (name === "message" ? message : undefined), sender);
}

test("the team reads English and the factory reads Chinese, and a message is for the other side", () => {
  assert.equal(readerLang("team"), "en");
  assert.equal(readerLang("factory"), "zh");
  assert.equal(recipientLang("team"), "zh");
  assert.equal(recipientLang("factory"), "en");
});

test("a typed message is cleaned and its language is read from the words", () => {
  const english = parse("  Please confirm 3,000 sets.\r\n\r\n\r\n\r\nThanks  ");
  assert.deepEqual(english.ok && english.value, { text: "Please confirm 3,000 sets.\n\nThanks", lang: "en" });
  const chinese = parse("可以，400克卡纸。", "factory");
  assert.deepEqual(chinese.ok && chinese.value, { text: "可以，400克卡纸。", lang: "zh" });
});

test("a message that is only numbers counts as the sender's own language", () => {
  const team = parse("3000", "team");
  const factory = parse("3000", "factory");
  assert.equal(team.ok && team.value.lang, "en");
  assert.equal(factory.ok && factory.value.lang, "zh");
});

test("an empty or very long message is refused with a plain sentence", () => {
  for (const text of ["", "   ", "\n\n"]) {
    const result = parse(text);
    assert.equal(result.ok, false, JSON.stringify(text));
    assert.match(!result.ok ? result.message : "", /Write a message/);
  }
  assert.equal(parse("x".repeat(MESSAGE_MAX)).ok, true);
  const long = parse("x".repeat(MESSAGE_MAX + 1));
  assert.equal(long.ok, false);
  assert.match(!long.ok ? long.message : "", /too long/);
});

test("the form cannot carry a side, a factory or a translation", () => {
  const result = parseThreadMessage((name) => ({ message: "Hello", sender_side: "factory", factory_id: "x", translated_text: "你好" })[name as "message"], "team");
  assert.deepEqual(Object.keys(result.ok ? result.value : {}).sort(), ["lang", "text"]);
});

test("a message is translated for the other side, and skipped when there is nothing to do", () => {
  assert.deepEqual(planTranslation("team", "Please confirm the size."), { kind: "translate", from: "en", to: "zh" });
  assert.deepEqual(planTranslation("factory", "尺寸没有问题。"), { kind: "translate", from: "zh", to: "en" });
  assert.deepEqual(planTranslation("team", "3000"), { kind: "skip" }, "only numbers");
  assert.deepEqual(planTranslation("team", "好的，谢谢"), { kind: "skip" }, "the team wrote Chinese: the factory can already read it");
  assert.deepEqual(planTranslation("factory", "OK, thank you"), { kind: "skip" }, "the factory wrote English: the team can already read it");
});

test("a faithful translation is saved without a warning", () => {
  const update = finishedUpdate("Confirm 3,000 sets at $0.466, spot UV.", "请确认3000套，单价$0.466，局部UV。", "zh", NOW);
  assert.equal(update.translation_status, "done");
  assert.equal(update.translated_text, "请确认3000套，单价$0.466，局部UV。");
  assert.equal(update.translated_lang, "zh");
  assert.equal(update.translation_note, null);
  assert.equal(update.translated_at, NOW.toISOString());
});

test("a translation that changes a number is saved, but with a note saying what to check", () => {
  const update = finishedUpdate("Confirm 3000 sets at $0.466.", "请确认3500套，单价$0.466。", "zh", NOW);
  assert.equal(update.translation_status, "done");
  assert.match(update.translation_note ?? "", /3000/);
  assert.match(update.translation_note ?? "", /3500/);
});

test("an empty, missing or huge translation counts as failed", () => {
  for (const bad of ["", "   ", null, undefined, "x".repeat(12001)]) {
    const update = finishedUpdate("Hello", bad as string, "zh", NOW);
    assert.equal(update.translation_status, "failed", String(bad).slice(0, 10));
    assert.equal(update.translated_text, null);
  }
  assert.equal(failedUpdate(NOW).translation_status, "failed");
  assert.equal(skippedUpdate(NOW).translation_status, "skipped");
});

function row(overrides: Partial<ThreadMessageRow> = {}): ThreadMessageRow {
  return {
    original_text: "Please confirm the size.",
    original_lang: "en",
    translated_text: null,
    translated_lang: null,
    translation_status: "pending",
    translation_note: null,
    ...overrides,
  };
}

test("a reader sees their own language first, with the original behind it", () => {
  const sent = row({ original_text: "我们可以用400克卡纸。", original_lang: "zh", translated_text: "We can use 400 g card.", translated_lang: "en", translation_status: "done" });
  const team = viewMessage(sent, "team");
  assert.equal(team.text, "We can use 400 g card.");
  assert.equal(team.original, "我们可以用400克卡纸。");
  assert.equal(team.originalLang, "zh");
  assert.equal(team.state, "translated");

  const own = viewMessage(sent, "factory");
  assert.equal(own.text, "我们可以用400克卡纸。", "the writer sees what they wrote");
  assert.equal(own.original, null);
  assert.equal(own.state, "original");
});

test("the factory reads the Chinese translation of a team message", () => {
  const sent = row({ translated_text: "请确认尺寸。", translated_lang: "zh", translation_status: "done" });
  const factory = viewMessage(sent, "factory");
  assert.equal(factory.text, "请确认尺寸。");
  assert.equal(factory.original, "Please confirm the size.");
  assert.equal(factory.originalLang, "en");
  assert.equal(viewMessage(sent, "team").original, null);
});

test("a corrected translation says so, and a warning on it still wins", () => {
  const corrected = row({ translated_text: "请确认尺寸。", translated_lang: "zh", translation_status: "done", corrected_at: "2026-11-13T10:00:00Z" });
  assert.equal(viewMessage(corrected, "factory").state, "corrected");
  assert.equal(viewMessage({ ...corrected, translation_note: "Check 400" }, "factory").state, "flagged");
  assert.equal(viewMessage(row({ translated_text: "请确认尺寸。", translated_lang: "zh", translation_status: "done" }), "factory").state, "translated");
});

test("a flagged translation carries what to check; a pending or failed one shows the original", () => {
  const flagged = viewMessage(row({ translated_text: "请确认尺寸。", translated_lang: "zh", translation_status: "done", translation_note: "Check 400" }), "factory");
  assert.equal(flagged.state, "flagged");
  assert.equal(flagged.note, "Check 400");

  const pending = viewMessage(row(), "factory");
  assert.equal(pending.state, "pending");
  assert.equal(pending.text, "Please confirm the size.");

  const failed = viewMessage(row({ translation_status: "failed", translation_note: "The translation did not finish." }), "factory");
  assert.equal(failed.state, "failed");
  assert.equal(failed.text, "Please confirm the size.");
});

test("a skipped message simply shows the original, and a translation into the wrong language is never shown", () => {
  assert.equal(viewMessage(row({ translation_status: "skipped" }), "factory").state, "original");
  const odd = viewMessage(row({ translated_text: "Hello", translated_lang: "en", translation_status: "done" }), "factory");
  assert.equal(odd.text, "Please confirm the size.");
  assert.equal(odd.state, "original");
});

test("the writer can see exactly what the other side reads, and any warning on it", () => {
  const sent = row({ translated_text: "请确认尺寸。", translated_lang: "zh", translation_status: "done" });
  const team = viewMessage(sent, "team");
  assert.equal(team.text, "Please confirm the size.");
  assert.deepEqual(team.theirs, { text: "请确认尺寸。", lang: "zh", note: null, corrected: false });
  assert.equal(viewMessage({ ...sent, corrected_at: "2026-11-13T10:00:00Z" }, "team").theirs?.corrected, true);

  const flagged = viewMessage({ ...sent, translation_note: "Check 400" }, "team");
  assert.equal(flagged.theirs?.note, "Check 400");

  assert.equal(viewMessage(row(), "team").theirs, null, "nothing to show while it is pending");
  assert.equal(viewMessage(row({ translation_status: "failed" }), "team").theirs, null);
  assert.equal(viewMessage(sent, "factory").theirs, null, "the reader of a translation has no 'theirs'");
  assert.equal(threadLabels("team").viewTheirs("zh"), "What the factory reads (Chinese)");
  assert.equal(threadLabels("factory", "zh").viewTheirs("en"), "DYE CUT LAB 看到的版本（英文）");
});

test("the words on screen exist for both readers", () => {
  for (const side of ["team", "factory"] as const) {
    const labels = threadLabels(side);
    for (const [key, value] of Object.entries(labels)) {
      if (typeof value === "string") assert.ok(value.trim(), `${side} ${key}`);
    }
    assert.ok(labels.viewOriginal("en") && labels.viewOriginal("zh"));
  }
  assert.match(threadLabels("factory").heading, /[一-鿿]/, "the factory's words are Chinese");
  assert.doesNotMatch(threadLabels("team").heading, /[一-鿿]/);
});

test("a database refusal becomes a plain sentence and never leaks the database words", () => {
  assert.match(threadDatabaseMessage({ code: "42501" }), /assigned to your factory/);
  for (const error of [{ code: "23514" }, { code: "XX000" }, null, undefined]) {
    const text = threadDatabaseMessage(error);
    assert.ok(!/relation|constraint|factory_messages|violates/.test(text), text);
  }
});
