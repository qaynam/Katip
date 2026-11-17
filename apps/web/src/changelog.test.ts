import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { inlineHtml, releasesIn } from "./changelog.ts"

const CHANGELOG_MD = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8")

const notes = (body: string) => `# Changelog\n\nIntro.\n\n${body}`

describe("releasesIn", () => {
  it("reads every released version of CHANGELOG.md, newest first", () => {
    const releases = releasesIn(CHANGELOG_MD)

    expect(releases.at(-1)).toMatchObject({ version: "1.0.0", date: "2026-11-03" })
    expect(releases.map((release) => release.date)).toEqual(
      releases
        .map((release) => release.date)
        .toSorted()
        .toReversed(),
    )
    for (const release of releases) {
      expect(release.summary).not.toBe("")
      expect(release.groups.length).toBeGreaterThan(0)
    }
  })

  it("keeps the English notes only", () => {
    const text = JSON.stringify(releasesIn(CHANGELOG_MD))

    expect(text).not.toMatch(/[ぁ-んァ-ン]/)
  })

  it("leaves unreleased changes out", () => {
    const releases = releasesIn(
      notes(
        "## Unreleased\n\n## English\n\nSoon.\n\n### 🚀 New\n\n- **Next** — Not out yet.\n\n" +
          "## 1.1.0 — 2026-11-04\n\n## English\n\nOut now.\n\n### 🐛 Fixed\n\n- **Done** — Shipped.\n",
      ),
    )

    expect(releases.map((release) => release.version)).toEqual(["1.1.0"])
  })

  it("groups the changes under New, Improved and Fixed, in the order they come", () => {
    const [release] = releasesIn(
      notes(
        "## 1.2.0 — 2026-11-05\n\n## English\n\nTwo lines\nof summary.\n\n" +
          "### ✨ Improved\n\n- **Faster** — It is faster.\n- **Smaller** — It is smaller.\n\n" +
          "### 🐛 Fixed\n\n- **Crash** — It no longer crashes.\n\n" +
          "## 日本語\n\n要約。\n\n### 🐛 修正\n\n- **クラッシュ** — 直りました。\n",
      ),
    )

    expect(release).toEqual({
      version: "1.2.0",
      date: "2026-11-05",
      summary: "Two lines of summary.",
      groups: [
        {
          kind: "improved",
          changes: [
            { name: "Faster", description: "It is faster." },
            { name: "Smaller", description: "It is smaller." },
          ],
        },
        { kind: "fixed", changes: [{ name: "Crash", description: "It no longer crashes." }] },
      ],
    })
  })

  it("refuses a line it can't place, rather than leave it out", () => {
    expect(() =>
      releasesIn(
        notes("## 1.3.0 — 2026-11-06\n\n## English\n\nSummary.\n\n### 🚀 New\n\nA stray line.\n"),
      ),
    ).toThrow(/1\.3\.0 that can't be read: A stray line/)
  })

  it("refuses a version without a summary or changes", () => {
    expect(() =>
      releasesIn(notes("## 1.4.0 — 2026-11-06\n\n## English\n\n### 🚀 New\n\n- **A** — B.\n")),
    ).toThrow(/1\.4\.0 .* need a summary/)
    expect(() => releasesIn(notes("## 1.5.0 — 2026-11-06\n\n## English\n\nSummary.\n"))).toThrow(
      /1\.5\.0/,
    )
  })
})

describe("inlineHtml", () => {
  it("turns code spans and strong text into HTML", () => {
    expect(inlineHtml("Type `!gh katip` for **GitHub**")).toBe(
      "Type <code>!gh katip</code> for <strong>GitHub</strong>",
    )
  })

  it("shows HTML in the text as text, inside code spans too", () => {
    expect(inlineHtml("<b>bold</b> & `<i>`")).toBe(
      "&lt;b&gt;bold&lt;/b&gt; &amp; <code>&lt;i&gt;</code>",
    )
  })

  it("leaves the inside of a code span as written", () => {
    expect(inlineHtml("`**not bold**`")).toBe("<code>**not bold**</code>")
  })
})
