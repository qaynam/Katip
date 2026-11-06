import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { releaseNotesOf } from "./release-notes.ts"

// Prints the notes of the version given as the argument, from the repository's CHANGELOG.md. Fails
// when it has none, so a release can't go out without them
const [version] = process.argv.slice(2)
if (version === undefined) throw new Error("Usage: node scripts/print-release-notes.ts <version>")
const changelog = readFileSync(
  fileURLToPath(new URL("../../../CHANGELOG.md", import.meta.url)),
  "utf8",
)
console.log(releaseNotesOf(changelog, version))
