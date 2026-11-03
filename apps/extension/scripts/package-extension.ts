import { execFileSync } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { relative } from "node:path"
import { fileURLToPath } from "node:url"

const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

const { version }: { version: string } = JSON.parse(readFileSync(fromRoot("package.json"), "utf8"))
const extensionDir = fromRoot(".release/extension")
const zipPath = fromRoot(`.release/katip-${version}.zip`)

// Not the dist/ of `pnpm build`: `pnpm dev` writes development builds there too, so packing it could
// ship a development build, and building into it would replace the development build in use
execFileSync("pnpm", ["exec", "vite", "build", "--outDir", extensionDir, "--emptyOutDir"], {
  stdio: "inherit",
})

// zip adds to an existing archive, so an earlier zip of the same version would keep files that have
// since been deleted
rmSync(zipPath, { force: true })
execFileSync("zip", ["-r", "-X", "-q", zipPath, "."], { cwd: extensionDir, stdio: "inherit" })

console.log(relative(process.cwd(), zipPath))
