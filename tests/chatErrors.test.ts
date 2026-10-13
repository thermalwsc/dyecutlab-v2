import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_ERROR_GENERIC, CHAT_ERROR_OFFLINE, CHAT_ERROR_SIGNED_OUT, UPLOAD_ERROR_GENERIC, chatErrorMessage, uploadErrorMessage } from "../lib/chatErrors.ts";

test("a limit message from the server is shown to the customer", () => {
  assert.equal(chatErrorMessage(429, "You've reached today's chat limit. Try again tomorrow."), "You've reached today's chat limit. Try again tomorrow.");
});

test("a missing or oversized limit message falls back to the generic one", () => {
  assert.equal(chatErrorMessage(429, undefined), CHAT_ERROR_GENERIC);
  assert.equal(chatErrorMessage(429, "   "), CHAT_ERROR_GENERIC);
  assert.equal(chatErrorMessage(429, "x".repeat(301)), CHAT_ERROR_GENERIC);
  assert.equal(chatErrorMessage(429, { not: "text" }), CHAT_ERROR_GENERIC);
});

test("signed-out callers are told to sign in", () => {
  assert.equal(chatErrorMessage(401, "anything"), CHAT_ERROR_SIGNED_OUT);
});

test("no response at all means a connection problem", () => {
  assert.equal(chatErrorMessage(null), CHAT_ERROR_OFFLINE);
});

test("other errors never show the server's text", () => {
  for (const status of [400, 403, 404, 500, 502, 504]) {
    assert.equal(chatErrorMessage(status, "relation \"projects\" does not exist"), CHAT_ERROR_GENERIC);
  }
});

test("upload refusals from the server are shown, other failures are not", () => {
  assert.equal(uploadErrorMessage(400, "That file type isn't allowed."), "That file type isn't allowed.");
  assert.equal(uploadErrorMessage(413, "That file is too large."), "That file is too large.");
  assert.equal(uploadErrorMessage(429, "Upload limit reached."), "Upload limit reached.");
  assert.equal(uploadErrorMessage(401, "x"), CHAT_ERROR_SIGNED_OUT);
  assert.equal(uploadErrorMessage(null), CHAT_ERROR_OFFLINE);
  assert.equal(uploadErrorMessage(500, "relation \"project_files\" does not exist"), UPLOAD_ERROR_GENERIC);
  assert.equal(uploadErrorMessage(400, undefined), UPLOAD_ERROR_GENERIC);
  assert.equal(uploadErrorMessage(400, "x".repeat(301)), UPLOAD_ERROR_GENERIC);
});

test("the fixed sentences tell the customer their message is kept", () => {
  assert.match(CHAT_ERROR_GENERIC, /back in the box/);
  assert.match(CHAT_ERROR_OFFLINE, /back in the box/);
});
