import { defineConfig } from "drizzle-kit";

// `db:migrate` needs DATABASE_URL; read it from .env.local when present (Node 22+).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment (CI, Vercel).
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
