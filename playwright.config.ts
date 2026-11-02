import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/build-extension.ts",
  // テストごとに別のプロファイルで Chrome を起動するので、並べると重い割に速くならない
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  outputDir: "./.e2e/results",
  use: { trace: "retain-on-failure" },
})
