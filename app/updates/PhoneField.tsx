"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, type Country } from "../../lib/countries";

export type PhoneFieldProps = {
  country: Country;
  localPhone: string;
  error?: string;
  onLocalChange: (v: string) => void;
  onSelectCountry: (c: Country) => void;
  onClearError: () => void;
  /* Defaults match the landing page sign-up form. */
  id?: string;
  label?: string;
  required?: boolean;
  consentId?: string;
};
export default function PhoneField(p: PhoneFieldProps) {
  const { country, localPhone, error, onLocalChange, onSelectCountry, onClearError, id = "subscriber-phone", label = "Mobile number", required = false, consentId = "subscriber-sms-consent" } = p;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const qd = q.replace("+", "");
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.replace("+", "").startsWith(qd) || c.code.toLowerCase() === q);
  }, [query]);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setOpen(false); setQuery(""); } }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open ]);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" }); }, [activeIndex]);
  function choose(next: Country) { onSelectCountry(next); onClearError(); setOpen(false); setQuery(""); }
  const describedBy = error ? `${id}-error ${consentId}` : consentId;
  return (
  <div>
  <label htmlFor={id} className="block text-[13px] font-bold text-zinc-900">{label} {required ? <span aria-hidden="true" className="text-red-500">*</span> : <span className="font-medium text-zinc-500">(optional)</span>}</label>
  <div ref={rootRef} className="relative mt-1.5">
  <div className={`flex h-12 w-full items-stretch rounded-2xl border-2 bg-white transition focus-within:border-black focus-within:ring-4 focus-within:ring-[var(--dcl-lime)]/50 ${error ? "border-red-400" : "border-zinc-300 hover:border-zinc-400"}`}>
  <button type="button" onClick={() => { if (!open) { setActiveIndex(0); setQuery(""); } setOpen(!open); }} aria-haspopup="listbox" aria-expanded={open} aria-label={`Country ${country.name} ${country.dial}`} className="flex shrink-0 items-center gap-1.5 rounded-l-2xl px-3 text-[14px] font-medium text-zinc-900 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-400">
  <span aria-hidden="true" className="text-[18px] leading-none">{country.flag}</span>
  <span className="tabular-nums">{country.dial}</span>
  <svg aria-hidden="true" className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m6 9 6 6 6-6" /></svg>
  </button>
  <span aria-hidden="true" className="my-2.5 w-px shrink-0 bg-zinc-200" />
  <div className="relative min-w-0 flex-1">
  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg></span>
  <input id={id} name="phone" required={required} aria-required={required} type="tel" inputMode="tel" autoComplete="tel" value={localPhone} onChange={(e) => { onLocalChange(e.target.value.replace(/[^\d\s().+\-]/g, "")); if (error) onClearError(); }} placeholder={country.placeholder} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="h-full w-full rounded-r-2xl bg-transparent pl-10 pr-4 text-[14px] text-zinc-900 outline-none placeholder:text-zinc-400" />
  </div>
  </div>
  {open && (
  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.25)] sm:right-auto sm:w-[320px]">
  <div className="border-b border-zinc-100 p-2"><div className="relative">
  <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg></span>
  <input ref={searchRef} type="text" role="combobox" aria-expanded={open} aria-controls="country-listbox" aria-label="Search countries" value={query} onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }} placeholder="Search country..." className="h-9 w-full rounded-xl bg-zinc-50 pl-9 pr-3 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-lime-300/70" />
  </div></div>
  <ul ref={listRef} id="country-listbox" role="listbox" aria-label="Countries" className="max-h-[240px] overflow-y-auto p-1.5">
  {filtered.map((c, i) => {
    const selected = c.code === country.code && c.dial === country.dial;
    const active = i === activeIndex;
    return (<li key={`${c.code}-${c.dial}`}><button type="button" role="option" aria-selected={selected} data-active={active} onMouseEnter={() => setActiveIndex(i)} onFocus={() => setActiveIndex(i)} onClick={() => choose(c)} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(Math.min(i + 1, filtered.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(Math.max(i - 1, 0)); } else if (e.key === "Enter") { e.preventDefault(); choose(c); } }} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] ${selected ? "bg-lime-100/70 hover:bg-lime-100" : active ? "bg-zinc-100" : "hover:bg-zinc-100"}`}>
    <span aria-hidden="true" className="text-[18px] leading-none">{c.flag}</span>
    <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{c.name}</span>
    {selected && (<svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-lime-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>)}
    <span className="shrink-0 tabular-nums text-zinc-500">{c.dial}</span>
    </button></li>);
  })}
  {filtered.length === 0 && (<li className="px-3 py-6 text-center text-[12px] text-zinc-500">No countries found.</li>)}
  </ul>
  </div>
  )}
  </div>
  {error && (<p id={`${id}-error`} role="alert" className="mt-1.5 text-[11px] text-red-500">{error}</p>)}
  </div>
  );
}
