/* Writes the branded Supabase account emails to supabase/email-templates/.
   Run: node scripts/build-auth-emails.mts */
import { mkdirSync, writeFileSync } from "node:fs";
import { AUTH_EMAILS } from "../lib/authEmails.ts";

mkdirSync("supabase/email-templates", { recursive: true });

const index = ["# Account email templates for Supabase", "", "Paste each file into Supabase: Authentication -> Emails -> Templates, with its subject.", ""];

for (const email of AUTH_EMAILS) {
  writeFileSync(`supabase/email-templates/${email.file}`, email.html, "utf8");
  index.push(`- **${email.template}**: \`${email.file}\`, subject: \`${email.subject}\``);
}

writeFileSync("supabase/email-templates/README.md", index.join("\n") + "\n", "utf8");
console.log(`wrote ${AUTH_EMAILS.length} templates`);
