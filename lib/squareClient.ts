import "server-only";

import {
  SQUARE_VERSION,
  buildPaymentLinkBody,
  normalizeEnvironment,
  parsePaymentLinkResponse,
  squareBaseUrl,
  squareErrorMessage,
  type PaymentLink,
  type PaymentLinkInput,
  type SquareEnvironment,
} from "./squarePayments";

/* =========================================================
   Square: the one place that talks to it, with the secret token
============================================================
   Server only. The access token is read from the environment here and used nowhere else; it never goes
   to the browser, a log or an error message. Everything that can be tested without the network is in
   lib/squarePayments.ts. */

export type SquareConfig = {
  environment: SquareEnvironment;
  baseUrl: string;
  accessToken: string;
  locationId: string;
};

/* null when Square is not set up on this server. */
export function getSquareConfig(): SquareConfig | null {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN?.trim();
  const locationId = process.env.SQUARE_LOCATION_ID?.trim();
  if (!accessToken || !locationId) return null;
  const environment = normalizeEnvironment(process.env.SQUARE_ENVIRONMENT);
  return { environment, baseUrl: squareBaseUrl(environment), accessToken, locationId };
}

/* Payments appear for customers only when this server is set up AND the switch is on, so nothing shows
   a Pay button until we mean it to (PAYMENTS_ENABLED=true in the environment). */
export function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED?.trim().toLowerCase() === "true" && getSquareConfig() !== null;
}

export type CreateLinkResult = { ok: true; link: PaymentLink } | { ok: false; message: string };

/* Asks Square for a hosted checkout link for one exact amount. Square refuses some addresses for the
   email it prefills on the page (it rejects reserved ones like example.com). That must never stop a
   customer from paying, so it is tried once more without the email; the customer just types it on
   Square's page. The second try has its own key, since the first made nothing. */
export async function createPaymentLink(input: Omit<PaymentLinkInput, "locationId">): Promise<CreateLinkResult> {
  const first = await requestPaymentLink(input);
  if (first.ok || !first.emailRefused || !input.buyerEmail) return first.ok ? first : { ok: false, message: first.message };

  const second = await requestPaymentLink({ ...input, buyerEmail: null, idempotencyKey: `${input.idempotencyKey}-noemail` });
  return second.ok ? second : { ok: false, message: second.message };
}

type Attempt = { ok: true; link: PaymentLink } | { ok: false; message: string; emailRefused: boolean };

async function requestPaymentLink(input: Omit<PaymentLinkInput, "locationId">): Promise<Attempt> {
  const config = getSquareConfig();
  if (!config) return { ok: false, message: "Payments are not set up yet. Please tell DYE CUT LAB.", emailRefused: false };

  try {
    const response = await fetch(`${config.baseUrl}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Square-Version": SQUARE_VERSION,
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPaymentLinkBody({ ...input, locationId: config.locationId })),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      /* only the category and code are logged: never the request, the token or the customer's details */
      const first = (body as { errors?: { category?: string; code?: string }[] } | null)?.errors?.[0];
      console.error("SQUARE PAYMENT LINK REFUSED:", response.status, first?.category, first?.code);
      return { ok: false, message: squareErrorMessage(response.status, body), emailRefused: first?.code === "INVALID_EMAIL_ADDRESS" };
    }

    const link = parsePaymentLinkResponse(body);
    if (!link) {
      console.error("SQUARE PAYMENT LINK: the answer had no usable link.");
      return { ok: false, message: squareErrorMessage(502, null), emailRefused: false };
    }
    return { ok: true, link };
  } catch (error) {
    console.error("SQUARE PAYMENT LINK ERROR:", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: squareErrorMessage(0, null), emailRefused: false };
  }
}
