"use client";

import { useState } from "react";
import { quoteTotal } from "../../../../lib/factoryQuote";
import { ArrowIcon } from "../../../updates/Icons";
import { sendFactoryQuote } from "../../quoteActions";

/* The factory's quote form. The total is shown as the factory types, worked out the
   same way the database does it (quantity x price + tooling), so the factory sees
   what DYE CUT LAB will see. Everything is checked again on the server. */

const FIELD =
  "mt-1.5 h-12 w-full rounded-xl border-2 border-zinc-300 bg-white px-3 text-[15px] font-semibold text-zinc-900 outline-none transition focus:border-black";
const LABEL = "block text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-600";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function read(value: string) {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return value.trim() && Number.isFinite(n) ? n : NaN;
}

export default function QuoteForm({ projectNumber, defaultQuantity }: { projectNumber: string; defaultQuantity: number | null }) {
  const [quantity, setQuantity] = useState(defaultQuantity ? String(defaultQuantity) : "");
  const [price, setPrice] = useState("");
  const [tooling, setTooling] = useState("");

  const total = quoteTotal(read(quantity), read(price), tooling.trim() ? read(tooling) : 0);

  return (
    <form action={sendFactoryQuote} className="mt-4 grid gap-4">
      <input type="hidden" name="project_number" value={projectNumber} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Quantity (pieces)
          <input name="quantity" required inputMode="numeric" autoComplete="off" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD} />
        </label>
        <label className={LABEL}>
          Price per piece (USD)
          <input
            name="price_per_piece"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Tooling, one time (USD)
          <input
            name="tooling_cost"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00, or empty if none"
            value={tooling}
            onChange={(e) => setTooling(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Lead time (days)
          <input name="lead_days" inputMode="numeric" autoComplete="off" placeholder="Production days" className={FIELD} />
        </label>
      </div>

      <label className={LABEL}>
        Notes for DYE CUT LAB (optional)
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          className="mt-1.5 w-full rounded-xl border-2 border-zinc-300 bg-white px-3 py-2.5 text-[15px] font-medium leading-relaxed text-zinc-900 outline-none transition focus:border-black"
        />
      </label>

      <div className="rounded-2xl bg-zinc-100 px-4 py-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-zinc-600">Total</p>
        <p className="text-[24px] font-black tracking-[-0.03em]">{total === null ? "—" : money(total)}</p>
        <p className="text-[12px] text-zinc-600">Quantity × price per piece + tooling. Shipping is not included.</p>
      </div>

      <button
        type="submit"
        className="group flex min-h-[52px] w-full items-center justify-between rounded-full border-[3px] border-black bg-[var(--dcl-lime)] px-5 text-[15px] font-extrabold transition active:scale-[0.98] sm:w-auto sm:min-w-[280px]"
      >
        Send quote
        <ArrowIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
      </button>
      <p className="text-[12px] text-zinc-600">DYE CUT LAB reviews it before anything goes to the customer. Sending again replaces a quote that is still waiting.</p>
    </form>
  );
}
