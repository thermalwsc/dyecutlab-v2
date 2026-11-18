import { NextRequest, NextResponse } from "next/server";
import { loadPaymentContext } from "../../../../../lib/paymentContext";
import { startPayment } from "../../../../../lib/paymentStartServer";
import { createRateLimiter } from "../../../../../lib/rateLimit";
import { paymentsEnabled } from "../../../../../lib/squareClient";
import { forbidden, getRouteSupabase, unauthorized } from "../../../../../lib/supabase/route";

/*
|--------------------------------------------------------------------------
| PAYING FOR ONE PROJECT
|--------------------------------------------------------------------------
|
| GET  /api/projects/DCL-00031/payments   what is due, and the payments so far
| POST /api/projects/DCL-00031/payments   start the payment that is due
|
| The customer's browser never sends an amount. The amount, the quote and
| whether a payment is due are all worked out here from the database, read with
| the caller's own session, and the database checks them again before anything
| is created. A factory never reaches this route.
|
| Nothing shows until PAYMENTS_ENABLED=true and Square is set up on the server.
|
*/

const isStartLimited = createRateLimiter({ windowMs: 60_000, maxRequests: 10 });

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const { supabase, user, role } = await getRouteSupabase();
    if (!user) return unauthorized();
    if (role === "factory") return forbidden();

    if (!paymentsEnabled()) return NextResponse.json({ success: true, enabled: false });

    const view = await loadPaymentContext(supabase, projectId);
    if (!view) return NextResponse.json({ error: `Project ${projectId} was not found.` }, { status: 404 });

    return NextResponse.json({
      success: true,
      enabled: true,
      totalCents: view.totalCents,
      /* the project's owner is the only one who can pay; the team only looks */
      canPay: view.project.owner_id === user.id,
      next: view.next.due ? { due: view.next.due, amountCents: view.next.amountCents, resume: view.next.resume } : null,
      payments: view.payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        status: p.status,
        amountCents: p.amount_cents,
        receiptUrl: p.receipt_url && /^https:\/\//i.test(p.receipt_url) ? p.receipt_url : null,
        paidAt: p.paid_at,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error("PROJECT PAYMENTS ROUTE ERROR:", error);
    return NextResponse.json({ error: "Payments could not be loaded." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await context.params;
    const { supabase, user, role } = await getRouteSupabase();
    if (!user) return unauthorized();
    if (role === "factory") return forbidden();

    if (!paymentsEnabled()) return NextResponse.json({ error: "Payments are not switched on yet." }, { status: 503 });
    if (isStartLimited(user.id)) return NextResponse.json({ error: "Too many payment attempts. Wait a moment and try again." }, { status: 429 });

    const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;

    const result = await startPayment({
      supabase,
      userId: user.id,
      userEmail: user.email ?? null,
      projectNumber: projectId,
      kind: body?.kind,
      /* the address Square sends the customer back to: the configured site, else the one they are on */
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin,
    });

    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    return NextResponse.json({ success: true, url: result.url, resumed: result.resumed });
  } catch (error) {
    console.error("START PAYMENT ROUTE ERROR:", error);
    return NextResponse.json({ error: "The payment could not be started. Please try again." }, { status: 500 });
  }
}
