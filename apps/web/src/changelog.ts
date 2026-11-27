export type ChangeKind = "new" | "improved" | "fixed"

export interface Change {
  /** The change's short name, as inline HTML. */
  readonly name: string
  /** What changed, in one paragraph or more, each as inline HTML. */
  readonly paragraphs: ReadonlyArray<string>
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
const HEADED_CHANGE = /^#### (.+)$/
const LISTED_CHANGE = /^- \*\*(.+?)\*\* — (.+)$/
// Lists, quotes and other headings, which the site would show as plain text where GitHub doesn't
const OTHER_MARKDOWN_BLOCK = /^(?:#|[-*+] |\d+\. |>)/

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

interface DraftChange {
  readonly name: string
  /** Under a heading of its own, rather than in a list, where it takes paragraphs after it. */
  readonly headed: boolean
  /** The lines of each paragraph, as Markdown. */
  readonly paragraphs: Array<Array<string>>
}

interface Draft {
  readonly version: string
  readonly date: string
  readonly summary: Array<string>
  readonly groups: Array<{ readonly kind: ChangeKind; readonly changes: Array<DraftChange> }>
}

const finish = (draft: Draft): Release => {
  if (draft.summary.length === 0 || draft.groups.length === 0) {
    throw new Error(
      `The English notes of ${draft.version} in CHANGELOG.md need a summary and at least one of New, Improved or Fixed`,
    )
  }
  const unexplained = draft.groups
    .flatMap((group) => group.changes)
    .find((change) => change.paragraphs.length === 0)
  if (unexplained !== undefined) {
    throw new Error(
      `CHANGELOG.md has nothing under "${unexplained.name}" in ${draft.version}, which needs a paragraph on what changed`,
    )
  }
  return {
    version: draft.version,
    date: draft.date,
    summary: inlineHtml(draft.summary.join(" ")),
    groups: draft.groups.map(({ kind, changes }) => ({
      kind,
      changes: changes.map(({ name, paragraphs }) => ({
        name: inlineHtml(name),
        paragraphs: paragraphs.map((lines) => inlineHtml(lines.join(" "))),
      })),
    })),
  }
}

/**
 * The English notes of every released version in CHANGELOG.md, in the order the file lists them,
 * which is newest first. Unreleased changes are left out, as is each version's Japanese part.
 *
 * A change is either under a `####` heading of its own, with its paragraphs after it, or an item of a
 * list led by its bold name, as versions up to 1.14.0 have them.
 *
 * @throws Error when a version's English notes have a line that isn't the summary, a New, Improved
 * or Fixed heading, a change or a paragraph under a change's heading, or when they lack a summary,
 * changes or a paragraph under a change's heading.
 */
export const releasesIn = (changelog: string): ReadonlyArray<Release> => {
  const releases: Array<Release> = []
  let draft: Draft | null = null
  let inEnglish = false
  // Whether the line before was a paragraph's, which a line right after it goes on with
  let inParagraph = false
  for (const line of changelog.split("\n").map((text) => text.trim())) {
    const goesOnWithParagraph = inParagraph
    inParagraph = false
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
      const headed = HEADED_CHANGE.exec(line)
      const listed = LISTED_CHANGE.exec(line)
      const currentGroup = draft.groups.at(-1)
      const currentChange = currentGroup?.changes.at(-1)
      if (group !== null) {
        draft.groups.push({ kind: KINDS[group[1] as keyof typeof KINDS], changes: [] })
      } else if (currentGroup === undefined && headed === null && listed === null) {
        draft.summary.push(line)
      } else if (currentGroup !== undefined && headed !== null) {
        currentGroup.changes.push({ name: headed[1] ?? "", headed: true, paragraphs: [] })
      } else if (currentGroup !== undefined && listed !== null) {
        currentGroup.changes.push({
          name: listed[1] ?? "",
          headed: false,
          paragraphs: [[listed[2] ?? ""]],
        })
      } else if (currentChange?.headed === true && !OTHER_MARKDOWN_BLOCK.test(line)) {
        const paragraph = currentChange.paragraphs.at(-1)
        if (goesOnWithParagraph && paragraph !== undefined) paragraph.push(line)
        else currentChange.paragraphs.push([line])
        inParagraph = true
      } else {
        throw new Error(`CHANGELOG.md has a line in ${draft.version} that can't be read: ${line}`)
      }
    }
  }
  if (draft !== null) releases.push(finish(draft))
  return releases
}
