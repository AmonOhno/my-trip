import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base は GitHub Pages などサブパス配信時に "--base=/my-trip/" で上書きする
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "node",
  },
});
