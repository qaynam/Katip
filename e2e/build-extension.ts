import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { EXTENSION_DIR } from "./extension-dir"

const CONTRACT_VITE_CONFIG = fileURLToPath(new URL("./contract/vite.config.ts", import.meta.url))

// 開発ビルドは dist/ に書き、`pnpm dev` で読み込んでいる拡張を再読み込みさせてしまう。
// 利用者に配るものと同じ本番ビルドを、別の場所に作る
export default function buildExtension() {
  execFileSync("pnpm", ["exec", "vite", "build", "--outDir", EXTENSION_DIR, "--emptyOutDir"], {
    stdio: "inherit",
  })
  execFileSync("pnpm", ["exec", "vite", "build", "--config", CONTRACT_VITE_CONFIG], {
    stdio: "inherit",
  })
}
