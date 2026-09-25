import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["scout"],
  // Same journal location as the runtime migrator (src/db/client.ts).
  migrations: { schema: "product_plus" },
});
