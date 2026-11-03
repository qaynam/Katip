import { Option } from "effect"

/** The URL as listed, without the http(s) scheme, a leading www. or a trailing /. */
export const readableUrl = (url: string): string =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")

export const hostOf = (url: string): Option.Option<string> =>
  URL.canParse(url)
    ? Option.filter(Option.some(new URL(url).hostname), (host) => host !== "")
    : Option.none()
