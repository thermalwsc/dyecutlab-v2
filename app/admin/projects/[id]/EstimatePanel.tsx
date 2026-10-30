import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeProjectEstimate, loadEstimateRows } from "../../../../lib/estimateServer";
import { finishesFor, matchProducts } from "../../../../lib/estimateProject";
import { percentText, usd } from "../../../../lib/pricingAdmin";
import { BTN, BTN_GHOST, Empty, FIELD, LABEL, Panel, Pill, formatDate, param, type SearchParams } from "../../ui";
import { saveEstimateVersion, setEstimateShown } from "./estimateActions";

type Project = { id: string; quantity: number | null; product_type: string | null };

function many(params: SearchParams, key: string): string[] {
  const value = params[key];
  if (Array.isArray(value)) return value;
  return typeof value === "string" && value ? [value] : [];
}

function Check({ name, value, label, detail, checked }: { name: string; value: string; label: string; detail: string; checked: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border-2 border-zinc-200 px-3 py-2.5 text-[14px] font-semibold">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="mt-1 h-5 w-5 accent-black" />
      <span>
        {label}
        <span className="block text-[12px] font-medium text-zinc-500">{detail}</span>
      </span>
    </label>
  );
}

/* The team's "Work out an estimate" tool for one project. It only ever reads the
   pricing tables and the project; saving and showing go through the actions in
   estimateActions.ts, which work the numbers out again on the server. */
