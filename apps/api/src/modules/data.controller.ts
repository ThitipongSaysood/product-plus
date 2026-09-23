// overview · products · categories · trends · runs
import { Controller, Get, Param, Query } from "@nestjs/common";
import { z } from "zod";
import type { ProductsQuery } from "@pp/contracts";
import { ZodPipe } from "../common/http.js";
import { groupBySlug, listRuns } from "../jobs/runs.js";
import { categories, listProducts, overview, productDetail, trends } from "./queries.js";

const productsQuery = z.object({
  pg: z.string().optional(),
  platform: z.string().max(100).optional(),
  category: z.string().max(500).optional(),
  trend: z.enum(["rising", "falling", "flat", "insufficient_history"]).optional(),
  period: z.enum(["30d", "lifetime", "unknown"]).optional(),
  sort: z.enum(["sold", "rank", "price", "new"]).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().optional(),
  active: z.enum(["1", "0", "all"]).optional(),
});
const scoped = z.object({ pg: z.string().optional(), platform: z.string().max(100).optional() });
const runsQuery = z.object({ pg: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).optional() });

@Controller()
export class DataController {
  @Get("overview")
  async overview(@Query("pg") pg?: string) {
    return overview(await groupBySlug(pg));
  }

  @Get("products")
  async products(@Query(new ZodPipe(productsQuery)) q: ProductsQuery) {
    return listProducts(await groupBySlug(q.pg), q);
  }

  @Get("products/:id")
  product(@Param("id") id: string) {
    return productDetail(id);
  }

  @Get("categories")
  async categories(@Query(new ZodPipe(scoped)) q: z.infer<typeof scoped>) {
    return categories(await groupBySlug(q.pg), q.platform);
  }

  @Get("trends")
  async trends(@Query(new ZodPipe(scoped)) q: z.infer<typeof scoped>) {
    return trends(await groupBySlug(q.pg), q.platform);
  }

  @Get("runs")
  async runs(@Query(new ZodPipe(runsQuery)) q: z.infer<typeof runsQuery>) {
    return listRuns((await groupBySlug(q.pg)).id, q.limit ?? 50);
  }
}
