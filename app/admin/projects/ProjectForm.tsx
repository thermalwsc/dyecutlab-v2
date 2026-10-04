import { FIELD, LABEL, TEXTAREA } from "../ui";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "../statuses";

/* Fields shared by "new project" and "edit project". Server component: plain
   inputs inside a server-action form. */
export type ProjectValues = {
  title?: string | null;
  request?: string | null;
  product_type?: string | null;
  quantity?: number | null;
  units?: number | null;
  size?: string | null;
  material?: string | null;
  finish?: string | null;
  status?: string | null;
};

export default function ProjectFields({ values = {} }: { values?: ProjectValues }) {
  const status = values.status ?? "lead";
  const known = (PROJECT_STATUSES as readonly string[]).includes(status);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`${LABEL} sm:col-span-2`}>
        Title
        <input name="title" required maxLength={160} defaultValue={values.title ?? ""} className={FIELD} />
      </label>
      <label className={`${LABEL} sm:col-span-2`}>
        Request
        <textarea name="request" rows={4} maxLength={4000} defaultValue={values.request ?? ""} className={TEXTAREA} />
      </label>
      <label className={LABEL}>
        Product type
        <input name="product_type" maxLength={120} defaultValue={values.product_type ?? ""} className={FIELD} />
      </label>
      <label className={LABEL}>
        Status
        <select name="status" defaultValue={known ? status : ""} className={FIELD}>
          {!known && <option value="">Keep “{status}”</option>}
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Quantity
        <input name="quantity" type="number" min={0} inputMode="numeric" defaultValue={values.quantity ?? ""} className={FIELD} />
      </label>
      <label className={LABEL}>
        Units
        <input name="units" type="number" min={0} inputMode="numeric" defaultValue={values.units ?? ""} className={FIELD} />
      </label>
      <label className={LABEL}>
        Size
        <input name="size" maxLength={120} defaultValue={values.size ?? ""} className={FIELD} />
      </label>
      <label className={LABEL}>
        Material
        <input name="material" maxLength={120} defaultValue={values.material ?? ""} className={FIELD} />
      </label>
      <label className={`${LABEL} sm:col-span-2`}>
        Finish
        <input name="finish" maxLength={120} defaultValue={values.finish ?? ""} className={FIELD} />
      </label>
    </div>
  );
}
