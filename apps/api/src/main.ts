import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { getDb } from "./db/client.js";
import { closeOrphaned } from "./jobs/reconcile.js";

async function main() {
  await getDb(); // opens + migrates before the first request
  await closeOrphaned();
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4010);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}/api`);
}

void main();
