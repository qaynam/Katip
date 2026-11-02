import { execFileSync } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { relative } from "node:path"
import { fileURLToPath } from "node:url"

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const { version }: { version: string } = JSON.parse(readFileSync(fromRoot("package.json"), "utf8"))
const extensionDir = fromRoot(".release/extension")
const zipPath = fromRoot(`.release/katip-${version}.zip`)

// `pnpm build` の dist/ は `pnpm dev` が開発ビルドを書く場所でもあり、そこから詰めると開発ビルドを
// 配りかねない。読み込んで使っている開発ビルドも、本番ビルドで置き換えてしまう
execFileSync("pnpm", ["exec", "vite", "build", "--outDir", extensionDir, "--emptyOutDir"], {
  stdio: "inherit",
})

// zip は既にある書庫へ書き足すので、前に作った同じ版の zip に消したファイルが残ってしまう
rmSync(zipPath, { force: true })
execFileSync("zip", ["-r", "-X", "-q", zipPath, "."], { cwd: extensionDir, stdio: "inherit" })

console.log(relative(process.cwd(), zipPath))
