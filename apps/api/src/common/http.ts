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
export const sessionToken = (password: string) => createHmac("sha256", password).update("pp-session-v1").digest("hex");

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
    if (safeEqual(cookie, sessionToken(password))) return true;
    throw new AppError(401, "common.unauthorized");
  }
}

/** CRON_SECRET via Bearer or ?secret=. Unset → allowed only outside production. */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const q = typeof req.query.secret === "string" ? req.query.secret : "";
  return safeEqual(bearer, secret) || safeEqual(q, secret);
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
