import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeEmailHtml, renderEmail } from "../lib/emailLayout.ts";

const full = {
  eyebrow: "Your project update",
  greeting: "Hi Ghian,",
  headline: "Your order is being made",
  intro: "The factory is producing it.",
  rows: [
    { label: "Project", value: "DCL-00062 · BOX" },
    { label: "Stage", value: "Being made" },
  ],
  quote: { label: "Their first message", text: "I want 100 boxes" },
  cta: { label: "View your project", url: "https://dyecutlab.com/project/DCL-00062" },
  footer: "Questions? Just reply.",
};

test("the email has the brand pieces: wordmark bar, headline, panel and button", () => {
  const { html } = renderEmail(full);
  assert.match(html, />DYE CUT LAB</);
  assert.match(html, /YOUR PROJECT UPDATE/);
  assert.match(html, /Your order is being made/);
  assert.match(html, /#c2f23a/);
  assert.match(html, /href="https:\/\/dyecutlab\.com\/project\/DCL-00062"/);
  assert.match(html, />View your project</);
  assert.match(html, /DCL-00062 · BOX/);
});

test("the plain-text version carries the same information", () => {
  const { text } = renderEmail(full);
  assert.match(text, /Hi Ghian,/);
  assert.match(text, /Your order is being made/);
  assert.match(text, /Project: DCL-00062 · BOX/);
  assert.match(text, /Their first message:\nI want 100 boxes/);
  assert.match(text, /View your project: https:\/\/dyecutlab\.com\/project\/DCL-00062/);
  assert.match(text, /Questions\? Just reply\./);
});

test("everything passed in is escaped, so customer text cannot become markup", () => {
  const evil = `<script>alert("x")</script> & "quotes"`;
  const { html } = renderEmail({
    eyebrow: evil,
    greeting: evil,
    headline: evil,
    intro: evil,
    rows: [{ label: evil, value: evil }],
    quote: { label: evil, text: evil },
    cta: { label: evil, url: `https://x.test/?a="><script>1</script>` },
    footer: evil,
  });
  assert.ok(!html.includes("<script>"), "no raw script tag may survive");
  assert.ok(!html.includes(`"><script`), "the link cannot break out of its attribute");
  assert.match(html, /&lt;script&gt;/);
});

test("optional parts are left out cleanly", () => {
  const { html, text } = renderEmail({ eyebrow: "New beta sign-up", headline: "Someone joined" });
  assert.ok(!html.includes("undefined") && !html.includes("null"));
  assert.ok(!html.includes("<table"), "no empty panel");
  assert.ok(!html.includes("<a "), "no button without a link");
  assert.equal(text, "New beta sign-up\n\nSomeone joined");
});

test("rows with no value are skipped", () => {
  const { html, text } = renderEmail({
    eyebrow: "x",
    headline: "y",
    rows: [
      { label: "Name", value: "Ghian" },
      { label: "Phone", value: "   " },
    ],
  });
  assert.match(html, /NAME/);
  assert.ok(!html.includes("PHONE"));
  assert.ok(!text.includes("Phone"));
});

test("escaping handles the five risky characters", () => {
  assert.equal(escapeEmailHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});
