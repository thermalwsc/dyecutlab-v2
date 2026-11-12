import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CORRECTION_KINDS,
  CORRECTION_NOTE_MAX,
  CORRECTION_TEXT_MAX,
  canCorrect,
  correctionDatabaseMessage,
  correctionKindLabel,
  correctionLabels,
  correctionWarning,
  isCorrectionKind,
  parseCorrection,
} from "../lib/translationCorrection.ts";

/* Every message here is made up. */

const ID = "123e4567-e89b-42d3-a456-426614174000";

function parse(fields: Record<string, string>) {
  return parseCorrection((name) => fields[name]);
}

test("the kinds of mistake are the ones the database knows", () => {
  assert.deepEqual([...CORRECTION_KINDS], ["number", "term", "wording", "missing", "other"]);
  assert.equal(isCorrectionKind("number"), true);
  for (const bad of ["spelling", "", "Number", null, undefined, 3]) assert.equal(isCorrectionKind(bad), false, String(bad));
});

test("every kind has words in both languages, and Chinese is Chinese", () => {
  for (const kind of CORRECTION_KINDS) {
    assert.ok(correctionKindLabel(kind, "en").trim(), `en ${kind}`);
    assert.match(correctionKindLabel(kind, "zh"), /[一-鿿]/, `zh ${kind}`);
  }
  assert.equal(correctionKindLabel("mystery", "en"), "mystery", "an unknown kind shows as it is");
  assert.equal(correctionKindLabel(null, "zh"), "");
});

test("you correct the translation you read, never your own message, and only once it is translated", () => {
  const done = { sender_side: "factory", translation_status: "done", translated_text: "The price is $1." };
  assert.equal(canCorrect("team", done), true, "the team reads a factory message in English");
  assert.equal(canCorrect("factory", done), false, "the factory wrote it");
  assert.equal(canCorrect("factory", { ...done, sender_side: "team" }), true);
  for (const status of ["pending", "failed", "skipped"]) assert.equal(canCorrect("team", { ...done, translation_status: status }), false, status);
  assert.equal(canCorrect("team", { ...done, translated_text: null }), false);
});

test("a good correction is cleaned", () => {
  const result = parse({ message_id: ID, kind: "wording", new_text: "  The unit price is $0.466.\r\n  ", note: "  Said   dollars  " });
  assert.deepEqual(result.ok && result.value, { message_id: ID, new_text: "The unit price is $0.466.", kind: "wording", note: "Said dollars" });
  const bare = parse({ message_id: ID, kind: "number", new_text: "请确认3000套。" });
  assert.deepEqual(bare.ok && bare.value, { message_id: ID, new_text: "请确认3000套。", kind: "number", note: null });
});

test("a correction with something missing is refused with a plain sentence", () => {
  const cases: [Record<string, string>, RegExp][] = [
    [{ kind: "number", new_text: "x" }, /could not be found/],
    [{ message_id: "not-an-id", kind: "number", new_text: "x" }, /could not be found/],
    [{ message_id: ID, new_text: "x" }, /Choose what was wrong/],
    [{ message_id: ID, kind: "spelling", new_text: "x" }, /Choose what was wrong/],
    [{ message_id: ID, kind: "number", new_text: "   " }, /Write the corrected/],
    [{ message_id: ID, kind: "number", new_text: "x".repeat(CORRECTION_TEXT_MAX + 1) }, /too long/],
    [{ message_id: ID, kind: "number", new_text: "x", note: "y".repeat(CORRECTION_NOTE_MAX + 1) }, /note is too long/],
    [{ message_id: ID, kind: "other", new_text: "x" }, /Say what was wrong/],
    [{ message_id: ID, kind: "other", new_text: "x", note: "   " }, /Say what was wrong/],
  ];
  for (const [fields, pattern] of cases) {
    const result = parse(fields);
    assert.equal(result.ok, false, JSON.stringify(fields).slice(0, 80));
    assert.match(!result.ok ? result.message : "", pattern);
  }
  assert.equal(parse({ message_id: ID, kind: "other", new_text: "x", note: "Wrong tone" }).ok, true, "other is fine with a note");
});

test("the form cannot carry a side, a factory or an old translation", () => {
  const result = parse({ message_id: ID, kind: "term", new_text: "x", corrector_side: "factory", factory_id: "x", old_text: "y" });
  assert.deepEqual(Object.keys(result.ok ? result.value : {}).sort(), ["kind", "message_id", "new_text", "note"]);
});

test("a correction that breaks a number is caught against the original, one that keeps them is not", () => {
  const original = "Please confirm 3,000 sets at $0.466, ready in 12-18 working days.";
  assert.equal(correctionWarning(original, "请确认3000套，单价$0.466，12-18个工作日内完成。"), null);
  const warning = correctionWarning(original, "请确认3500套，单价$0.466，12-18个工作日内完成。");
  assert.match(warning ?? "", /3000/);
  assert.match(warning ?? "", /3500/);
});

test("a database refusal becomes a plain sentence and never leaks the database words", () => {
  assert.match(correctionDatabaseMessage({ code: "42501" }), /project you can see/);
  assert.match(correctionDatabaseMessage({ code: "23514" }), /finished translation/);
  for (const error of [{ code: "XX000" }, null, undefined]) {
    const text = correctionDatabaseMessage(error);
    assert.ok(!/relation|constraint|translation_corrections|violates/.test(text), text);
  }
});

test("the words on screen exist in both languages", () => {
  for (const lang of ["en", "zh"] as const) {
    for (const [key, value] of Object.entries(correctionLabels(lang))) assert.ok(value.trim(), `${lang} ${key}`);
  }
  assert.match(correctionLabels("zh").open, /[一-鿿]/);
  assert.doesNotMatch(correctionLabels("en").open, /[一-鿿]/);
});
