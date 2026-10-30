import { Array, Number, Option } from "effect"
import type { SpaceId } from "#modules/space"

export interface AutoArchiveTab {
  /** None はどの Space にも属さないタブ。 */
  readonly spaceId: Option.Option<SpaceId>
  readonly isActive: boolean
  readonly isAudible: boolean
  readonly isChromePinned: boolean
  readonly isBoundToPin: boolean
  /**
   * 最後にアクティブになった時刻（エポックミリ秒）。まだ一度もアクティブになっていないタブは、
   * 作成時刻かブラウザの起動時刻で埋めてから渡す。
   */
  readonly lastActiveAt: number
}

export interface AutoArchiveTarget<T extends AutoArchiveTab> {
  readonly tab: T
  readonly spaceId: SpaceId
}

export interface AutoArchiveCriteria {
  /** エポックミリ秒。 */
  readonly now: number
  readonly idleMinutes: number
}

// URL がピンと一致するかでは保護しない。ピンと同じページを一時タブで開いただけで、
// そのタブまでアーカイブされなくなるため
const isProtected = (tab: AutoArchiveTab) =>
  tab.isActive || tab.isAudible || tab.isChromePinned || tab.isBoundToPin

const hasBeenIdleLongerThanThreshold = (tab: AutoArchiveTab, criteria: AutoArchiveCriteria) =>
  criteria.now - tab.lastActiveAt > criteria.idleMinutes * 60_000

const toTarget = <T extends AutoArchiveTab>(
  tab: T,
  criteria: AutoArchiveCriteria,
): Option.Option<AutoArchiveTarget<T>> =>
  isProtected(tab) || !hasBeenIdleLongerThanThreshold(tab, criteria)
    ? Option.none()
    : Option.map(tab.spaceId, (spaceId) => ({ tab, spaceId }))

/**
 * 自動アーカイブで閉じるべきタブを、入力の順序のまま返す。
 *
 * 対象は Space に属する一時タブのうち、保護されておらず、最後にアクティブになってから
 * 閾値を超えて経過したもの。
 */
export const selectAutoArchiveTargets = <T extends AutoArchiveTab>(
  tabs: ReadonlyArray<T>,
  criteria: AutoArchiveCriteria,
): ReadonlyArray<AutoArchiveTarget<T>> => Array.getSomes(tabs.map((tab) => toTarget(tab, criteria)))

// アーカイブが閾値から遅れる時間は最大で確認間隔 1 回分になる。閾値に比例させるだけだと
// 長い閾値で遅れが何時間にも伸び、固定の短い間隔だと長い閾値のあいだ service worker を
// 無駄に起こし続けるため、比例させたうえで上下を切る。
// 下限は Chrome が許す 30 秒ではなく 1 分にする。分単位の設定に対して 30 秒は細かすぎる
const CHECKS_PER_THRESHOLD = 4
const SHORTEST_CHECK_INTERVAL_MINUTES = 1
const LONGEST_CHECK_INTERVAL_MINUTES = 15

export const autoArchiveCheckIntervalMinutes = (idleMinutes: number): number =>
  Number.clamp(idleMinutes / CHECKS_PER_THRESHOLD, {
    minimum: SHORTEST_CHECK_INTERVAL_MINUTES,
    maximum: LONGEST_CHECK_INTERVAL_MINUTES,
  })
