import { Option } from "effect"

export interface UrlInput {
  readonly url: string
  /** 入力に scheme が書かれていて、URL を開くつもりだとはっきりしている。 */
  readonly hasScheme: boolean
}

// ページを開く scheme だけを受け付ける。javascript: などを開けると、入力を貼り付けただけで
// スクリプトが動いてしまう
const openableScheme = /^(https?|file|ftp|chrome|chrome-extension|about|view-source):/i

// localhost、IPv4 アドレス、末尾が 2 文字以上の英字のドメイン名だけを対象とする。
// IPv6 アドレスや、ドットを含まない社内向けのホスト名は scheme を書いたときだけ開く
const localHost = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i
const domainName = /^([\p{L}\p{N}-]+\.)+\p{L}{2,}(:\d+)?([/?#].*)?$/u

const parseable = (url: string): Option.Option<string> =>
  URL.canParse(url) ? Option.some(url) : Option.none()

/** 入力が URL として開けそうなら、開く URL を返す。 */
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
