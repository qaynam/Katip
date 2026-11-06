const VERSION_HEADING = /^## (\S+)/

/**
 * The notes of `version` in a changelog: everything under its `## <version>` heading, up to the next
 * `## ` heading. The heading may go on with the release date, as in `## 1.2.0 — 2026-11-05`.
 *
 * @throws Error when the changelog has no heading for `version`, or nothing under it.
 */
export const releaseNotesOf = (changelog: string, version: string): string => {
  const lines = changelog.split("\n")
  const start = lines.findIndex((line) => VERSION_HEADING.exec(line)?.[1] === version)
  if (start === -1) throw new Error(`CHANGELOG.md has no "## ${version}" section`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  const notes = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim()
  if (notes === "") throw new Error(`The "## ${version}" section of CHANGELOG.md is empty`)
  return notes
}
