import { test } from "node:test";
import assert from "node:assert/strict";
import { questionKindFromText } from "../lib/intakeQuestions.ts";

test("the new 'designs or flavors' question gets the count buttons, not the artwork ones", () => {
  assert.equal(questionKindFromText("How many different designs or flavors?"), "flavors");
  assert.equal(questionKindFromText("How many designs or flavors will the boxes have?"), "flavors");
  assert.equal(questionKindFromText("How many different designs should the boxes be made in?"), "flavors");
  assert.equal(questionKindFromText("How many variants do you need?"), "flavors");
});

test("the old flavor wording still works", () => {
  assert.equal(questionKindFromText("How many flavors will the pouch include?"), "flavors");
  assert.equal(questionKindFromText("How many flavours?"), "flavors");
  assert.equal(questionKindFromText("Which strains are these for?"), "flavors");
});

test("the artwork question is still the artwork question", () => {
  assert.equal(questionKindFromText("Do you have artwork ready, or will the design need to be created?"), "artwork");
  assert.equal(questionKindFromText("Will you need us to create the design?"), "artwork");
  assert.equal(questionKindFromText("Is the artwork the same for every flavor?"), "artwork");
});

test("units, pieces, pictures and packaging are recognised", () => {
  assert.equal(questionKindFromText("How many units would you like?"), "quantity");
  assert.equal(questionKindFromText("Is that 100 finished pieces, or 100 units? A unit is 128 pieces."), "quantity");
  assert.equal(questionKindFromText("Do you have a visual reference to share?"), "reference");
  assert.equal(questionKindFromText("What kind of packaging do you need?"), "product");
});

test("a question with no clear words gives no answer, so the page can decide", () => {
  assert.equal(questionKindFromText("Anything else I should know?"), null);
  assert.equal(questionKindFromText(""), null);
});
