import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base は GitHub Pages などサブパス配信時に "--base=/my-trip/" で上書きする
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "node",
    // e2e/ は Playwright で実行する(vitest の対象外)
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
