import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_EMAILS, SUPABASE_LINK } from "../lib/authEmails.ts";

test("there is a template for every account email Supabase sends", () => {
  assert.deepEqual(
    AUTH_EMAILS.map((email) => email.template).sort(),
    ["Change email address", "Confirm sign up", "Invite user", "Magic link", "Reset password"]
  );
});

test("every template carries Supabase's link placeholder exactly as Supabase expects it", () => {
  assert.equal(SUPABASE_LINK, "{{ .ConfirmationURL }}");
  for (const email of AUTH_EMAILS) {
    assert.ok(email.html.includes(`href="${SUPABASE_LINK}"`), `${email.template}: the button must use the placeholder`);
    assert.equal((email.html.match(/\{\{ \.ConfirmationURL \}\}/g) ?? []).length, 1, `${email.template}: exactly one link`);
  }
});

test("every template has the brand look, a subject and the contact line", () => {
  const files = new Set<string>();
  for (const email of AUTH_EMAILS) {
    assert.match(email.html, />DYE CUT LAB</);
    assert.match(email.html, /#c2f23a/);
    assert.match(email.html, /dyecutlab@gmail\.com/);
    assert.ok(email.subject.includes("DYE CUT LAB"), `${email.template}: subject`);
    assert.match(email.file, /^[a-z-]+\.html$/);
    files.add(email.file);
    assert.ok(!/undefined|null|NaN/.test(email.html), `${email.template}: no stray values`);
  }
  assert.equal(files.size, AUTH_EMAILS.length, "each template has its own file");
});

test("no template promises anything the site does not do", () => {
  for (const email of AUTH_EMAILS) {
    assert.ok(!/password.*(email|send)\s+you/i.test(email.html), `${email.template}: never sends a password`);
  }
});
