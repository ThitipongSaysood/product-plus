import { NextResponse, type NextRequest } from "next/server";

// Auth gate (only when APP_PASSWORD is set). Cookie pp_session = "<expiryEpochSeconds>.<hex HMAC-SHA256(key=APP_PASSWORD,
// msg="pp-session-v1|<expiry>")>", issued by the api (POST /api/auth) for 30 days — must match apps/api/src/common/http.ts.
// Also forwards the query string as `x-pp-search` so the (shell) layout can read ?pg= (layouts get no searchParams).
const SESSION_TTL_S = 30 * 24 * 3600;

async function hmacHex(password: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifySession(cookie: string, password: string, nowMs = Date.now()): Promise<boolean> {
  const m = cookie.match(/^(\d{1,12})\.([0-9a-f]{64})$/);
  if (!m) return false;
  const exp = Number(m[1]);
  const now = Math.floor(nowMs / 1000);
  if (exp <= now || exp > now + SESSION_TTL_S + 60) return false;
  return timingSafeEqual(m[2], await hmacHex(password, `pp-session-v1|${exp}`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const password = process.env.APP_PASSWORD;
  if (password && pathname !== "/login") {
    const cookie = request.cookies.get("pp_session")?.value ?? "";
    if (!(await verifySession(cookie, password))) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  const headers = new Headers(request.headers);
  headers.set("x-pp-search", search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // /api/* has its own auth in the NestJS api; static assets pass untouched.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
