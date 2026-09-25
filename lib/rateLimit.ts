import type { NextRequest } from "next/server";

/* Best effort, per-instance throttle shared by the public form routes.
   It is enough to stop a single connection from hammering a form and is
   intentionally not a distributed limiter. */
export function createRateLimiter({
  windowMs,
  maxRequests,
  maxKeys = 5000,
}: {
  windowMs: number;
  maxRequests: number;
  maxKeys?: number;
}) {
  const hits = new Map<string, number[]>();

  return function isRateLimited(key: string) {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((hit) => now - hit < windowMs);

    if (recent.length >= maxRequests) {
      hits.set(key, recent);
      return true;
    }

    recent.push(now);
    hits.set(key, recent);

    if (hits.size > maxKeys) {
      hits.clear();
    }

    return false;
  };
}

/* Best-effort client identity for the throttle. On Vercel `x-real-ip` is
   platform-set and `x-forwarded-for` appends the real client IP last, so a
   value injected by the caller cannot be used to reset the bucket. */
export function clientKey(request: NextRequest) {
  const realIp = request.headers.get("x-real-ip")?.trim();

  if (realIp) {
    return realIp;
  }

  const hops = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);

  return hops && hops.length > 0 ? hops[hops.length - 1] : "unknown";
}
