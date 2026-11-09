/**
 * A bang as Katip ships it: the site's name, its triggers (lowercase, the shortest first), its URL
 * with `%s` where the search terms go, and Kagi's format flags when the bang sets any.
 */
export type BangDataEntry =
  | readonly [name: string, triggers: ReadonlyArray<string>, template: string]
  | readonly [name: string, triggers: ReadonlyArray<string>, template: string, flags: number]

export interface BangData {
  readonly entries: ReadonlyArray<BangDataEntry>
  /** The license the list is distributed under, with its copyright lines. */
  readonly license: string
}

const HELIUM_PLACEHOLDER = "{searchTerms}"

interface HeliumBang {
  readonly s: unknown
  readonly ts: unknown
  readonly u: unknown
  readonly f?: unknown
}

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const entryOf = (bang: HeliumBang): BangDataEntry => {
  const { s: name, ts: triggers, u: url, f: flags } = bang
  if (typeof name !== "string" || !isStringArray(triggers) || triggers.length === 0) {
    throw new Error(`Malformed bang: ${JSON.stringify(bang)}`)
  }
  if (typeof url !== "string" || !/^https?:\/\//.test(url) || !url.includes(HELIUM_PLACEHOLDER)) {
    throw new Error(`Malformed URL for !${triggers[0]}: ${String(url)}`)
  }
  // Katip's own commands mark the search terms with %s, so a literal %s would be taken for them
  if (url.includes("%s")) throw new Error(`!${triggers[0]} has a literal %s: ${url}`)
  const template = url.replaceAll(HELIUM_PLACEHOLDER, "%s")
  if (flags === undefined) return [name, triggers, template]
  if (typeof flags !== "number" || !Number.isInteger(flags)) {
    throw new Error(`Malformed flags for !${triggers[0]}: ${String(flags)}`)
  }
  return [name, triggers, template, flags]
}

/**
 * Reads Helium's list of bangs, which is JSON with a license in `//` comments above it and trailing
 * commas.
 *
 * @throws Error when the list has no license or an entry Katip can't use.
 */
export const bangDataOf = (heliumList: string): BangData => {
  const lines = heliumList.split("\n")
  const commentLines = lines.filter((line) => line.startsWith("//"))
  const comments = commentLines.map((line) => line.replace(/^\/\/ ?/, ""))
  const licenseStart = comments.findIndex((line) => /license/i.test(line))
  if (licenseStart === -1) throw new Error("The list of bangs carries no license")
  const json = lines
    .filter((line) => !line.startsWith("//"))
    .join("\n")
    .replace(/,(\s*[\]}])/g, "$1")
  const bangs: unknown = JSON.parse(json)
  if (!Array.isArray(bangs)) throw new Error("The list of bangs isn't an array")
  return {
    entries: bangs.map((bang: HeliumBang) => entryOf(bang)),
    license: `${comments.slice(licenseStart).join("\n").trim()}\n`,
  }
}

/** The entries as the bundled JSON file holds them, one per line so that updates diff well. */
export const serializedBangData = (entries: ReadonlyArray<BangDataEntry>): string =>
  `[\n${entries.map((entry) => JSON.stringify(entry)).join(",\n")}\n]\n`
