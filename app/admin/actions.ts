"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth/guard";
import { createRateLimiter } from "../../lib/rateLimit";
import { getServiceRoleSupabase, isServiceRoleConfigured } from "../../lib/supabase/admin";
import { getServerSupabase } from "../../lib/supabase/server";
import { PROJECT_STATUSES, QUOTE_STATUSES } from "./statuses";

/* =========================================================
   Team workspace (/admin) server actions
============================================================
   Every action:
     1. requireRole first — the acting user comes from the session cookie
     2. validates every field (uuid shape, enums, lengths)
     3. writes with the signed-in user's client where RLS allows it, and with
        the service role ONLY for columns browsers may not touch (owner_id,
        factory_id, archived_at, quote_requests.project_id, factories) and for
        admin deletes
     4. revalidates, then redirects back with ?ok= / ?error= for an inline
        message. */

const TEAM = ["dcl_staff", "dcl_admin"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Per-user write throttle (best effort, in-process) — stops a stuck form or a
   leaked session from hammering the database. */
const allowWrite = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });

function uuid(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(s) ? s : null;
}

function text(value: FormDataEntryValue | null, max: number): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s.slice(0, max) : null;
}

function int(value: FormDataEntryValue | null, max = 10_000_000): number | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function back(path: string, params: Record<string, string>): never {
  revalidatePath("/admin", "layout");
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

async function team(path: string) {
  const viewer = await requireRole(TEAM, { next: path });
  if (!allowWrite(viewer.user.id)) back(path, { error: "rate_limited" });
  return viewer;
}

function service(path: string) {
  if (!isServiceRoleConfigured()) back(path, { error: "no_service_key" });
  return getServiceRoleSupabase();
}

/* ---------------------------------------------------------------- requests */

export async function updateQuoteStatus(formData: FormData) {
  await requireRole(TEAM, { next: "/admin" });
  const id = uuid(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!id || !(QUOTE_STATUSES as readonly string[]).includes(status)) return;

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("quote_requests").update({ status }).eq("id", id);
  if (error) console.error("QUOTE STATUS UPDATE ERROR:", error.message);
  revalidatePath("/admin", "layout");
}

export async function updateQuoteNotes(formData: FormData) {
  const id = uuid(formData.get("id"));
  const path = id ? `/admin/requests/${id}` : "/admin/requests";
  await team(path);
  if (!id) back("/admin/requests", { error: "invalid" });

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("quote_requests")
    .update({ notes: text(formData.get("notes"), 2000) })
    .eq("id", id);
  if (error) {
    console.error("QUOTE NOTES ERROR:", error.message);
    back(path, { error: "save_failed" });
  }
  back(path, { ok: "notes_saved" });
}

export async function createProjectFromRequest(formData: FormData) {
  const id = uuid(formData.get("id"));
  const path = id ? `/admin/requests/${id}` : "/admin/requests";
  await team(path);
  if (!id) back("/admin/requests", { error: "invalid" });

  const supabase = await getServerSupabase();
  const { data: request } = await supabase
    .from("quote_requests")
    .select("id, description, project_id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!request) back("/admin/requests", { error: "not_found" });
  if (request.project_id) back(`/admin/projects/${request.project_id}`, { ok: "already_linked" });

  const admin = service(path);
  /* A signed-in customer's request becomes their project (so it shows on their
     dashboard); a guest's stays unassigned until the team links an account. */
  const ownerId = request.user_id && (await validOwner(admin, request.user_id)) ? request.user_id : null;
  const title = request.description.split(/[.\n]/)[0].slice(0, 80) || "Project from website request";
  const { data: project, error } = await admin
    .from("projects")
    .insert({ title, request: request.description, status: "lead", owner_id: ownerId })
    .select("id")
    .single();
  if (error || !project) {
    console.error("PROJECT FROM REQUEST ERROR:", error?.message);
    back(path, { error: "save_failed" });
  }

  await admin.from("quote_requests").update({ project_id: project.id, status: "contacted" }).eq("id", id);
  back(`/admin/projects/${project.id}`, { ok: "created_from_request" });
}

export async function deleteQuote(formData: FormData) {
  await requireRole(["dcl_admin"], { next: "/admin/requests" });
  const id = uuid(formData.get("id"));
  if (!id) back("/admin/requests", { error: "invalid" });

  const { error } = await service("/admin/requests").from("quote_requests").delete().eq("id", id);
  if (error) {
    console.error("QUOTE DELETE ERROR:", error.message);
    back(`/admin/requests/${id}`, { error: "save_failed" });
  }
  back("/admin/requests", { ok: "deleted" });
}

/* ---------------------------------------------------------------- projects */

function projectFields(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  return {
    title: text(formData.get("title"), 160),
    request: text(formData.get("request"), 4000),
    product_type: text(formData.get("product_type"), 120),
    quantity: int(formData.get("quantity")),
    units: int(formData.get("units")),
    size: text(formData.get("size"), 120),
    material: text(formData.get("material"), 120),
    finish: text(formData.get("finish"), 120),
    status: (PROJECT_STATUSES as readonly string[]).includes(status) ? status : null,
  };
}

/* An owner must be an active customer account; a factory must be active. */
async function validOwner(admin: ReturnType<typeof getServiceRoleSupabase>, id: string | null) {
  if (!id) return true;
  const { data } = await admin.from("profiles").select("id").eq("id", id).eq("role", "customer").is("disabled_at", null).maybeSingle();
  return Boolean(data);
}

async function validFactory(admin: ReturnType<typeof getServiceRoleSupabase>, id: string | null) {
  if (!id) return true;
  const { data } = await admin.from("factories").select("id").eq("id", id).eq("active", true).maybeSingle();
  return Boolean(data);
}

export async function createProject(formData: FormData) {
  const path = "/admin/projects/new";
  await team(path);
  const fields = projectFields(formData);
  if (!fields.title) back(path, { error: "title_required" });

  const admin = service(path);
  const ownerId = uuid(formData.get("owner_id"));
  if (!(await validOwner(admin, ownerId))) back(path, { error: "bad_owner" });

  const { data, error } = await admin
    .from("projects")
    .insert({ ...fields, status: fields.status ?? "lead", owner_id: ownerId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("PROJECT CREATE ERROR:", error?.message);
    back(path, { error: "save_failed" });
  }
  back(`/admin/projects/${data.id}`, { ok: "created" });
}

export async function updateProject(formData: FormData) {
  const id = uuid(formData.get("id"));
  const path = id ? `/admin/projects/${id}` : "/admin/projects";
  await team(path);
  if (!id) back("/admin/projects", { error: "invalid" });

  const fields = projectFields(formData);
  if (!fields.title) back(path, { error: "title_required" });
  const { status, ...rest } = fields;

  /* Editable columns go through the team member's own client (RLS + column
     grants allow it). */
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("projects")
    .update({ ...rest, ...(status ? { status } : {}), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("PROJECT UPDATE ERROR:", error.message);
    back(path, { error: "save_failed" });
  }
  back(path, { ok: "saved" });
}

export async function assignProject(formData: FormData) {
  const id = uuid(formData.get("id"));
  const path = id ? `/admin/projects/${id}` : "/admin/projects";
  await team(path);
  if (!id) back("/admin/projects", { error: "invalid" });

  const admin = service(path);
  const ownerId = uuid(formData.get("owner_id"));
  const factoryId = uuid(formData.get("factory_id"));
  if (!(await validOwner(admin, ownerId))) back(path, { error: "bad_owner" });
  if (!(await validFactory(admin, factoryId))) back(path, { error: "bad_factory" });

  const { error } = await admin.from("projects").update({ owner_id: ownerId, factory_id: factoryId }).eq("id", id);
  if (error) {
    console.error("PROJECT ASSIGN ERROR:", error.message);
    back(path, { error: "save_failed" });
  }
  back(path, { ok: "assigned" });
}

export async function setProjectArchived(formData: FormData) {
  const id = uuid(formData.get("id"));
  const path = id ? `/admin/projects/${id}` : "/admin/projects";
  await team(path);
  if (!id) back("/admin/projects", { error: "invalid" });

  const archive = formData.get("archive") === "1";
  const { error } = await service(path)
    .from("projects")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) back(path, { error: "save_failed" });
  back(path, { ok: archive ? "archived" : "restored" });
}

export async function deleteProject(formData: FormData) {
  await requireRole(["dcl_admin"], { next: "/admin/projects" });
  const id = uuid(formData.get("id"));
  if (!id) back("/admin/projects", { error: "invalid" });
  const path = `/admin/projects/${id}`;
  const admin = service(path);

  /* Projects with messages or files keep their history: archive those. */
  const [messages, files] = await Promise.all([
    admin.from("project_messages").select("id", { count: "exact", head: true }).eq("project_id", id),
    admin.from("project_files").select("id", { count: "exact", head: true }).eq("project_id", id),
  ]);
  if ((messages.count ?? 0) > 0 || (files.count ?? 0) > 0) back(path, { error: "has_history" });

  await admin.from("quote_requests").update({ project_id: null }).eq("project_id", id);
  const { error } = await admin.from("projects").delete().eq("id", id);
  if (error) {
    console.error("PROJECT DELETE ERROR:", error.message);
    back(path, { error: "save_failed" });
  }
  back("/admin/projects", { ok: "deleted" });
}

/* --------------------------------------------------------------- factories */

function factoryFields(formData: FormData) {
  const email = text(formData.get("contact_email"), 254);
  return {
    name: text(formData.get("name"), 120),
    contact_name: text(formData.get("contact_name"), 120),
    contact_email: email && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) ? email.toLowerCase() : null,
    phone: text(formData.get("phone"), 40),
    notes: text(formData.get("notes"), 2000),
  };
}

export async function createFactory(formData: FormData) {
  const viewer = await requireRole(["dcl_admin"], { next: "/admin/factories" });
  const fields = factoryFields(formData);
  if (!fields.name) back("/admin/factories", { error: "name_required" });

  const { error } = await service("/admin/factories")
    .from("factories")
    .insert({ ...fields, active: true, created_by: viewer.user.id });
  if (error) {
    console.error("FACTORY CREATE ERROR:", error.message);
    back("/admin/factories", { error: "save_failed" });
  }
  back("/admin/factories", { ok: "factory_created" });
}

export async function updateFactory(formData: FormData) {
  await requireRole(["dcl_admin"], { next: "/admin/factories" });
  const id = uuid(formData.get("id"));
  if (!id) back("/admin/factories", { error: "invalid" });
  const fields = factoryFields(formData);
  if (!fields.name) back("/admin/factories", { error: "name_required" });

  const { error } = await service("/admin/factories").from("factories").update(fields).eq("id", id);
  if (error) back("/admin/factories", { error: "save_failed" });
  back("/admin/factories", { ok: "factory_saved" });
}

export async function setFactoryActive(formData: FormData) {
  await requireRole(["dcl_admin"], { next: "/admin/factories" });
  const id = uuid(formData.get("id"));
  if (!id) back("/admin/factories", { error: "invalid" });
  const active = formData.get("active") === "1";

  const { error } = await service("/admin/factories").from("factories").update({ active }).eq("id", id);
  if (error) back("/admin/factories", { error: "save_failed" });
  back("/admin/factories", { ok: active ? "factory_on" : "factory_off" });
}
