import { Option } from "effect"

export interface UrlInput {
  readonly url: string
  /** The input spells out a scheme, so it is clearly meant to be opened as a URL. */
  readonly hasScheme: boolean
}

// Only schemes that open a page. Opening javascript: and the like would run a script just because
// it was pasted in
const openableScheme = /^(https?|file|ftp|chrome|chrome-extension|about|view-source):/i

// Only localhost, IPv4 addresses and domain names ending in a label of two or more letters.
// IPv6 addresses and dotless intranet host names open only when the scheme is spelled out
const localHost = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i
const domainName = /^([\p{L}\p{N}-]+\.)+\p{L}{2,}(:\d+)?([/?#].*)?$/u

const parseable = (url: string): Option.Option<string> =>
  URL.canParse(url) ? Option.some(url) : Option.none()

/** The URL to open when the input looks like one, or none when it doesn't. */
export const urlFromInput = (input: string): Option.Option<UrlInput> => {
  const trimmed = input.trim()
  if (trimmed === "" || /\s/.test(trimmed)) return Option.none()
  if (openableScheme.test(trimmed)) {
    return Option.map(parseable(trimmed), (url) => ({ url, hasScheme: true }))
  }
  const withScheme = localHost.test(trimmed)
    ? Option.some(`http://${trimmed}`)
    : domainName.test(trimmed)
      ? Option.some(`https://${trimmed}`)
      : Option.none<string>()
  return withScheme.pipe(
    Option.flatMap(parseable),
    Option.map((url) => ({ url, hasScheme: false })),
  )
}
