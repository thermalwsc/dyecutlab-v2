import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS } from "../../../lib/auth/roles";
import { requireRole } from "../../../lib/auth/guard";
import { getServerSupabase } from "../../../lib/supabase/server";
import { PRICING_TABLES, fieldValue, findPricingTable, type PricingField, type PricingTableDef } from "../../../lib/pricingAdmin";
import { RoleShell } from "../../updates/RoleShell";
import { ADMIN_MESSAGES } from "../messages";
import { AdminTabs, BTN, BTN_DANGER, Banner, Empty, FIELD, LABEL, Panel, param, type SearchParams } from "../ui";
import { deletePricingRow, savePricingRow } from "./actions";

export const metadata: Metadata = { title: "Pricing — DYE CUT LAB", robots: { index: false } };

type Row = Record<string, unknown>;
type ProductOption = { id: string; label: string };

function PricingFields({ def, row, products }: { def: PricingTableDef; row?: Row; products: ProductOption[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {def.fields.map((field: PricingField) => {
        const span = field.wide ? "sm:col-span-2" : "";
        const current = row ? row[field.name] : undefined;

        if (field.kind === "bool") {
          return (
            <label key={field.name} className={`flex items-start gap-3 text-[14px] font-semibold ${span}`}>
              <input
                type="checkbox"
                name={field.name}
                defaultChecked={row ? current !== false : Boolean(field.defaultTrue)}
                className="mt-1 h-5 w-5 rounded border-2 border-zinc-300 accent-black"
              />
              <span>
                {field.label}
                {field.help && <span className="block text-[12px] font-medium text-zinc-500">{field.help}</span>}
              </span>
            </label>
          );
        }

        return (
          <label key={field.name} className={`${LABEL} ${span}`}>
            {field.label}
            {field.kind === "select" || field.kind === "product" ? (
              <select name={field.name} required={field.required} defaultValue={fieldValue(field, current)} className={FIELD}>
                <option value="">Choose…</option>
                {(field.kind === "product"
                  ? products.map((p) => ({ value: p.id, label: p.label }))
                  : field.options ?? []
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={field.name}
                required={field.required}
                maxLength={field.kind === "text" ? field.max ?? 200 : 30}
                inputMode={field.kind === "text" ? "text" : field.kind === "int" ? "numeric" : "decimal"}
                autoComplete="off"
                placeholder={field.kind === "money" ? "0.00" : field.kind === "percent" ? "35" : undefined}
                defaultValue={fieldValue(field, current)}
                className={FIELD}
              />
            )}
            {field.help && (
              <span className="mt-1 block text-[12px] font-medium normal-case tracking-normal text-zinc-500">{field.help}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { role } = await requireRole(["dcl_staff", "dcl_admin"], { next: "/admin/pricing" });
  const isAdmin = role === "dcl_admin";

  const def = findPricingTable(param(params, "table")) ?? PRICING_TABLES[0];
  const supabase = await getServerSupabase();

  /* The products are needed on their own page and, as a pick-list and for names,
     on the price-levels page. */
  let products: ProductOption[] = [];
  if (def.key === "tiers") {
    const { data } = await supabase.from("pricing_products").select("id, product, style").order("product");
    products = (data ?? []).map((p) => ({ id: String(p.id), label: [p.product, p.style].filter(Boolean).join(" · ") }));
  }
  const productNames = Object.fromEntries(products.map((p) => [p.id, p.label]));

  let query = supabase.from(def.table).select("*");
  for (const column of def.order) query = query.order(column);
  const { data, error } = await query.limit(500);
  if (error) console.error("PRICING LIST ERROR:", def.table, error.message);

  let rows = (data ?? []) as Row[];
  if (def.key === "tiers") {
    rows = [...rows].sort((a, b) => {
      const byProduct = (productNames[String(a.product_id)] ?? "").localeCompare(productNames[String(b.product_id)] ?? "");
      return byProduct || Number(a.min_quantity) - Number(b.min_quantity);
    });
  }

  const why = param(params, "why").slice(0, 240);
  const copy = { ...ADMIN_MESSAGES, ...(why ? { pricing_invalid: why } : {}) };

  return (
    <RoleShell
      badge={ROLE_LABELS[role]}
      title={<>Pricing.</>}
      intro="The numbers behind estimates. Private to the DYE CUT LAB team: customers and factories never see them."
    >
      <AdminTabs active="/admin/pricing" isAdmin={isAdmin} />

      <nav aria-label="Pricing tables" className="mt-4 flex flex-wrap gap-2">
        {PRICING_TABLES.map((item) => (
          <Link
            key={item.key}
            href={`/admin/pricing?table=${item.key}`}
            aria-current={item.key === def.key ? "page" : undefined}
            className={`rounded-full border-2 px-4 py-2 text-[13px] font-extrabold transition ${
              item.key === def.key ? "border-black bg-black text-white" : "border-zinc-300 bg-white text-black hover:border-black"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Banner params={params} copy={copy} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel title={`${def.label}: ${rows.length} row${rows.length === 1 ? "" : "s"}`} intro={def.intro}>
          {rows.length === 0 ? (
            <Empty>
              Nothing here yet.{" "}
              {def.key === "tiers" && products.length === 0
                ? "Add a product first, then come back to add its price levels."
                : "Add the first row on the right."}
            </Empty>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {rows.map((row) => {
                const id = String(row.id);
                const off = row.active === false;
                return (
                  <li key={id} className="py-4">
                    <div className="min-w-0">
                      <p className={`text-[15px] font-bold ${off ? "text-zinc-400" : ""}`}>{def.title(row, productNames)}</p>
                      <p className="mt-0.5 text-[13px] text-zinc-600">{def.detail(row) || "No details"}</p>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[13px] font-bold underline underline-offset-2">Edit</summary>
                      <form action={savePricingRow} className="mt-3 grid gap-4">
                        <input type="hidden" name="table" value={def.key} />
                        <input type="hidden" name="id" value={id} />
                        <PricingFields def={def} row={row} products={products} />
                        <button type="submit" className={BTN}>
                          Save
                        </button>
                      </form>
                      <form action={deletePricingRow} className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
                        <input type="hidden" name="table" value={def.key} />
                        <input type="hidden" name="id" value={id} />
                        <label className="flex items-center gap-2 text-[13px] font-semibold">
                          <input type="checkbox" name="confirm" value="yes" className="h-5 w-5 accent-black" />
                          Yes, delete this row for good
                        </label>
                        <button type="submit" className={BTN_DANGER}>
                          Delete
                        </button>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={`Add to ${def.label.toLowerCase()}`}>
          {def.key === "tiers" && products.length === 0 ? (
            <p className="text-[14px] text-zinc-600">
              Price levels belong to a product.{" "}
              <Link href="/admin/pricing?table=products" className="font-bold underline underline-offset-2">
                Add a product first
              </Link>
              .
            </p>
          ) : (
            <form action={savePricingRow} className="grid gap-4">
              <input type="hidden" name="table" value={def.key} />
              <PricingFields def={def} products={products} />
              <button type="submit" className={BTN}>
                Add row
              </button>
            </form>
          )}
          <p className="mt-4 text-[12px] font-medium text-zinc-500">
            All amounts are in US dollars. Nothing here is shown to customers yet.
          </p>
        </Panel>
      </div>
    </RoleShell>
  );
}
