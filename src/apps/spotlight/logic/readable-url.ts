import { Option } from "effect"

/** 一覧に出す URL。http(s) の scheme、先頭の www.、末尾の / を除く。 */
export const readableUrl = (url: string): string =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")

export const hostOf = (url: string): Option.Option<string> =>
  URL.canParse(url)
    ? Option.filter(Option.some(new URL(url).hostname), (host) => host !== "")
    : Option.none()
