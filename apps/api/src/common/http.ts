import { createHmac, timingSafeEqual } from "node:crypto";
import {
  Catch,
  HttpException,
  Injectable,
  type ArgumentsHost,
  type CanActivate,
  type ExecutionContext,
  type ExceptionFilter,
  type PipeTransform,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "./errors.js";

export const SESSION_COOKIE = "pp_session";
export const SESSION_TTL_S = 30 * 24 * 3600;
const sessionSig = (password: string, exp: number) => createHmac("sha256", password).update(`pp-session-v1|${exp}`).digest("hex");

/** Cookie value `<expiryEpochSeconds>.<hex HMAC-SHA256(key=APP_PASSWORD, msg="pp-session-v1|<expiry>")>`. */
export function issueSession(password: string, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_S;
  return `${exp}.${sessionSig(password, exp)}`;
}

export function verifySession(cookie: string, password: string, nowMs = Date.now()) {
  const m = cookie.match(/^(\d{1,12})\.([0-9a-f]{64})$/);
  if (!m) return false;
  const exp = Number(m[1]);
  const now = Math.floor(nowMs / 1000);
  if (exp <= now || exp > now + SESSION_TTL_S + 60) return false;
  return safeEqual(m[2], sessionSig(password, exp));
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const PUBLIC = [/^\/api\/health$/, /^\/api\/auth$/, /^\/api\/webhooks\/apify$/, /^\/api\/cron\//, /^\/api\/media\//];

/** Cookie auth when APP_PASSWORD is set; open otherwise. Public routes carry their own secrets. */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const password = process.env.APP_PASSWORD;
    if (!password) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (PUBLIC.some((re) => re.test(req.path))) return true;
    const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE] ?? "";
    if (verifySession(cookie, password)) return true;
    throw new AppError(401, "common.unauthorized");
  }
}

/** CRON_SECRET via `Authorization: Bearer` only. Fails closed: unset secret → nobody. */
export function cronAuthorized(req: Pick<Request, "headers">, secret = process.env.CRON_SECRET) {
  if (!secret) return false;
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  return safeEqual(bearer, secret);
}

export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) throw new AppError(400, "errors.validation");
    return r.data;
  }
}

const STATUS_KEYS: Record<number, string> = {
  400: "errors.validation",
  401: "common.unauthorized",
  403: "common.forbidden",
  404: "errors.notFound",
  413: "errors.tooLarge",
  415: "errors.contentType",
  429: "errors.auth.rateLimited",
};

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof AppError) return res.status(e.status).json({ error: e.key, ...e.extra });
    if (e instanceof HttpException) {
      const status = e.getStatus();
      return res.status(status).json({ error: STATUS_KEYS[status] ?? "errors.internal" });
    }
    console.error("[api] unhandled", e);
    return res.status(500).json({ error: "errors.internal" });
  }
}
