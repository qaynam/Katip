import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { EXTENSION_DIR } from "./extension-dir"

const CONTRACT_VITE_CONFIG = fileURLToPath(new URL("./contract/vite.config.ts", import.meta.url))

// Not the development build: it writes to dist/ and would reload the extension loaded by
// `pnpm dev`. Build the same production bundle users get, into a separate directory
export default function buildExtension() {
  execFileSync("pnpm", ["exec", "vite", "build", "--outDir", EXTENSION_DIR, "--emptyOutDir"], {
    stdio: "inherit",
  })
  execFileSync("pnpm", ["exec", "vite", "build", "--config", CONTRACT_VITE_CONFIG], {
    stdio: "inherit",
  })
}
