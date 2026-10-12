/* Upload and chat input rules. Pure constants and helpers (no server code), so
   the routes and the tests (tests/uploadRules.test.ts) share one source.
   Re-exported from lib/usageLimits.ts, which is where the rest of the limits live. */

export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_FILES_PER_PROJECT = 100;
export const UPLOAD_ALLOWED_EXTENSIONS = [
  // artwork and print files
  "pdf", "ai", "eps", "svg", "psd", "indd", "tif", "tiff",
  // images
  "png", "jpg", "jpeg", "webp", "gif", "heic",
  // references and bundles
  "zip", "doc", "docx", "xls", "xlsx", "csv", "txt",
];

/* Longest chat message accepted (characters). */
export const MAX_CHAT_CHARS = 2000;

/* "Artwork.FINAL.PDF" becomes "pdf"; a name with no dot gives "". */
export function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}
