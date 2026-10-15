/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      // parity.html (bare game for the Playwright parity check) is only built for that test.
      input: process.env.PARITY === "1"
        ? { main: page("./index.html"), parity: page("./parity.html") }
        : { main: page("./index.html") },
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "supabase/tests/**/*.test.ts"],
    environment: "node",
  },
});
