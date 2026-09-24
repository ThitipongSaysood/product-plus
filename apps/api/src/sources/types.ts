import type { Platform } from "@pp/contracts";

export type ScrapeTarget = {
  platform: Platform;
  keyword: string;
  region: string | null;
  limit: number;
  now: Date;
  actorId: string;
  inputTemplate: Record<string, unknown> | null;
  maxTotalChargeUsd?: number | null;
};

/** mock finishes inline; apify returns an external run id finished later by webhook/reconcile. */
export type StartResult =
  | { ok: true; inline: { rows: unknown[]; costUsd: number } }
  | { ok: true; externalRunId: string }
  | { ok: false; reason: string };

export type FetchResult =
  | { finished: false }
  | { finished: true; apifyStatus: string; rows: unknown[]; costUsd: number | null; charged?: Record<string, number> | null; record?: unknown };
