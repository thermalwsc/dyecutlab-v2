/* =========================================================
   DYE CUT LAB — how a project file is shown on the project page
============================================================
   Pure helpers for the Files tab: the extension tile, the size in words, whether
   a file can be shown as a thumbnail, and the link that saves a file instead of
   opening it. No server-only imports, covered by tests/fileDisplay.test.ts. */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

/* "logo.final.PNG" -> "PNG". A name with no extension gives "FILE". */
export function fileExtension(fileName: string): string {
  const name = (fileName || "").trim();
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "FILE";
  return name.slice(dot + 1).toUpperCase();
}

/* "1.4 MB". Missing or negative sizes give "" so the page shows nothing. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes.toFixed(1)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}

/* Only formats every browser can draw get a thumbnail. Anything else (PDF,
   Illustrator, SVG) keeps the extension tile. */
export function canShowThumbnail(fileType: string | null | undefined, fileName: string): boolean {
  const type = (fileType || "").toLowerCase();
  if (IMAGE_TYPES.includes(type)) return true;
  if (type && type !== "application/octet-stream") return false;
  return IMAGE_EXTENSIONS.includes(fileExtension(fileName).toLowerCase());
}

/* The signed link already works for opening. Adding ?download=<name> makes
   storage send the file as a download with its real name. Returns null when
   there is no link. */
export function downloadHref(url: string | null | undefined, fileName: string): string | null {
  if (!url) return null;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}download=${encodeURIComponent(fileName || "file")}`;
}
