import "dotenv/config";

import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * The datasource URL no longer lives in `schema.prisma`; the CLI reads it from
 * here for `migrate`, `db` and `studio`. The running app connects through the
 * `@prisma/adapter-pg` driver adapter in `lib/db.ts`.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
