import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_STATUSES } from "../app/admin/statuses.ts";
import {
  BRIEF_LABELS_ZH,
  CHANGE_KIND_ZH,
  DEFAULT_PORTAL_LANG,
  FILE_CATEGORY_ZH,
  MESSAGES_ZH,
  MOVES_ZH,
  QUOTE_STATUS_ZH,
  localizeWhy,
  nextStepZh,
  parsePortalLang,
  portalDate,
  portalText,
  stageLabelFor,
} from "../lib/factoryI18n.ts";
import { CHANGE_KINDS, changeDatabaseMessage, parseFactoryChange } from "../lib/factoryChange.ts";
import { FACTORY_QUOTE_STATUSES, parseFactoryQuote, quoteDatabaseMessage } from "../lib/factoryQuote.ts";
import { BRIEF_FIELDS, FACTORY_MESSAGES, FACTORY_MOVES, FILE_CATEGORY_LABELS, factoryNextFor } from "../lib/factoryWork.ts";
import { MESSAGE_MAX, parseThreadMessage, threadDatabaseMessage, threadLabels } from "../lib/factoryThread.ts";
import { correctionDatabaseMessage, parseCorrection } from "../lib/translationCorrection.ts";

const CJK = /[一-鿿]/;

test("a factory reads Chinese until it chooses English, and an odd cookie changes nothing", () => {
  assert.equal(DEFAULT_PORTAL_LANG, "zh");
  assert.equal(parsePortalLang(undefined), "zh");
  assert.equal(parsePortalLang(null), "zh");
  assert.equal(parsePortalLang("en"), "en");
  assert.equal(parsePortalLang("zh"), "zh");
  for (const odd of ["", "fr", "EN", "<script>", "zh-CN"]) assert.equal(parsePortalLang(odd), "zh", odd);
});

test("both languages have the same lines, and the Chinese ones are Chinese", () => {
  const en = portalText("en");
  const zh = portalText("zh");
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  /* the one line that is only a full stop */
  const punctuationOnly = new Set(["wrongAfter"]);
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    const e = en[key];
    const z = zh[key];
    assert.equal(typeof z, typeof e, key);
    const text = typeof z === "function" ? (z as (a: unknown, b: unknown) => string)(3, "x") : z;
    assert.ok(text.trim(), `${key} is not empty`);
    if (!punctuationOnly.has(key)) assert.ok(CJK.test(text), `${key} should be Chinese: ${text}`);
  }
});

test("the English words are the ones that were on screen before", () => {
  const en = portalText("en");
  assert.equal(en.introAttention(1), "One project needs your attention.");
  assert.equal(en.introAttention(3), "3 projects need your attention.");
  assert.equal(en.delivered(2), "Delivered (2)");
  assert.equal(en.version(2, "$650.00"), "Version 2 · $650.00");
  assert.equal(en.pieces("500"), "500 pcs");
  assert.equal(en.qSend, "Send quote");
});

test("every project stage has a Chinese name and a Chinese 'what is on you'", () => {
  for (const status of PROJECT_STATUSES) {
    assert.ok(CJK.test(stageLabelFor("zh", status, "English")), `stage ${status}`);
    const zh = factoryNextFor(status, "zh");
    const en = factoryNextFor(status, "en");
    assert.ok(CJK.test(zh.headline) && CJK.test(zh.detail), `next ${status}`);
    assert.equal(zh.tone, en.tone, `${status} keeps who it is waiting on`);
    assert.equal(Boolean(zh.cta), Boolean(en.cta), `${status} has a button in both or neither`);
  }
  assert.equal(stageLabelFor("en", "qc", "QC"), "QC");
  assert.equal(stageLabelFor("zh", "mystery", "Mystery"), "Mystery", "an unknown stage shows as it is");
  assert.ok(CJK.test(nextStepZh("mystery").headline), "an unknown stage still has Chinese words");
});

