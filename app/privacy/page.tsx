import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../updates/LegalPage";
import { CONTACT } from "../../lib/contact";

/* Linked from the footer and every SMS consent notice, and submitted to
   Brevo / US carriers for SMS sender registration — the page must stay
   publicly reachable at /privacy. Draft wording: have the client (or
   counsel) review before relying on it. */

export const metadata: Metadata = {
  title: "Privacy Policy — DYE CUT LAB",
  description: "How DYE CUT LAB collects, uses and protects your information, including text messaging.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 26, 2026">
      <p>
        This Privacy Policy explains how Dye Cut Lab LLC (&ldquo;DYE CUT LAB&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
        uses and protects information when you visit dyecutlab.com, sign up for updates, request a
        project quote, or text us.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Contact details you give us:</strong> your name, email address and mobile phone number.</li>
        <li><strong>Project details:</strong> what you tell us you want made, such as product type, quantity and size.</li>
        <li><strong>Messages:</strong> texts and emails you send us, and our replies.</li>
        <li><strong>Consent records:</strong> when and how you agreed to receive text messages or emails from us.</li>
        <li><strong>Basic technical data:</strong> information your browser sends automatically, such as IP address, used to keep the site secure and prevent spam.</li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To reply to your project request and send you quotes.</li>
        <li>To send the product and beta updates you signed up for, by email or text.</li>
        <li>To answer your questions and provide customer support.</li>
        <li>To keep our website secure and prevent abuse.</li>
      </ul>

      <h2>Text messaging (SMS)</h2>
      <p>
        If you give us your mobile number or text us, we may send you text messages about your
        request and, if you signed up for updates, about new products and beta features. Message
        frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> at any time to
        stop receiving texts, or <strong>HELP</strong> for help. See our{" "}
        <Link href="/terms#sms">SMS Terms</Link> for full details.
      </p>

      <h2>How we share information</h2>
      <p>
        We do not sell your personal information. We share it only with service providers that help
        us run our business, and only as needed for them to provide their service:
      </p>
      <ul>
        <li><strong>Hosting and database providers</strong> that store our website and the information you submit.</li>
        <li><strong>Email and text messaging providers</strong> that deliver our messages to you.</li>
        <li><strong>Legal and safety:</strong> when required by law, or to protect our rights, customers or the public.</li>
      </ul>
      <p>
        All the above categories exclude text messaging originator opt-in data and consent; this
        information won&rsquo;t be shared with any third parties.
      </p>
      <p>
        No mobile information will be shared with third parties or affiliates for marketing or
        promotional purposes.
      </p>

      <h2>How long we keep information</h2>
      <p>
        We keep your information for as long as we need it to respond to you, provide our services
        and meet legal requirements. You can ask us to delete it at any time.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Texts:</strong> reply STOP to any message to opt out.</li>
        <li><strong>Emails:</strong> reply to any of our emails and ask to unsubscribe.</li>
        <li><strong>Access or deletion:</strong> email us to see, correct or delete the information we hold about you.</li>
      </ul>

      <h2>Children</h2>
      <p>Our services are for businesses and adults. We do not knowingly collect information from children under 13.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy from time to time. The date at the top shows when it last changed.</p>

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
