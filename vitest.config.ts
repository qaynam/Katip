import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/apps/sidepanel/**", "src/apps/options/**", "src/apps/spotlight/**"],
        },
      },
      {
        plugins: [svelte()],
        // Svelte はサーバー向けビルドだと mount できないため、ブラウザ向けエクスポートを解決させる
        resolve: { conditions: ["browser"] },
        test: {
          name: "ui",
          environment: "jsdom",
          include: [
            "src/apps/sidepanel/**/*.test.ts",
            "src/apps/options/**/*.test.ts",
            "src/apps/spotlight/**/*.test.ts",
          ],
        },
      },
    ],
  },
})
