import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/build-extension.ts",
  // Each test launches Chrome with its own profile, so running them in parallel costs a lot and
  // gains little
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  outputDir: "./.e2e/results",
  use: { trace: "retain-on-failure" },
})
