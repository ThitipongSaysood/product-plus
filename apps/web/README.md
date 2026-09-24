# @pp/web — China Marketplace Scout frontend

Next.js 16 (App Router) · Tailwind 4 · OMNIX Design System (`docs/design-system.md`) · Recharts. Port **3020**.

- `/api/*` is rewritten to the api (`API_URL`, default `http://localhost:4010`) — the browser sees one origin. `API_URL` is read at **build** time too.
- Server components fetch through `lib/api.ts` (forwards the cookie); browser mutations go through `lib/client-api.ts` (always JSON — the api rejects anything else).
- `proxy.ts` gates every page when `APP_PASSWORD` is set: cookie `pp_session = <exp>.<hex HMAC-SHA256(APP_PASSWORD, "pp-session-v1|<exp>")>`.
- Every visible string goes through `t()` — `i18n/dictionary.ts` (th · en · zh). Run notes from the api are English patterns translated by `lib/notes.ts`.
- Icons are generated: `pnpm --filter @pp/web gen:icons` (Boxicons → `components/icons.tsx`) — never edit by hand.

Tests (`pnpm --filter @pp/web test`): dictionary completeness, WCAG contrast of the tokens, RWD audit of the CSS, note patterns, back-link allow-list, proxy cookie, client JSON helper.
