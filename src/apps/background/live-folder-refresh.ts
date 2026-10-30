import { Clock, Effect, Option } from "effect"
import { isRefreshDue, LiveFolders, type LiveSource } from "#modules/live-folders"
import { LiveFolderStore, liveFoldersIn, PinnedBookmarks } from "#modules/pinned"
import { Alarms } from "#platform/browser"
import { KatipState } from "./katip-state"

export const LIVE_FOLDER_REFRESH_ALARM = "katip/live-folders/refresh"

const REFRESH_PERIOD_MINUTES = 5

// サイドパネルはウィンドウごとに開き直されるので、開くたびに取得すると問い合わせが重なる
const MIN_REFRESH_INTERVAL_MS = 60_000

/**
 * ライブフォルダがあれば定期的な取得を予約し、無ければ予約を消す。
 *
 * ライブフォルダを使わない人の service worker を、取得のためだけに起こさないため。
 */
export const scheduleLiveFolderRefresh = Effect.gen(function* () {
  const alarms = yield* Alarms
  const marked = yield* (yield* LiveFolderStore).load
  if (marked.size === 0) {
    yield* alarms.clear(LIVE_FOLDER_REFRESH_ALARM)
    return
  }
  // 同じ周期のアラームを作り直すと次の発火が先送りされる。service worker は頻繁に
  // 起き直すので、起動のたびに作り直すと一度も発火しないことがある
  const current = (yield* alarms.getAll).find((alarm) => alarm.name === LIVE_FOLDER_REFRESH_ALARM)
  if (current !== undefined && Option.contains(current.periodInMinutes, REFRESH_PERIOD_MINUTES)) {
    return
  }
  yield* alarms.create(LIVE_FOLDER_REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MINUTES })
})

const pinnedLiveFolders = Effect.gen(function* () {
  const trees = yield* (yield* PinnedBookmarks).loadAllSpaceTrees
  return { trees, liveFolders: [...trees.values()].flatMap(liveFoldersIn) }
})

/**
 * 前回の取得から間が空いたライブフォルダの取得を始める。取得が終わるのは待たない。
 *
 * すべての Space のピン留めを読めたときは、どこにも無くなったライブフォルダのキャッシュを捨てる。
 * 読めない Space があるときに捨てると、その Space にあるライブフォルダの中身まで失うため捨てない。
 */
export const refreshDueLiveFolders = Effect.gen(function* () {
  const liveFolders = yield* LiveFolders
  const { trees, liveFolders: present } = yield* pinnedLiveFolders
  const { records } = yield* liveFolders.snapshot
  const now = yield* Clock.currentTimeMillis
  const due = present.filter((live) =>
    isRefreshDue(Option.fromNullishOr(records.get(live.id)), now, MIN_REFRESH_INTERVAL_MS),
  )
  yield* Effect.forEach(due, (live) => liveFolders.refresh(live.id, live.source), {
    discard: true,
  })
  const spaces = yield* (yield* KatipState).spaces.get
  if (spaces.every((space) => trees.has(space.id))) {
    yield* liveFolders.retainOnly(new Set(present.map((live) => live.id)))
  }
})

/** 取得元が条件に合うライブフォルダの取得を、前回の取得からの間隔によらず始める。 */
export const refreshLiveFoldersWhere = (matches: (source: LiveSource) => boolean) =>
  Effect.gen(function* () {
    const liveFolders = yield* LiveFolders
    const { liveFolders: present } = yield* pinnedLiveFolders
    yield* Effect.forEach(
      present.filter((live) => matches(live.source)),
      (live) => liveFolders.refresh(live.id, live.source),
      { discard: true },
    )
  })
