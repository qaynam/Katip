const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

const MAX_CODE_POINT = 0x10ffff

const decodeEntity = (reference: string, body: string): string => {
  const lower = body.toLowerCase()
  if (!lower.startsWith("#")) return namedEntities[lower] ?? reference
  const codePoint = lower.startsWith("#x")
    ? Number.parseInt(lower.slice(2), 16)
    : Number.parseInt(lower.slice(1), 10)
  return codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : reference
}

const referencePattern = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi

/**
 * Decodes the character references in text or an attribute value, such as `&amp;` or `&#39;`.
 * Leaves a named reference it doesn't know as it is.
 */
export const decodeCharacterReferences = (text: string): string =>
  text.replace(referencePattern, decodeEntity)

// Only for inline markup, such as <em> or <code> in a title. Doesn't handle tags with > in an
// attribute value, or comments
const tagPattern = /<[^>]*>/g

/** The text of inline markup: its tags stripped and its character references decoded. */
export const plainTextOf = (html: string): string =>
  decodeCharacterReferences(html.replace(tagPattern, ""))

/** An element's start tag, found in markup. */
export interface StartTag {
  /** By lowercase name, with character references in the values decoded. */
  readonly attributes: ReadonlyMap<string, string>
  /** Where the tag begins in the markup. */
  readonly start: number
  /** Where the element's content begins, just past the tag. */
  readonly end: number
}

const attributeSource = String.raw`([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+)))?`
const attributePattern = new RegExp(attributeSource, "g")

const attributesOf = (source: string): ReadonlyMap<string, string> =>
  new Map(
    [...source.matchAll(attributePattern)].map(([, name = "", double, single, bare]) => [
      name.toLowerCase(),
      decodeCharacterReferences(double ?? single ?? bare ?? ""),
    ]),
  )

/**
 * Every start tag of the elements named `name` (such as `li`, in any case), in their order in
 * `html`. A `>` inside a quoted attribute value doesn't end a tag.
 */
export const startTagsOf = (html: string, name: string): ReadonlyArray<StartTag> =>
  [...html.matchAll(new RegExp(String.raw`<${name}((?:\s+${attributeSource})*)\s*/?>`, "gi"))].map(
    (match) => ({
      attributes: attributesOf(match[1] ?? ""),
      start: match.index,
      end: match.index + match[0].length,
    }),
  )

export const hasClass = (tag: StartTag, className: string): boolean =>
  (tag.attributes.get("class") ?? "").split(/\s+/).includes(className)

/**
 * The markup inside the element that `tag` starts in `html`, up to the element's end tag. Elements
 * of the same name nested in it are kept whole. Without an end tag, it runs to the end of `html`.
 *
 * @param name - The element's name, as given to {@link startTagsOf}.
 */
export const contentOf = (html: string, tag: StartTag, name: string): string => {
  const following = html.slice(tag.end)
  let depth = 1
  for (const boundary of following.matchAll(new RegExp(String.raw`<(/?)${name}(?=[\s/>])`, "gi"))) {
    depth += boundary[1] === "/" ? -1 : 1
    if (depth === 0) return following.slice(0, boundary.index)
  }
  return following
}
