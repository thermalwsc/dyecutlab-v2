/* =========================================================
   DYE CUT LAB — the team alert for a project created in the chat
============================================================
   When a customer's chat creates a project, the team gets one text and one
   email. This builds the wording; sending is in lib/sendblue.ts and
   lib/brevo.ts. Everything here comes from the customer, so it is cleaned and
   shortened before it goes into a text or an email. Pure functions, covered by
   tests/projectAlert.test.ts. */

import { CONTACT } from "./contact.ts";

export type NewProjectAlert = {
  projectNumber: string;
  title?: string | null;
  request?: string | null;
  units?: number | null;
  quantity?: number | null;
  flavorCount?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  projectUrl: string;
};

const SMS_REQUEST_MAX = 200;
const EMAIL_REQUEST_MAX = 1000;
const NAME_MAX = 80;

/* One line of plain text: no control characters, spaces collapsed, length-limited. */
export function oneLine(value: string | null | undefined, max: number) {
  const flat = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/* "1 unit", "10 units, 3 flavors", or "" when nothing is known yet. */
export function sizeSummary(input: Pick<NewProjectAlert, "units" | "quantity" | "flavorCount">) {
  const parts: string[] = [];
  if (input.units && input.units > 0) parts.push(`${input.units.toLocaleString("en-US")} ${input.units === 1 ? "unit" : "units"}`);
  if (input.quantity && input.quantity > 0) parts.push(`${input.quantity.toLocaleString("en-US")} pcs`);
  if (input.flavorCount && input.flavorCount > 0) parts.push(`${input.flavorCount} ${input.flavorCount === 1 ? "flavor" : "flavors"}`);
  return parts.join(", ");
}

export function whoWords(input: Pick<NewProjectAlert, "customerName" | "customerEmail">) {
  return oneLine(input.customerName, NAME_MAX) || oneLine(input.customerEmail, NAME_MAX) || "a customer";
}

export function buildProjectAlertSms(input: NewProjectAlert) {
  const title = oneLine(input.title, 60);
  const size = sizeSummary(input);
  const request = oneLine(input.request, SMS_REQUEST_MAX);
  const phone = oneLine(input.customerPhone, 40);

  const lines = [
    `Hi ${CONTACT.personName} - new project ${input.projectNumber} from ${whoWords(input)}${title ? `: ${title}` : ""}${size ? `, ${size}` : ""}.`,
  ];
  if (phone) lines.push(`Text them: ${phone}`);
  if (request) lines.push(`"${request}"`);
  lines.push(input.projectUrl);
  return lines.join("\n");
}

export function buildProjectAlertEmail(input: NewProjectAlert) {
  const who = whoWords(input);
  const title = oneLine(input.title, 100);
  const subject = `New project ${input.projectNumber} from ${who}${title ? ` — ${title}` : ""}`;

  return {
    subject,
    who,
    title,
    size: sizeSummary(input),
    request: oneLine(input.request, EMAIL_REQUEST_MAX),
    email: oneLine(input.customerEmail, 120),
    phone: oneLine(input.customerPhone, 40),
    projectNumber: input.projectNumber,
    projectUrl: input.projectUrl,
  };
}
