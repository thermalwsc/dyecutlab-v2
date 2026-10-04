"use client";

import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, type QuoteStatus } from "./statuses";
import { updateQuoteStatus } from "./actions";

/* Status picker for one quote request: saves as soon as a new value is picked. */
export default function StatusSelect({ id, status }: { id: string; status: QuoteStatus }) {
  return (
    <form action={updateQuoteStatus}>
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`status-${id}`}>
        Request status
      </label>
      <select
        id={`status-${id}`}
        name="status"
        defaultValue={status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 rounded-full border-2 border-zinc-200 bg-white pl-3 pr-8 text-[13px] font-bold text-black outline-none transition hover:border-zinc-400 focus:border-black"
      >
        {QUOTE_STATUSES.map((value) => (
          <option key={value} value={value}>
            {QUOTE_STATUS_LABELS[value]}
          </option>
        ))}
      </select>
    </form>
  );
}