export default async function EstimatePanel({ project, params, supabase }: { project: Project; params: SearchParams; supabase: SupabaseClient }) {
  const rows = await loadEstimateRows(supabase);
  const fitting = matchProducts(project.product_type, rows.products);

  const { data: versionRows } = await supabase
    .from("quote_versions")
    .select("id, version, created_at, quantity, sell_total, sell_per_piece, shown_to_customer")
    .eq("project_id", project.id)
    .order("version", { ascending: false });
  const versions = versionRows ?? [];

  const requested = param(params, "product");
  const product = fitting.find((row) => row.id === requested) ?? fitting[0] ?? null;
  const offeredFinishes = product ? finishesFor(product.product, rows.finishes) : [];
  const chosenFinishes = many(params, "finish");
  const chosenTooling = many(params, "tooling");
  const calc = param(params, "calc") === "1";

  const computed =
    calc && product
      ? computeProjectEstimate(project, { productId: product.id, finishIds: chosenFinishes, toolingIds: chosenTooling }, rows)
      : null;

  return (
    <Panel
      title="Estimate"
      intro="Work out an estimate from the pricing tables. Customers see nothing until you save a version and choose to show it."
    >
      {typeof project.quantity !== "number" || project.quantity <= 0 ? (
        <Empty>This project has no quantity yet. Set one in the details above, then come back.</Empty>
      ) : fitting.length === 0 ? (
        <Empty>
          There is no price list for &quot;{project.product_type || "this product"}&quot; yet.{" "}
          <Link href="/admin/pricing?table=products" className="font-bold underline underline-offset-2">
            Add it under Pricing
          </Link>
          .
        </Empty>
      ) : (
        <form method="get" className="grid gap-4">
          <input type="hidden" name="calc" value="1" />
          <p className="text-[14px] text-zinc-700">
            Quantity: <b>{project.quantity.toLocaleString("en-US")} pcs</b> (from the project)
          </p>

          {fitting.length > 1 && (
            <label className={LABEL}>
              Style
              <select name="product" defaultValue={product?.id} className={FIELD}>
                {fitting.map((row) => (
                  <option key={row.id} value={row.id}>
                    {[row.product, row.style].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          )}

          {offeredFinishes.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className={LABEL}>Finishes</legend>
              {offeredFinishes.map((finish) => (
                <Check
                  key={finish.id}
                  name="finish"
                  value={finish.id}
                  label={finish.name}
                  detail={`${usd(finish.amount)} ${finish.charge_type === "per_order" ? "once per order" : "per piece"}`}
                  checked={chosenFinishes.includes(finish.id)}
                />
              ))}
            </fieldset>
          )}

          {rows.tooling.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className={LABEL}>Tooling (one-time)</legend>
              {rows.tooling.map((item) => (
                <Check key={item.id} name="tooling" value={item.id} label={item.name} detail={usd(item.cost)} checked={chosenTooling.includes(item.id)} />
              ))}
            </fieldset>
          )}

          <button type="submit" className={BTN}>
            Work out estimate
          </button>
        </form>
      )}

      {computed && (
        <div className="mt-6 rounded-2xl border-2 border-zinc-200 p-4">
          {!computed.ok ? (
            <p role="alert" className="text-[14px] font-semibold text-red-700">
              {computed.message}
            </p>
          ) : !computed.result.ok ? (
            <p role="alert" className="text-[14px] font-semibold text-red-700">
              No estimate: {computed.result.detail}
            </p>
          ) : (
            <>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-zinc-600">Estimate (team view, private)</p>
              <table className="mt-2 w-full text-[14px]">
                <tbody>
                  {computed.result.lines.map((line) => (
                    <tr key={line.label} className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3">{line.label}</td>
                      <td className="py-1.5 text-right font-semibold">{usd(line.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-zinc-100">
                    <td className="py-1.5 pr-3 font-bold">Cost</td>
                    <td className="py-1.5 text-right font-bold">{usd(computed.result.cost)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-1.5 pr-3">
                      Margin: {computed.result.marginRule}
                    </td>
                    <td className="py-1.5 text-right font-semibold">{percentText(computed.result.margin)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-[16px] font-black">Selling price</td>
                    <td className="py-2 text-right text-[16px] font-black">{usd(computed.result.sellTotal)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[13px] text-zinc-600">
                {usd(computed.result.sellPerPiece)} per piece · lead time {computed.result.leadDays.total} days (proof {computed.result.leadDays.proof}, production{" "}
                {computed.result.leadDays.production}
                {computed.result.leadDays.finishes ? `, finishes ${computed.result.leadDays.finishes}` : ""}) · shipping is added after the estimate
              </p>

              <form action={saveEstimateVersion} className="mt-4">
                <input type="hidden" name="project_id" value={project.id} />
                <input type="hidden" name="product" value={product?.id ?? ""} />
                {chosenFinishes.map((id) => (
                  <input key={id} type="hidden" name="finish" value={id} />
                ))}
                {chosenTooling.map((id) => (
                  <input key={id} type="hidden" name="tooling" value={id} />
                ))}
                <button type="submit" className={BTN}>
                  Save as version {(versions[0]?.version ?? 0) + 1}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-zinc-600">Saved versions</p>
        {versions.length === 0 ? (
          <p className="mt-2 text-[14px] text-zinc-600">None yet. A saved version can never be edited or deleted.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-200">
            {versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-[14px]">
                  <p className="font-bold">
                    Version {version.version} · {usd(version.sell_total)}
                  </p>
                  <p className="text-[13px] text-zinc-600">
                    {Number(version.quantity).toLocaleString("en-US")} pcs · {usd(version.sell_per_piece)} per piece · saved {formatDate(version.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill>{version.shown_to_customer ? "Shown to customer" : "Hidden from customer"}</Pill>
                  <form action={setEstimateShown}>
                    <input type="hidden" name="project_id" value={project.id} />
                    <input type="hidden" name="version_id" value={version.id} />
                    <input type="hidden" name="shown" value={version.shown_to_customer ? "0" : "1"} />
                    <button type="submit" className={BTN_GHOST}>
                      {version.shown_to_customer ? "Hide" : "Show to customer"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] font-medium text-zinc-500">
          Even when shown, customers only see it once the estimate switch is on for the site.
        </p>
      </div>
    </Panel>
  );
}
