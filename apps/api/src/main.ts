import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";
import { getDb } from "./db/client.js";
import { closeOrphaned } from "./jobs/reconcile.js";
import { bootError, needsJson415 } from "./domain/guards.js";

async function main() {
  const refuse = bootError(process.env);
  if (refuse) {
    console.error(`[api] ${refuse}`);
    process.exit(1);
  }
  await getDb(); // opens + migrates before the first request
  await closeOrphaned();
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  // CSRF: mutating calls must be JSON (a cross-site form/img cannot send that content type)
  app.use((req: Request, res: Response, next: NextFunction) =>
    needsJson415(req.method, req.path, req.headers["content-type"]) ? res.status(415).json({ error: "errors.contentType" }) : next(),
  );
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4010);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}/api`);
}

void main();
