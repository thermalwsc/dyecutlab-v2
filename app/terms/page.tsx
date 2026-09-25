import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../updates/LegalPage";
import { CONTACT } from "../../lib/contact";

/* Linked from the footer and every SMS consent notice, and submitted to
   Brevo / US carriers for SMS sender registration — the page must stay
   publicly reachable at /terms (SMS section anchored at #sms). Draft
   wording: have the client (or counsel) review before relying on it. */

export const metadata: Metadata = {
  title: "Terms & Conditions — DYE CUT LAB",
  description: "Terms for using dyecutlab.com and DYE CUT LAB text messaging.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" updated="September 26, 2026">
      <p>
        These terms apply to your use of dyecutlab.com and to messages you receive from Dye Cut Lab
        LLC (&ldquo;DYE CUT LAB&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the site or opting in to our messages,
        you agree to them.
      </p>

      <h2>Who we are</h2>
      <p>
        DYE CUT LAB makes custom packaging for brands: boxes, mylar bags, novelties, labels and more.
      </p>

      <h2 id="sms" className="scroll-mt-6">Text messaging terms</h2>
      <ul>
        <li>
          <strong>What you&rsquo;ll receive:</strong> by providing your mobile phone number or texting a keyword
          such as JOIN or ORDER to {CONTACT.phoneDisplay}, you agree to receive text messages from DYE CUT
          LAB at the number provided, including replies about your project request and, if you signed
          up, product and beta updates. Messages may be sent using an automated system.
        </li>
        <li><strong>Consent is not a condition of purchase.</strong></li>
        <li><strong>Frequency:</strong> message frequency varies.</li>
        <li><strong>Cost:</strong> message and data rates may apply.</li>
        <li>
          <strong>Opt out:</strong> reply <strong>STOP</strong> to cancel at any time. You&rsquo;ll get one
          confirmation text and no further messages.
        </li>
        <li>
          <strong>Help:</strong> reply <strong>HELP</strong> for help, or contact us at{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> or {CONTACT.phoneDisplay}.
        </li>
        <li>Carriers are not liable for any delayed or undelivered messages.</li>
        <li>
          See our <Link href="/privacy">Privacy Policy</Link> for how we handle your personal
          information.
        </li>
      </ul>

      <h2>Quotes and orders</h2>
      <p>
        Information on this site and in our messages is for general guidance. Prices, timelines and
        specifications are confirmed only in a written quote from us, and an order is accepted only
        once we confirm it.
      </p>

      <h2>Using this site</h2>
      <p>
        Please use the site only for lawful purposes and don&rsquo;t submit false information or try to
        disrupt it. The DYE CUT LAB name, logo, designs and site content belong to us and may not be
        copied without permission.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        The site is provided &ldquo;as is&rdquo;. To the extent allowed by law, we are not liable for indirect or
        consequential losses arising from your use of the site or our messages.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms from time to time. The date at the top shows when they last changed.</p>

      <h2>Contact us</h2>
      <p>
        Dye Cut Lab LLC
        <br />
        Email: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        <br />
        Phone / text: <a href={`tel:${CONTACT.phoneE164}`}>{CONTACT.phoneDisplay}</a>
      </p>
    </LegalPage>
  );
}
