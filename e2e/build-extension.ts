import { execFileSync } from "node:child_process"
import { EXTENSION_DIR } from "./extension-dir"

// 開発ビルドは dist/ に書き、`pnpm dev` で読み込んでいる拡張を再読み込みさせてしまう。
// 利用者に配るものと同じ本番ビルドを、別の場所に作る
export default function buildExtension() {
  execFileSync("pnpm", ["exec", "vite", "build", "--outDir", EXTENSION_DIR, "--emptyOutDir"], {
    stdio: "inherit",
  })
}
