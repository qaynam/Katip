import type { SpaceTheme } from "#modules/theme"
import type { SpotlightOutcome, SpotlightResult } from "#protocol"

export interface SearchResponse {
  /** 上から表示する順。 */
  readonly results: ReadonlyArray<SpotlightResult>
  /** 開いたウィンドウの今の Space のテーマ。 */
  readonly spaceTheme: SpaceTheme | null
}

export interface SpotlightConnection {
  /**
   * reject しない。background に届かなかった、または応答の前に接続が切れたときは null で解決する。
   * 問い合わせは並行してよく、どの応答が最新の入力のものかは呼び出し側が判断する。
   */
  readonly search: (query: string) => Promise<SearchResponse | null>
  /** reject しない。結果が分からないときも Failed で解決する。 */
  readonly choose: (result: SpotlightResult) => Promise<SpotlightOutcome>
}
