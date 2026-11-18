"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCents, kindLabel, paymentStatusLabel } from "../../../lib/payments";

/* =========================================================
   The customer's payment card on their project page
============================================================
   Shows what is due (the 50% deposit once the quote is approved, the 50% balance before shipping), a
   button that opens Square's own secure page, and the payments so far with their receipts. The amount
   always comes from the server; this card only says which payment to start.

   Comes back from Square with ?paid=deposit (or balance). The card then says the payment is being
   confirmed and checks again every few seconds until Square's notification has arrived. */

type PaymentView = {
  id: string;
  kind: string;
  status: string;
  amountCents: number;
  receiptUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

type Loaded = {
  enabled: boolean;
  canPay?: boolean;
  next?: { due: "deposit" | "balance"; amountCents: number; resume: boolean } | null;
  payments?: PaymentView[];
};

const CHECK_EVERY_MS = 3000;
const CHECK_TIMES = 20;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PaymentCard({ projectId }: { projectId: string }) {
  const search = useSearchParams();
  const returning = search.get("paid") === "deposit" || search.get("paid") === "balance";
  const returningKind = search.get("paid");

  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState(0);

  /* `round` counts how many times we have asked: the first load is round 0, and each check after
     coming back from Square adds one */
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectId)}/payments`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<Loaded>) : null))
      .then((next) => {
        if (!cancelled && next) setData(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, checks]);

  const paid = (kind: string | null) => Boolean(data?.payments?.some((p) => p.kind === kind && p.status === "paid"));
  const confirming = returning && !paid(returningKind) && checks < CHECK_TIMES;

  /* Square tells us a moment after the customer pays; keep looking until it has */
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setChecks((n) => n + 1), CHECK_EVERY_MS);
    return () => clearTimeout(timer);
  }, [confirming, checks]);

  async function pay() {
    if (!data?.next || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: data.next.due }),
      });
      const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !body?.url || !/^https:\/\//i.test(body.url)) {
        setError(body?.error || "The payment could not be started. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("The payment could not be started. Please try again.");
      setBusy(false);
    }
  }

  if (!data?.enabled) return null;
  const payments = data.payments ?? [];
  if (!data.next && payments.length === 0 && !returning) return null;

  return (
    <section className="mt-5 rounded-[20px] border-2 border-black bg-white p-5" aria-labelledby="payment-heading">
      <p id="payment-heading" className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
        Payment
      </p>

      {returning && (
        <p role="status" className="mt-3 rounded-xl bg-zinc-100 px-4 py-3 text-[14px] font-semibold text-zinc-800">
          {paid(returningKind)
            ? "Thank you! Your payment was received."
            : confirming
              ? "Thank you! We are confirming your payment. This usually takes a few seconds."
              : "We have not heard from the payment page yet. If you paid, it will show here shortly. Refresh in a minute."}
        </p>
      )}

      {data.next && data.canPay && !confirming && (
        <div className="mt-3">
          <p className="text-[28px] font-black leading-tight tracking-[-0.03em]">{formatCents(data.next.amountCents)}</p>
          <p className="mt-1 text-[14px] font-semibold text-zinc-700">
            {data.next.due === "deposit" ? "50% deposit, due before production starts." : "The other 50%, due before your order ships."}
          </p>
          <button
            type="button"
            onClick={pay}
            disabled={busy}
            className="mt-4 min-h-[48px] rounded-full border-[3px] border-black bg-[var(--dcl-lime,#c2f23a)] px-6 text-[14px] font-extrabold transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Opening the payment page…" : data.next.resume ? "Continue to payment" : data.next.due === "deposit" ? "Pay the deposit" : "Pay the balance"}
          </button>
          <p className="mt-2 text-[12px] text-zinc-600">You pay securely on Square&apos;s own page. We never see your card details.</p>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-800">
              {error}
            </p>
          )}
        </div>
      )}

      {payments.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-200">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[14px]">
              <span className="font-extrabold">{kindLabel(p.kind)}</span>
              <span className="font-bold">{formatCents(p.amountCents)}</span>
              <span className="text-zinc-600">
                {paymentStatusLabel(p.status)}
                {p.paidAt ? ` · ${formatDate(p.paidAt)}` : ""}
              </span>
              {p.receiptUrl && (
                <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
                  Receipt
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
