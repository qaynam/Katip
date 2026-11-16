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
