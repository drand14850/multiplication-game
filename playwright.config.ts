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
  // The production build: no StrictMode double-render, so seeded randomness lines up with the reference.
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