test("every brief field, file kind, change kind, quote status and factory move has Chinese", () => {
  for (const { key } of BRIEF_FIELDS) assert.ok(CJK.test(BRIEF_LABELS_ZH[key] ?? ""), `brief ${key}`);
  for (const key of Object.keys(FILE_CATEGORY_LABELS)) assert.ok(CJK.test(FILE_CATEGORY_ZH[key] ?? ""), `file ${key}`);
  for (const kind of CHANGE_KINDS) assert.ok(CJK.test(CHANGE_KIND_ZH[kind] ?? ""), `change ${kind}`);
  for (const status of FACTORY_QUOTE_STATUSES) assert.ok(CJK.test(QUOTE_STATUS_ZH[status] ?? ""), `quote ${status}`);
  for (const stage of Object.keys(FACTORY_MOVES)) {
    assert.ok(CJK.test(MOVES_ZH[stage]?.button ?? "") && CJK.test(MOVES_ZH[stage]?.note ?? ""), `move ${stage}`);
  }
});

test("every message the factory can be shown after an action has Chinese", () => {
  for (const key of Object.keys(FACTORY_MESSAGES)) assert.ok(CJK.test(MESSAGES_ZH[key] ?? ""), `message ${key}`);
});

test("every sentence a refused form can come back with has a Chinese version", () => {
  const sentences: string[] = [];
  const quote = (fields: Record<string, string>) => {
    const result = parseFactoryQuote((name) => fields[name]);
    if (!result.ok) sentences.push(result.message);
  };
  quote({});
  quote({ quantity: "abc", price_per_piece: "1" });
  quote({ quantity: "5" });
  quote({ quantity: "5", price_per_piece: "abc" });
  quote({ quantity: "5", price_per_piece: "0" });
  quote({ quantity: "5", price_per_piece: "5000000" });
  quote({ quantity: "5", price_per_piece: "1", tooling_cost: "abc" });
  quote({ quantity: "5", price_per_piece: "1", lead_days: "2.5" });
  quote({ quantity: "5", price_per_piece: "1", notes: "x".repeat(2001) });

  const change = (fields: Record<string, string>) => {
    const result = parseFactoryChange((name) => fields[name]);
    if (!result.ok) sentences.push(result.message);
  };
  change({});
  change({ kind: "price" });
  change({ kind: "price", what_changed: "x" });
  change({ kind: "price", what_changed: "x".repeat(1001), reason: "y" });
  change({ kind: "price", what_changed: "x", reason: "y".repeat(1001) });

  for (const text of ["", "x".repeat(MESSAGE_MAX + 1)]) {
    const result = parseThreadMessage(() => text, "factory");
    if (!result.ok) sentences.push(result.message);
  }
  for (const code of ["42501", "23514", "XX000"]) {
    sentences.push(quoteDatabaseMessage({ code }), changeDatabaseMessage({ code }), threadDatabaseMessage({ code }), correctionDatabaseMessage({ code }));
  }
  const ID = "123e4567-e89b-42d3-a456-426614174000";
  const correction = (fields: Record<string, string>) => {
    const result = parseCorrection((name) => fields[name]);
    if (!result.ok) sentences.push(result.message);
  };
  correction({});
  correction({ message_id: ID });
  correction({ message_id: ID, kind: "number" });
  correction({ message_id: ID, kind: "number", new_text: "x".repeat(12001) });
  correction({ message_id: ID, kind: "number", new_text: "x", note: "y".repeat(1001) });
  correction({ message_id: ID, kind: "other", new_text: "x" });

  assert.ok(sentences.length >= 20);
  for (const sentence of new Set(sentences)) {
    assert.ok(CJK.test(localizeWhy("zh", sentence)), `no Chinese for: ${sentence}`);
    assert.equal(localizeWhy("en", sentence), sentence, "English is left exactly as it was");
  }
  assert.equal(localizeWhy("zh", "Something nobody wrote a translation for."), "Something nobody wrote a translation for.");
});

test("dates follow the language, and the thread's words follow it too", () => {
  assert.match(portalDate("zh", "2026-11-11T12:00:00Z"), /2026年11月1[012]日/);
  assert.match(portalDate("en", "2026-11-11T12:00:00Z"), /Nov 1[012], 2026/);
  assert.match(threadLabels("factory", "zh").heading, CJK);
  assert.equal(threadLabels("factory", "en").other, "DYE CUT LAB");
  assert.equal(threadLabels("factory", "en").viewOriginal("en"), "View original (English)");
  assert.equal(threadLabels("team", "zh").heading, "Messages with the factory", "the team's screen never changes");
});
