import type { SpaceTheme } from "#modules/theme"
import type { SpotlightMode, SpotlightOutcome, SpotlightResult } from "#protocol"

export interface SearchResponse {
  /** In display order, top first. */
  readonly results: ReadonlyArray<SpotlightResult>
  /** The theme of the current Space in the window that opened Spotlight. */
  readonly spaceTheme: SpaceTheme | null
}

export interface SpotlightConnection {
  /**
   * Never rejects. Resolves to null when the search didn't reach the background, or the connection
   * closed before the response. Searches may overlap; the caller decides which response belongs to
   * the latest input.
   */
  readonly search: (query: string, mode: SpotlightMode) => Promise<SearchResponse | null>
  /**
   * Never rejects. Resolves to null when the choice didn't reach the background, or the connection
   * closed before the outcome, leaving unknown whether it opened.
   */
  readonly choose: (result: SpotlightResult) => Promise<SpotlightOutcome | null>
}
