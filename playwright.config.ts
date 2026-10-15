import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 780 },
    baseURL: "http://localhost:4173",
  },
  webServer: [
    {
      // Parity: the production build (no StrictMode double-render, so seeded randomness lines up
      // with the reference), including the bare-game parity page.
      command: "npm run build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      env: { PARITY: "1" },
      timeout: 120_000,
    },
    {
      // Offline/sync: the app against a fake Supabase that tests/e2e/offline.spec.ts answers.
      // Process env overrides .env.local, so the real project is never touched.
      command: "npx vite --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: "http://fake.supabase.test", VITE_SUPABASE_ANON_KEY: "test-anon-key" },
      timeout: 120_000,
    },
  ],
});
