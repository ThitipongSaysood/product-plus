import { headers } from "next/headers";

// Server-side fetch to the NestJS api, forwarding the browser's cookie (pp_session).
const API_URL = process.env.API_URL ?? "http://localhost:4010";

export type ApiResult<T> = { data: T; error?: undefined } | { data?: undefined; error: `${string}.${string}`; status?: number };

export async function api<T>(path: string): Promise<ApiResult<T>> {
  const cookie = (await headers()).get("cookie") ?? "";
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { error: "errors.apiDown" };
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const key = body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error ? (body.error as `${string}.${string}`) : "errors.http";
    return { error: key, status: res.status };
  }
  return { data: body as T };
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
