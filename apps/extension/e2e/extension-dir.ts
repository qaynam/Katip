import { fileURLToPath } from "node:url"

/** Where the production build of the extension that E2E tests load into Chrome is written. */
export const EXTENSION_DIR = fileURLToPath(new URL("../.e2e/extension", import.meta.url))

/** Where the test-only extension that checks the browser API contract on real Chrome is written. */
export const CONTRACT_EXTENSION_DIR = fileURLToPath(
  new URL("../.e2e/contract-extension", import.meta.url),
)
