/* =========================================================
   DYE CUT LAB — one look for every email we send
============================================================
   A lime bar with the wordmark, a black-outlined card, bold headline, lime
   panels and a lime button: the same look as the site. Every email builds its
   words and hands them here, so the team alerts and the customer's updates
   always feel like one product. Everything passed in is escaped here, so a
   customer's own text can never become markup. Pure function, covered by
   tests/emailLayout.test.ts. */

export type EmailRow = { label: string; value: string };

export type EmailContent = {
  /** Small green line above the headline, such as "YOUR PROJECT UPDATE". */
  eyebrow: string;
  greeting?: string;
  headline: string;
  intro?: string;
  /** Label and value pairs shown in a lime panel. */
  rows?: EmailRow[];
  /** A longer piece of text under its own small label, such as the customer's first message. */
  quote?: { label: string; text: string };
  cta?: { label: string; url: string };
  footer?: string;
};

export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INK = "#0a0a0a";
const LIME = "#c2f23a";

export function renderEmail(input: EmailContent): { html: string; text: string } {
  const e = escapeEmailHtml;
  const rows = (input.rows ?? []).filter((row) => row.value.trim() !== "");

  const rowsHtml = rows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;padding:14px 16px;border-radius:14px;background:#f2fadf;">${rows
        .map(
          (row) =>
            `<tr><td style="padding:5px 16px 5px 0;font-size:12px;font-weight:700;letter-spacing:0.06em;color:#71717a;white-space:nowrap;vertical-align:top;">${e(row.label.toUpperCase())}</td><td style="padding:5px 0;font-size:15px;font-weight:700;line-height:22px;">${e(row.value)}</td></tr>`
        )
        .join("")}</table>`
    : "";

  const quoteHtml =
    input.quote && input.quote.text.trim()
      ? `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;color:#71717a;">${e(input.quote.label.toUpperCase())}</p><p style="margin:0 0 18px;font-size:15px;line-height:22px;">${e(input.quote.text)}</p>`
      : "";

  const ctaHtml = input.cta
    ? `<p style="margin:6px 0 0;"><a href="${e(input.cta.url)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${LIME};border:2px solid ${INK};color:${INK};font-size:15px;font-weight:800;text-decoration:none;">${e(input.cta.label)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#fafafa;font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="max-width:560px;margin:0 auto;border:2px solid ${INK};border-radius:20px;background:#ffffff;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:${INK};">
      <div style="background:${LIME};padding:14px 24px;border-bottom:2px solid ${INK};font-size:15px;font-weight:900;letter-spacing:0.08em;">DYE CUT LAB</div>
      <div style="padding:24px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;color:#4d7c0f;">${e(input.eyebrow.toUpperCase())}</p>
        ${input.greeting ? `<p style="margin:0 0 14px;font-size:15px;">${e(input.greeting)}</p>` : ""}
        <p style="margin:0 0 ${input.intro ? "10px" : "18px"};font-size:26px;font-weight:900;line-height:1.15;">${e(input.headline)}</p>
        ${input.intro ? `<p style="margin:0 0 18px;font-size:15px;line-height:22px;">${e(input.intro)}</p>` : ""}
        ${rowsHtml}
        ${quoteHtml}
        ${ctaHtml}
        ${input.footer ? `<p style="margin:22px 0 0;font-size:12px;line-height:18px;color:#71717a;">${e(input.footer)}</p>` : ""}
      </div>
    </div>
  </body>
</html>`;

  const text = [
    input.eyebrow,
    input.greeting ?? "",
    input.headline,
    input.intro ?? "",
    rows.map((row) => `${row.label}: ${row.value}`).join("\n"),
    input.quote && input.quote.text.trim() ? `${input.quote.label}:\n${input.quote.text}` : "",
    input.cta ? `${input.cta.label}: ${input.cta.url}` : "",
    input.footer ?? "",
  ]
    .filter((part) => part.trim() !== "")
    .join("\n\n");

  return { html, text };
}
