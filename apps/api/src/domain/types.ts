import type { Currency, Platform, SoldPeriod } from "@pp/contracts";

export const PLATFORM_LIST: readonly Platform[] = ["douyin", "1688", "temu", "xhs"];
export const MAX_RESULTS = 50; // handoff rule 0.4 — also cut at ingest

/** Handoff §7 — one normalized product row from any actor. */
export type ProductInput = {
  platform: Platform;
  externalId: string;
  title: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  price: number | null;
  currency: Currency | null;
  originalPrice: number | null;
  soldCount: number | null;
  soldPeriod: SoldPeriod;
  soldIsLowerBound: boolean;
  soldText: string | null;
  salesTrend: { date: string; units: number }[] | null;
  platformCategoryPath: string[] | null;
  shopName: string | null;
  shopUrl: string | null;
  rank: number;
  keyword: string;
  platformSignals: { isTrending?: boolean; demandScore?: number } | null;
  raw: unknown;
};

export type SnapshotLike = {
  takenAt: Date;
  rank: number | null;
  price: number | null;
  soldCount: number | null;
  soldPeriod: SoldPeriod;
  soldLowerBound: boolean;
  salesTrend?: { date: string; units: number }[] | null;
};
