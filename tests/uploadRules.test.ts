import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CHAT_CHARS, MAX_FILES_PER_PROJECT, UPLOAD_ALLOWED_EXTENSIONS, UPLOAD_MAX_BYTES, fileExtension } from "../lib/uploadRules.ts";

const allowed = (name: string) => UPLOAD_ALLOWED_EXTENSIONS.includes(fileExtension(name));

test("print artwork and normal images are allowed", () => {
  for (const name of ["label.pdf", "box.ai", "dieline.eps", "logo.svg", "art.psd", "photo.JPG", "shot.png", "pic.webp", "pouch.zip"]) {
    assert.ok(allowed(name), name);
  }
});

test("programs, scripts and disguised files are refused", () => {
  for (const name of ["setup.exe", "run.bat", "tool.msi", "script.js", "page.html", "macro.docm", "virus.pdf.exe", "archive.tar.gz", "noextension", ".env", "a."]) {
    assert.ok(!allowed(name), name);
  }
});

test("the extension is read from the last dot, in any case", () => {
  assert.equal(fileExtension("Artwork.FINAL.PDF"), "pdf");
  assert.equal(fileExtension("plain"), "");
  assert.equal(fileExtension("a."), "");
});

test("the limits are the agreed numbers", () => {
  assert.equal(UPLOAD_MAX_BYTES, 25 * 1024 * 1024);
  assert.equal(MAX_FILES_PER_PROJECT, 100);
  assert.equal(MAX_CHAT_CHARS, 2000);
});
