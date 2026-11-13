import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { releaseNotesOf } from "./release-notes.ts"

const changelog = `# Changelog

Intro.

## Unreleased

- Coming next.

## 1.2.0 — 2026-11-05

### English

- Favorites stay.

## 1.1.0 — 2026-11-04

- Splits.
`

describe("releaseNotesOf", () => {
  it("takes everything under the version's heading, up to the next version", () => {
    expect(releaseNotesOf(changelog, "1.2.0")).toBe("### English\n\n- Favorites stay.")
  })

  it("keeps language headings that start with ## inside the version notes", () => {
    const multiLang = `## 1.2.0\n\n## English\n\n- English notes.\n\n## 日本語\n\n- 日本語のノート。\n\n## 1.1.0\n\n- Older.`
    expect(releaseNotesOf(multiLang, "1.2.0")).toBe(
      "## English\n\n- English notes.\n\n## 日本語\n\n- 日本語のノート。",
    )
  })

  it("takes the last version's notes to the end of the file", () => {
    expect(releaseNotesOf(changelog, "1.1.0")).toBe("- Splits.")
  })

  it("doesn't take a version for another that starts the same way", () => {
    expect(() => releaseNotesOf(changelog, "1.2")).toThrow('no "## 1.2" section')
  })

  it("refuses a version with an empty section", () => {
    expect(() => releaseNotesOf("## 1.3.0\n\n## 1.2.0\n\n- Notes.\n", "1.3.0")).toThrow("is empty")
  })
})

describe("the repository's CHANGELOG.md", () => {
  // The release workflow publishes these notes, so a version bumped without them would fail there
  it("has notes for the version in package.json", () => {
    const read = (path: string) =>
      readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")
    const { version }: { version: string } = JSON.parse(read("../package.json"))

    expect(releaseNotesOf(read("../../../CHANGELOG.md"), version)).not.toBe("")
  })
})
