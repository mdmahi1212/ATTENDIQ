import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true }, // Vite 8 resolves the "@/*" alias natively
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
