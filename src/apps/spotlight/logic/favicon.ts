import { Option, Predicate } from "effect"
import { hostOf } from "./readable-url"

/** ページ URL から favicon 画像の URL を作る。作れない環境では null を返す。 */
export type FaviconResolver = (pageUrl: string) => string | null

// タブが持つ favicon を優先する。未読数などで動的に変わるものを、キャッシュより新しく出せるため。
// 閉じたピンやブックマークにはタブが無いので、ページ URL からの解決だけが頼りになる
export const faviconCandidates = (
  pageUrl: string,
  favIconUrl: string | null,
  resolve: FaviconResolver,
): ReadonlyArray<string> => {
  const candidates = [favIconUrl, pageUrl === "" ? null : resolve(pageUrl)]
  return [...new Set(candidates.filter(Predicate.isNotNull).filter((url) => url !== ""))]
}

/** favicon を出せないときに代わりに出す 1 文字。 */
export const faviconLetter = (pageUrl: string, title: string): string => {
  const source = Option.getOrElse(hostOf(pageUrl), () => title).replace(/^www\./, "")
  return source.trim().charAt(0).toUpperCase() || "・"
}
