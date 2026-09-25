CREATE SCHEMA IF NOT EXISTS "product_plus";
--> statement-breakpoint
CREATE TABLE "product_plus"."actor_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_run_id" uuid,
	"platform" text NOT NULL,
	"actor_id" text NOT NULL,
	"title" text,
	"evaluated_at" timestamp with time zone NOT NULL,
	"plan_tier" text NOT NULL,
	"start_fee" numeric(10, 6) NOT NULL,
	"price_per_result" numeric(10, 6) NOT NULL,
	"est_cost_50" numeric(10, 6) NOT NULL,
	"cost_per_result_50" numeric(10, 6) NOT NULL,
	"has_sold_30d" boolean NOT NULL,
	"has_sold" boolean NOT NULL,
	"has_category" boolean NOT NULL,
	"has_image" boolean NOT NULL,
	"has_link" boolean NOT NULL,
	"has_trend" boolean NOT NULL,
	"needs_cookie" boolean NOT NULL,
	"completeness" integer NOT NULL,
	"fail_rate_30d" real,
	"runs_30d" integer,
	"smoke_items_in" integer,
	"smoke_items_out" integer,
	"smoke_cost_usd" numeric(10, 4),
	"chosen" boolean DEFAULT false NOT NULL,
	"excluded" text,
	"reason" text,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_plus"."app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_plus"."category_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"platform_path" text NOT NULL,
	"category_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_plus"."change_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_group_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"scrape_run_id" uuid,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_plus"."keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_group_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"keyword" text NOT NULL,
	"region" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_plus"."media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_plus"."product_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text DEFAULT 'CN' NOT NULL,
	"platforms" text[] DEFAULT '{}'::text[] NOT NULL,
	"monthly_budget_usd" numeric(8, 2) DEFAULT 10 NOT NULL,
	"result_limit" integer DEFAULT 50 NOT NULL,
	"run_cap_usd" numeric(8, 2) DEFAULT 1 NOT NULL,
	"schedule" text DEFAULT 'weekly' NOT NULL,
	"schedule_hour" integer DEFAULT 5 NOT NULL,
	"schedule_weekday" integer DEFAULT 1 NOT NULL,
	"source_mode" text,
	"taxonomy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_plus"."product_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"product_group_id" uuid NOT NULL,
	"scrape_run_id" uuid NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"rank" integer,
	"price" numeric(12, 2),
	"sold_count" integer,
	"sold_period" text NOT NULL,
	"sold_lower_bound" boolean DEFAULT false NOT NULL,
	"sales_trend" jsonb,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_plus"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_group_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"keyword" text,
	"title" text,
	"title_th" text,
	"title_th_at" timestamp with time zone,
	"product_url" text,
	"image_media_id" uuid,
	"image_source_url" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_lost" boolean DEFAULT false NOT NULL,
	"currency" text,
	"price" numeric(12, 2),
	"original_price" numeric(12, 2),
	"shop_name" text,
	"shop_url" text,
	"platform_category_path" text[],
	"category_key" text,
	"category_source" text,
	"category_tagged_at" timestamp with time zone,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platform_signals" jsonb,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"missed_runs" integer DEFAULT 0 NOT NULL,
	"gone_at" timestamp with time zone,
	"latest_sold_count" integer,
	"latest_sold_period" text DEFAULT 'unknown' NOT NULL,
	"latest_sold_lower_bound" boolean DEFAULT false NOT NULL,
	"latest_sold_text" text,
	"latest_rank" integer,
	"latest_snapshot_at" timestamp with time zone,
	"trend_label" text DEFAULT 'insufficient_history' NOT NULL,
	"trend_delta_sold" integer,
	"trend_delta_rank" integer,
	"trend_douyin_ratio" real,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_plus"."scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_group_id" uuid,
	"keyword_id" uuid,
	"keyword" text,
	"platform" text,
	"actor_id" text,
	"kind" text NOT NULL,
	"parent_run_id" uuid,
	"step" text,
	"status" text DEFAULT 'running' NOT NULL,
	"apify_run_id" text,
	"progress_done" integer,
	"progress_total" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_in" integer,
	"items_out" integer,
	"cost_usd" numeric(10, 4),
	"cost_final" boolean DEFAULT false NOT NULL,
	"note" text,
	"report" jsonb
);
--> statement-breakpoint
ALTER TABLE "product_plus"."change_events" ADD CONSTRAINT "change_events_product_group_id_product_groups_id_fk" FOREIGN KEY ("product_group_id") REFERENCES "product_plus"."product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_plus"."change_events" ADD CONSTRAINT "change_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "product_plus"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_plus"."keywords" ADD CONSTRAINT "keywords_product_group_id_product_groups_id_fk" FOREIGN KEY ("product_group_id") REFERENCES "product_plus"."product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_plus"."product_snapshots" ADD CONSTRAINT "product_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "product_plus"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_plus"."products" ADD CONSTRAINT "products_product_group_id_product_groups_id_fk" FOREIGN KEY ("product_group_id") REFERENCES "product_plus"."product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_plus"."products" ADD CONSTRAINT "products_image_media_id_media_id_fk" FOREIGN KEY ("image_media_id") REFERENCES "product_plus"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_plus"."scrape_runs" ADD CONSTRAINT "scrape_runs_product_group_id_product_groups_id_fk" FOREIGN KEY ("product_group_id") REFERENCES "product_plus"."product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_plus"."scrape_runs" ADD CONSTRAINT "scrape_runs_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "product_plus"."keywords"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actor_eval_platform_idx" ON "product_plus"."actor_evaluations" USING btree ("platform","evaluated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "category_map_platform_path_uq" ON "product_plus"."category_map" USING btree ("platform","platform_path");--> statement-breakpoint
CREATE INDEX "events_group_occurred_idx" ON "product_plus"."change_events" USING btree ("product_group_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_product_kind_run_uq" ON "product_plus"."change_events" USING btree ("product_id","kind","scrape_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_group_platform_keyword_uq" ON "product_plus"."keywords" USING btree ("product_group_id","platform","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_uq" ON "product_plus"."media" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "snapshots_product_taken_idx" ON "product_plus"."product_snapshots" USING btree ("product_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_product_run_uq" ON "product_plus"."product_snapshots" USING btree ("product_id","scrape_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_group_platform_ext_uq" ON "product_plus"."products" USING btree ("product_group_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "products_group_platform_active_idx" ON "product_plus"."products" USING btree ("product_group_id","platform","is_active");--> statement-breakpoint
CREATE INDEX "products_group_category_idx" ON "product_plus"."products" USING btree ("product_group_id","category_key");--> statement-breakpoint
CREATE INDEX "scrape_runs_group_kind_idx" ON "product_plus"."scrape_runs" USING btree ("product_group_id","kind","started_at");--> statement-breakpoint
CREATE INDEX "scrape_runs_status_idx" ON "product_plus"."scrape_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scrape_runs_apify_idx" ON "product_plus"."scrape_runs" USING btree ("apify_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_runs_one_running_job_uq" ON "product_plus"."scrape_runs" USING btree ("product_group_id","kind") WHERE "product_plus"."scrape_runs"."status" = 'running' AND "product_plus"."scrape_runs"."kind" IN ('pipeline', 'smoke');