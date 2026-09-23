// Image cache (handoff §11): download right after ingest (XHS URLs expire), 3 tries, ≤ 8 MB,
// sha1 as storage key, bytes in Postgres. A failed download marks the product image_lost so the
// UI says so instead of showing an empty box.
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { media, products } from "../db/schema.js";
import { isPrivateIp, normalizeImageType } from "../domain/guards.js";
import { MOCK_IMAGE_PREFIX, mockSvg } from "../sources/mock.js";

export const MAX_BYTES = 8 * 1024 * 1024;
const TRIES = 3;
const PARALLEL = 6;

type Fetched = { bytes: Buffer; contentType: string };

class Blocked extends Error {}
const MAX_HOPS = 3;

/** SSRF guard: http(s) only, and every address the host resolves to must be public. Returns the address
 *  the request will be pinned to. */
export async function resolvePublic(u: URL): Promise<{ address: string; family: number }> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Blocked(u.protocol);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Blocked(host);
  return addrs[0];
}

/** Dispatcher whose DNS lookup can only return the address we already validated (no rebinding). */
export function pinnedAgent(pin: { address: string; family: number }) {
  return new Agent({
    connect: {
      lookup: (_host: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) =>
        opts?.all ? cb(null, [pin]) : cb(null, pin.address, pin.family),
    } as never,
  });
}

async function fetchOnce(url: string): Promise<Fetched | null> {
  let u = new URL(url);
  for (let hop = 0; ; hop++) {
    const agent = pinnedAgent(await resolvePublic(u)); // validated + pinned per hop
    try {
      const r = await undiciFetch(u, {
        redirect: "manual",
        dispatcher: agent,
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc || hop >= MAX_HOPS) return null;
        u = new URL(loc, u); // re-validated and re-pinned at the top of the loop
        continue;
      }
      if (r.status === 404 || r.status === 403 || r.status === 410) return null; // expired — retrying won't help
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const type = normalizeImageType(r.headers.get("content-type")); // raster only — never SVG/HTML from remote
      if (!type) return null;
      if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length > MAX_BYTES || buf.length === 0 ? null : { bytes: buf, contentType: type };
    } finally {
      void agent.close();
    }
  }
}

export async function download(url: string): Promise<Fetched | null> {
  if (url.startsWith(MOCK_IMAGE_PREFIX)) {
    const svg = mockSvg(url.slice(MOCK_IMAGE_PREFIX.length));
    return svg ? { bytes: Buffer.from(svg), contentType: "image/svg+xml" } : null;
  }
  for (let i = 0; i < TRIES; i++) {
    try {
      return await fetchOnce(url);
    } catch (e) {
      if (e instanceof Blocked) return null; // blocked host: no retry
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

export async function storeMedia(sourceUrl: string, f: Fetched): Promise<string> {
  const db = await getDb();
  const key = createHash("sha1").update(f.bytes).digest("hex");
  await db.insert(media).values({ sourceUrl, storageKey: key, contentType: f.contentType, bytes: f.bytes, size: f.bytes.length }).onConflictDoNothing();
  const [row] = await db.select({ id: media.id }).from(media).where(eq(media.storageKey, key));
  return row.id;
}

export async function cacheMedia(groupId: string, onProgress?: (done: number, total: number) => Promise<void>, limit = 300) {
  const db = await getDb();
  const todo = await db
    .select({ id: products.id, url: products.imageSourceUrl, gallery: products.imageUrls })
    .from(products)
    .where(and(eq(products.productGroupId, groupId), isNull(products.imageMediaId), eq(products.imageLost, false), isNotNull(products.imageSourceUrl)))
    .limit(limit);
  let ok = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const p = todo[next++];
      // main image first, then up to 2 gallery images (some CDN hosts hang for one variant)
      let f: Fetched | null = null;
      let from = p.url!;
      for (const u of [...new Set([p.url!, ...p.gallery])].slice(0, 3)) {
        f = await download(u);
        from = u;
        if (f) break;
      }
      if (f) {
        const mediaId = await storeMedia(from, f);
        await db.update(products).set({ imageMediaId: mediaId }).where(eq(products.id, p.id));
        ok++;
      } else {
        await db.update(products).set({ imageLost: true }).where(eq(products.id, p.id));
        failed++;
      }
      await onProgress?.(ok + failed, todo.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return { ok, failed };
}
