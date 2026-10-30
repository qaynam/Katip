import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "core",
          passWithNoTests: true,
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/apps/sidepanel/**", "src/apps/options/**"],
        },
      },
      {
        plugins: [svelte()],
        // Svelte はサーバー向けビルドだと mount できないため、ブラウザ向けエクスポートを解決させる
        resolve: { conditions: ["browser"] },
        test: {
          name: "ui",
          passWithNoTests: true,
          environment: "jsdom",
          include: ["src/apps/sidepanel/**/*.test.ts", "src/apps/options/**/*.test.ts"],
        },
      },
    ],
  },
})
