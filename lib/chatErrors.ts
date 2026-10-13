/* =========================================================
   DYE CUT LAB — what the customer sees when a chat message fails
============================================================
   Server messages are already safe sentences (see tests/apiErrors.test.ts), so a
   limit message from the server is shown as it is. Everything else gets a fixed
   plain sentence. Pure function, covered by tests/chatErrors.test.ts. */

export const CHAT_ERROR_SIGNED_OUT = "Your session has ended. Please sign in again to keep chatting.";
export const CHAT_ERROR_OFFLINE = "I couldn't reach the server. Check your connection and try again. Your message is back in the box.";
export const CHAT_ERROR_GENERIC = "Something went wrong on our side. Your message is back in the box, please try again.";

export const UPLOAD_ERROR_GENERIC = "That picture couldn't be uploaded. Please try again, or skip it for now.";

/* Upload refusals are plain sentences from the server ("That file type isn't
   allowed", "too large", "limit reached"), so they are shown as they are. */
export function uploadErrorMessage(status: number | null, serverMessage?: unknown) {
  if (status === null) return CHAT_ERROR_OFFLINE;
  if (status === 401) return CHAT_ERROR_SIGNED_OUT;

  const text = typeof serverMessage === "string" ? serverMessage.trim() : "";
  if ([400, 413, 415, 429].includes(status) && text && text.length <= 300) return text;

  return UPLOAD_ERROR_GENERIC;
}

/* status: HTTP status of the reply, or null when the request never got one
   (network down). serverMessage: the "error" text from the reply body, if any. */
export function chatErrorMessage(status: number | null, serverMessage?: unknown) {
  if (status === null) return CHAT_ERROR_OFFLINE;
  if (status === 401) return CHAT_ERROR_SIGNED_OUT;

  const text = typeof serverMessage === "string" ? serverMessage.trim() : "";
  if (status === 429 && text && text.length <= 300) return text;

  return CHAT_ERROR_GENERIC;
}
