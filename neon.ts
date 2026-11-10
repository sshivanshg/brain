import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    realtime: true,
  },
  auth: true,
  aiGateway: true,
  functions: {
    brain: {
      name: "Brain API + MCP",
      source: "./functions/brain.mjs",
      env: {
        BRAIN_TOKEN: { value: process.env.BRAIN_TOKEN, required: true },
        BRAIN_TZ: process.env.BRAIN_TZ ?? "UTC",
        BRAIN_OWNER_EMAILS: { value: process.env.BRAIN_OWNER_EMAILS, required: false },
        // Realtime vars are not injected into Functions and NEON_* is reserved, so pass them under our names.
        BRAIN_REALTIME_URL: { value: process.env.BRAIN_REALTIME_URL, required: false },
        BRAIN_REALTIME_SECRET: { value: process.env.BRAIN_REALTIME_SECRET, required: false },
        NODE_ENV: "production",
      },
    },
    // Public demo: fictional data in an in-memory database, reset on every cold start.
    // It ignores DATABASE_URL and every other service (see server/demo.js).
    demo: {
      name: "Brain public demo",
      source: "./functions/brain.mjs",
      env: {
        BRAIN_DEMO: "1",
        BRAIN_TOKEN: "demo",
        BRAIN_TZ: "UTC",
        NODE_ENV: "production",
      },
    },
  },
  buckets: {
    // Daily JSON backups of every memory (private; read via the API).
    assets: { access: "private" },
  },
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
