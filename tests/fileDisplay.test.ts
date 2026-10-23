import { test } from "node:test";
import assert from "node:assert/strict";
import { canShowThumbnail, downloadHref, fileExtension, formatFileSize } from "../lib/fileDisplay.ts";

test("the extension tile shows the last part of the name in capitals", () => {
  assert.equal(fileExtension("logo.png"), "PNG");
  assert.equal(fileExtension("box.final.v2.pdf"), "PDF");
  assert.equal(fileExtension("README"), "FILE");
  assert.equal(fileExtension(".hidden"), "FILE");
  assert.equal(fileExtension("trailing."), "FILE");
  assert.equal(fileExtension(""), "FILE");
});

test("sizes read in plain units and bad sizes show nothing", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(1023), "1023 B");
  assert.equal(formatFileSize(1024), "1.0 KB");
  assert.equal(formatFileSize(1536), "1.5 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatFileSize(3 * 1024 ** 3), "3.0 GB");
  assert.equal(formatFileSize(null), "");
  assert.equal(formatFileSize(undefined), "");
  assert.equal(formatFileSize(-5), "");
  assert.equal(formatFileSize(Number.NaN), "");
});

test("only images a browser can draw get a thumbnail", () => {
  assert.equal(canShowThumbnail("image/png", "a.png"), true);
  assert.equal(canShowThumbnail("image/jpeg", "a.jpg"), true);
  assert.equal(canShowThumbnail("image/webp", "a.webp"), true);
  assert.equal(canShowThumbnail("application/pdf", "a.pdf"), false);
  assert.equal(canShowThumbnail("image/svg+xml", "a.svg"), false);
  assert.equal(canShowThumbnail("application/postscript", "a.ai"), false);
});

test("a file with no stored type is judged by its extension", () => {
  assert.equal(canShowThumbnail(null, "photo.JPG"), true);
  assert.equal(canShowThumbnail("", "photo.png"), true);
  assert.equal(canShowThumbnail("application/octet-stream", "photo.webp"), true);
  assert.equal(canShowThumbnail(null, "design.ai"), false);
  assert.equal(canShowThumbnail(null, "noextension"), false);
});

test("the download link keeps the signed link and adds the file name", () => {
  assert.equal(downloadHref(null, "a.png"), null);
  assert.equal(downloadHref("", "a.png"), null);
  assert.equal(downloadHref("https://x.test/f?token=abc", "box art.png"), "https://x.test/f?token=abc&download=box%20art.png");
  assert.equal(downloadHref("https://x.test/f", "a.png"), "https://x.test/f?download=a.png");
  assert.equal(downloadHref("https://x.test/f?token=abc", "a&b=c.png"), "https://x.test/f?token=abc&download=a%26b%3Dc.png");
});
