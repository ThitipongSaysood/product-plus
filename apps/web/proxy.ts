import { NextResponse, type NextRequest } from "next/server";

// Auth gate (only when APP_PASSWORD is set): cookie pp_session must equal hex HMAC-SHA256(APP_PASSWORD, "pp-session-v1").
// Also forwards the query string as `x-pp-search` so the (shell) layout can read ?pg= (layouts get no searchParams).
const SESSION_MSG = "pp-session-v1";

async function expectedSession(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(SESSION_MSG));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const password = process.env.APP_PASSWORD;
  if (password && pathname !== "/login") {
    const cookie = request.cookies.get("pp_session")?.value ?? "";
    if (!timingSafeEqual(cookie, await expectedSession(password))) {
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
