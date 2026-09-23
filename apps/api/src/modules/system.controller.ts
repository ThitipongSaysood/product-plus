// health · auth · settings · media · webhooks · cron
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { media, scrapeRuns } from "../db/schema.js";
import { AppError } from "../common/errors.js";
import { cronAuthorized, safeEqual, SESSION_COOKIE, sessionToken, ZodPipe } from "../common/http.js";
import { entryFor, getSetting, listSettings, saveSetting, sourceMode, testService } from "../settings/settings.js";
import { mockSvg } from "../sources/mock.js";
import { apifyFetch } from "../sources/apify.js";
import { finishApifyRun } from "../jobs/reconcile.js";
import { runWeekly } from "./weekly.js";

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

@Controller()
export class SystemController {
  @Get("health")
  async health() {
    let db = false;
    try {
      await (await getDb()).execute("select 1");
      db = true;
    } catch {
      db = false;
    }
    return { ok: db, db, sourceMode: await sourceMode() };
  }

  @Post("auth")
  @HttpCode(200)
  login(@Body(new ZodPipe(z.object({ password: z.string().max(200) }))) body: { password: string }, @Res({ passthrough: true }) res: Response) {
    const password = process.env.APP_PASSWORD;
    if (!password) return { ok: true };
    if (!safeEqual(body.password, password)) throw new AppError(401, "errors.auth.wrongPassword");
    res.cookie(SESSION_COOKIE, sessionToken(password), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: THIRTY_DAYS,
      path: "/",
    });
    return { ok: true };
  }

  @Delete("auth")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("settings")
  settings() {
    return listSettings();
  }

  @Put("settings")
  async saveSettings(@Body(new ZodPipe(z.object({ key: z.string(), value: z.string().max(4000).nullable() }))) body: { key: string; value: string | null }) {
    const e = entryFor(body.key);
    if (!e) throw new AppError(400, "errors.validation");
    if (e.envOnly) throw new AppError(400, "errors.settings.envOnly");
    if (body.key === "SOURCE_MODE" && body.value && !["mock", "apify"].includes(body.value)) throw new AppError(400, "errors.validation");
    await saveSetting(body.key, body.value);
    return listSettings();
  }

  @Post("settings/test")
  @HttpCode(200)
  test(@Body(new ZodPipe(z.object({ service: z.enum(["apify", "anthropic"]) }))) body: { service: "apify" | "anthropic" }) {
    return testService(body.service);
  }

  @Get("media/mock/:file")
  mockMedia(@Param("file") file: string, @Res() res: Response) {
    const svg = mockSvg(file);
    if (!svg) return res.status(404).json({ error: "errors.media.notFound" });
    res.setHeader("content-type", "image/svg+xml");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    return res.send(svg);
  }

  @Get("media/:id")
  async media(@Param("id") id: string, @Res() res: Response) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: "errors.media.notFound" });
    const db = await getDb();
    const [m] = await db.select().from(media).where(eq(media.id, id));
    if (!m) return res.status(404).json({ error: "errors.media.notFound" });
    res.setHeader("content-type", m.contentType);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    if (m.contentType === "image/svg+xml") res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
    return res.send(m.bytes);
  }

  /** Apify webhook — the payload is only a hint; the run is re-read from Apify before ingest. */
  @Post("webhooks/apify")
  @HttpCode(200)
  async apifyWebhook(@Query("secret") secret: string | undefined, @Body() body: { resource?: { id?: string } }) {
    const expected = await getSetting("APIFY_WEBHOOK_SECRET");
    if (!expected || !secret || !safeEqual(secret, expected)) throw new AppError(401, "common.unauthorized");
    const apifyRunId = body?.resource?.id;
    if (!apifyRunId) return { ok: true, ignored: true };
    const db = await getDb();
    const [run] = await db.select().from(scrapeRuns).where(eq(scrapeRuns.apifyRunId, apifyRunId));
    if (!run || run.status !== "running") return { ok: true, ignored: true };
    const token = await getSetting("APIFY_TOKEN");
    if (!token) return { ok: true, ignored: true };
    const res = await apifyFetch(token, apifyRunId, 50);
    if (!res.finished) return { ok: true, ignored: true };
    await finishApifyRun(run, res);
    return { ok: true };
  }

  @Get("cron/weekly")
  async weekly(@Req() req: Request) {
    if (!cronAuthorized(req)) throw new AppError(401, "common.unauthorized");
    return { ok: true, ...(await runWeekly()) };
  }
}
