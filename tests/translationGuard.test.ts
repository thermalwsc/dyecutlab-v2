import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KEEP_AS_IS,
  checkTranslation,
  describeGuardProblems,
  detectLanguage,
  extractCodes,
  extractNumbers,
  isLang,
  otherLang,
  translationDirection,
} from "../lib/translationGuard.ts";
import { GLOSSARY, buildTranslationInstructions } from "../lib/translationPrompt.ts";

/* The messages here are made up, in the style of the factory documents. */

test("only English and Chinese are languages the thread knows", () => {
  assert.equal(isLang("en"), true);
  assert.equal(isLang("zh"), true);
  for (const bad of ["fr", "EN", "", null, undefined, 5]) assert.equal(isLang(bad), false, String(bad));
  assert.equal(otherLang("en"), "zh");
  assert.equal(otherLang("zh"), "en");
});

test("the language is read from the words, not the numbers", () => {
  assert.equal(detectLanguage("Please confirm the price stays at $0.466."), "en");
  assert.equal(detectLanguage("我们可以用400克卡纸，价格不变。"), "zh");
  assert.equal(detectLanguage("OK 好的，400g可以。"), "zh");
  assert.equal(detectLanguage("Please send the proof to 王先生 today."), "en", "a name does not make it Chinese");
  assert.equal(detectLanguage("3000"), null);
  assert.equal(detectLanguage("  $1,398 -> 2,343  "), null);
  assert.equal(detectLanguage(""), null);
});

test("a message is always translated for the other side, and a numbers-only message is skipped", () => {
  assert.deepEqual(translationDirection("Hello, the size is 400 mm."), { from: "en", to: "zh" });
  assert.deepEqual(translationDirection("尺寸是400毫米。"), { from: "zh", to: "en" });
  assert.equal(translationDirection("3000"), null);
});

test("numbers are found the same way however they are written", () => {
  assert.deepEqual(extractNumbers("3,000 sets at $0.466, 2.99%"), ["3000", "0.466", "2.99"]);
  assert.deepEqual(extractNumbers("Unfolded size: 514.6x384.6mm"), ["514.6", "384.6"]);
  assert.deepEqual(extractNumbers("12-18 working days"), ["12", "18"]);
  assert.deepEqual(extractNumbers("Date 2026-11-04"), ["2026", "11", "4"]);
  assert.deepEqual(extractNumbers("price 0.50 or .5 or 0.5"), ["0.5", "0.5", "0.5"]);
  assert.deepEqual(extractNumbers("３０００个，单价０．４６６美元"), ["3000", "0.466"], "full-width digits are read");
  assert.deepEqual(extractNumbers("no numbers here"), []);
  assert.deepEqual(extractNumbers("tracking 12345678901234567890"), ["12345678901234567890"], "long numbers stay exact");
});

test("the technical codes are found as whole words", () => {
  assert.deepEqual(extractCodes("Spot UV and soft touch matte, CMYK"), ["CMYK", "UV"]);
  assert.deepEqual(extractCodes("局部UV，CMYK印刷"), ["CMYK", "UV"]);
  assert.deepEqual(extractCodes("UVA protection, PEOPLE"), []);
  assert.ok(KEEP_AS_IS.includes("EXW"));
});

test("a faithful translation passes", () => {
  const original = "Yes, 400g paper card is fine. Please confirm 3,000 sets at $0.466, ready in 12-18 working days. CMYK, spot UV.";
  const translated = "是的，400g卡纸可以。请确认3000套，单价$0.466，生产周期12-18个工作日。CMYK，局部UV。";
  const result = checkTranslation(original, translated);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(describeGuardProblems(result), "");
});

test("a changed number is caught, both ways round", () => {
  const result = checkTranslation("3000 sets at $0.466", "3500套，单价$0.466");
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingNumbers, ["3000"]);
  assert.deepEqual(result.addedNumbers, ["3500"]);
  assert.match(describeGuardProblems(result), /3000/);
  assert.match(describeGuardProblems(result), /3500/);
});

test("a dropped number is caught", () => {
  const result = checkTranslation("Size 514.6 x 384.6 mm", "尺寸 514.6 毫米");
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingNumbers, ["384.6"]);
  assert.deepEqual(result.addedNumbers, []);
});

test("a number spelled out in words is caught, so the translator is held to digits", () => {
  const result = checkTranslation("交货期需要二十天，数量3000个。", "Delivery takes twenty days, quantity 3000.");
  assert.equal(result.ok, true, "words in the original are not numbers, so nothing is missing...");
  const reverse = checkTranslation("Delivery takes 20 days.", "交货期需要二十天。");
  assert.equal(reverse.ok, false, "...but a digit turned into words is");
  assert.deepEqual(reverse.missingNumbers, ["20"]);
});

test("a repeated number must repeat", () => {
  assert.equal(checkTranslation("2 designs, 1500 pcs each", "2个设计，每个1500个").ok, true);
  const lost = checkTranslation("2 designs, 2 bags", "2个设计，袋子");
  assert.equal(lost.ok, false);
  assert.deepEqual(lost.missingNumbers, ["2"]);
});

test("a technical code that was translated away is caught", () => {
  const result = checkTranslation("CMYK, spot UV", "四色印刷，局部光油");
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingCodes, ["CMYK", "UV"]);
  assert.match(describeGuardProblems(result), /CMYK, UV/);
});

test("the instructions say what matters and carry the glossary the right way round", () => {
  const toChinese = buildTranslationInstructions("en", "zh");
  assert.match(toChinese, /English to Chinese/);
  assert.match(toChinese, /digits/);
  assert.match(toChinese, /spot UV = 局部UV/);
  const toEnglish = buildTranslationInstructions("zh", "en");
  assert.match(toEnglish, /Chinese \(Simplified\) to English/);
  assert.match(toEnglish, /局部UV = spot UV/);
  for (const row of GLOSSARY) assert.ok(row.en && row.zh, "every glossary row has both languages");
  assert.equal(new Set(GLOSSARY.map((row) => row.en)).size, GLOSSARY.length, "no term twice");
});
