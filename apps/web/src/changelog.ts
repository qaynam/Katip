export type ChangeKind = "new" | "improved" | "fixed"

export interface Change {
  /** The change's short name, as inline HTML. */
  readonly name: string
  /** What changed, as inline HTML. */
  readonly description: string
}

export interface ChangeGroup {
  readonly kind: ChangeKind
  readonly changes: ReadonlyArray<Change>
}

export interface Release {
  readonly version: string
  /** The day it was released, as `YYYY-MM-DD`. */
  readonly date: string
  /** The one sentence on what the version brings, as inline HTML. */
  readonly summary: string
  readonly groups: ReadonlyArray<ChangeGroup>
}

const RELEASE_HEADING = /^## (\d+\.\d+\.\d+\S*) — (\d{4}-\d{2}-\d{2})$/
const OTHER_VERSION_HEADING = /^## Unreleased$/
const LANGUAGE_HEADING = /^## (English|日本語)$/
const GROUP_HEADING = /^### (?:\S+ )?(New|Improved|Fixed)$/
const CHANGE = /^- \*\*(.+?)\*\* — (.+)$/

const KINDS = { New: "new", Improved: "improved", Fixed: "fixed" } as const

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character)

const CODE_SPAN = /(`[^`]+`)/

/**
 * The HTML of a line of the changelog, which uses no Markdown but `code` and **strong**. Any HTML
 * in the line is shown as text.
 */
export const inlineHtml = (markdown: string): string =>
  markdown
    .split(CODE_SPAN)
    .map((part) =>
      CODE_SPAN.test(part)
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : escapeHtml(part).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
    )
    .join("")

interface Draft {
  readonly version: string
  readonly date: string
  readonly summary: Array<string>
  readonly groups: Array<{ readonly kind: ChangeKind; readonly changes: Array<Change> }>
}

const finish = (draft: Draft): Release => {
  if (draft.summary.length === 0 || draft.groups.length === 0) {
    throw new Error(
      `The English notes of ${draft.version} in CHANGELOG.md need a summary and at least one of New, Improved or Fixed`,
    )
  }
  return {
    version: draft.version,
    date: draft.date,
    summary: inlineHtml(draft.summary.join(" ")),
    groups: draft.groups,
  }
}

/**
 * The English notes of every released version in CHANGELOG.md, in the order the file lists them,
 * which is newest first. Unreleased changes are left out, as is each version's Japanese part.
 *
 * @throws Error when a version's English notes have a line that isn't the summary, a New, Improved
 * or Fixed heading, or a change led by its bold name, or when they lack a summary or changes.
 */
export const releasesIn = (changelog: string): ReadonlyArray<Release> => {
  const releases: Array<Release> = []
  let draft: Draft | null = null
  let inEnglish = false
  for (const line of changelog.split("\n").map((text) => text.trim())) {
    const release = RELEASE_HEADING.exec(line)
    const language = LANGUAGE_HEADING.exec(line)
    if (release !== null || OTHER_VERSION_HEADING.test(line)) {
      if (draft !== null) releases.push(finish(draft))
      draft =
        release === null
          ? null
          : { version: release[1] ?? "", date: release[2] ?? "", summary: [], groups: [] }
      inEnglish = false
    } else if (language !== null) {
      inEnglish = language[1] === "English"
    } else if (draft !== null && inEnglish && line !== "") {
      const group = GROUP_HEADING.exec(line)
      const change = CHANGE.exec(line)
      const current = draft.groups.at(-1)
      if (group !== null) {
        draft.groups.push({ kind: KINDS[group[1] as keyof typeof KINDS], changes: [] })
      } else if (change !== null && current !== undefined) {
        current.changes.push({
          name: inlineHtml(change[1] ?? ""),
          description: inlineHtml(change[2] ?? ""),
        })
      } else if (current === undefined && change === null) {
        draft.summary.push(line)
      } else {
        throw new Error(`CHANGELOG.md has a line in ${draft.version} that can't be read: ${line}`)
      }
    }
  }
  if (draft !== null) releases.push(finish(draft))
  return releases
}
