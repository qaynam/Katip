import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import { neutralTheme, themeOf, type SpaceTheme, type ThemeColor } from "#modules/theme"
import type { PinnedLiveFolderView, SidebarView } from "#protocol"
import { SplitViewId } from "#platform/browser"
import { withRecomputedPeeks } from "./fixture-peeks"
import {
  archiveEntry,
  favoriteView,
  liveItem,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  pinnedLiveFolder,
  pinnedSplit,
  sidebarView,
  spaceView,
  tabView,
  temporarySplit,
  temporaryTab,
} from "../sidepanel/testing/view-builders"

const MINUTE_MS = 60_000

const color = (hue: number, chroma: number): ThemeColor => ({ hue, chroma })

const themed = (
  colors: ReadonlyArray<ThemeColor>,
  overrides: Partial<Omit<SpaceTheme, "colors">> = {},
): SpaceTheme => ({ ...themeOf(colors), ...overrides })

const minutesOct21 = pinnedItem("minutes-1021", {
  title: "10/21 定例",
  url: "https://docs.example.com/minutes/1021",
  openTab: openPinnedTab(
    tabView(21, {
      title: "10/21 定例 - ドキュメント",
      url: "https://docs.example.com/minutes/1021",
    }),
  ),
})

const mail = (
  id: string,
  title: string,
  from: string,
  updatedAt: number,
  options: { readonly isUnseen?: boolean; readonly accountIndex?: number } = {},
) =>
  liveItem(id, {
    title,
    subtitle: from,
    url: `https://mail.google.com/mail/u/${options.accountIndex ?? 0}/#inbox/${id}`,
    updatedAt,
    isUnseen: options.isUnseen ?? false,
  })

const pullRequest = (
  number: number,
  title: string,
  repository: string,
  updatedAt: number,
  options: { readonly isUnseen?: boolean } = {},
) =>
  liveItem(`${repository}#${number}`, {
    title,
    subtitle: `${repository} #${number}`,
    url: `https://github.com/${repository}/pull/${number}`,
    updatedAt,
    isUnseen: options.isUnseen ?? false,
  })

const workInbox = (now: number): PinnedLiveFolderView =>
  pinnedLiveFolder("live-inbox", {
    title: "受信トレイ",
    source: { _tag: "Gmail", accountIndex: 0, label: null },
    status: { _tag: "Ready", refreshedAt: now - 2 * MINUTE_MS },
    items: [
      mail("m1", "来週の設計レビューの日程", "佐藤 花子", now - 8 * MINUTE_MS, { isUnseen: true }),
      mail("m2", "見積もりの件（再送）", "山田 太郎", now - 47 * MINUTE_MS, { isUnseen: true }),
      mail("m3", "社内勉強会のお知らせ", "総務部", now - 3 * 60 * MINUTE_MS, { isUnseen: true }),
      mail("m4", "10 月分の経費精算について", "経理部", now - 26 * 60 * MINUTE_MS),
    ],
  })

const reviewRequests = (now: number): PinnedLiveFolderView =>
  pinnedLiveFolder("live-reviews", {
    title: "レビュー依頼",
    source: { _tag: "GitHub", query: "review-requested" },
    isExpanded: false,
    sort: "source",
    status: { _tag: "Ready", refreshedAt: now - 5 * MINUTE_MS },
    items: [
      pullRequest(
        214,
        "ライブフォルダの取得を定期実行にする",
        "katip/katip",
        now - 20 * MINUTE_MS,
        {
          isUnseen: true,
        },
      ),
      pullRequest(209, "Spotlight の候補に Space を出す", "katip/katip", now - 2 * 60 * MINUTE_MS, {
        isUnseen: true,
      }),
      pullRequest(77, "README の誤字を直す", "katip/website", now - 4 * 24 * 60 * MINUTE_MS),
    ],
  })

const mentions: PinnedLiveFolderView = pinnedLiveFolder("live-mentions", {
  title: "メンション",
  source: { _tag: "GitHub", query: "mentioned" },
  status: { _tag: "Refreshing" },
})

const myPullRequests: PinnedLiveFolderView = pinnedLiveFolder("live-my-prs", {
  title: "自分の PR",
  source: { _tag: "GitHub", query: "authored-pull-requests" },
  status: {
    _tag: "Failed",
    reason: "このブラウザで GitHub にログインしていません。",
    needsPermission: false,
    needsToken: false,
    signInUrl: "https://github.com/login",
  },
})

const teamInbox: PinnedLiveFolderView = pinnedLiveFolder("live-team-inbox", {
  title: "チームの受信トレイ",
  source: { _tag: "Gmail", accountIndex: 2, label: null },
  isExpanded: false,
  status: {
    _tag: "Failed",
    reason: "このブラウザで 3 番目の Google アカウント（u/2）にログインしていません。",
    needsPermission: false,
    needsToken: false,
    signInUrl:
      "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F2%2F",
  },
})

const newsletters: PinnedLiveFolderView = pinnedLiveFolder("live-newsletters", {
  title: "ニュースレター",
  source: { _tag: "Gmail", accountIndex: 1, label: "ニュースレター" },
  status: {
    _tag: "Failed",
    reason: "mail.google.com へのアクセスが許可されていません。",
    needsPermission: true,
    needsToken: false,
    signInUrl: null,
  },
})

interface PageSeed {
  readonly title: string
  readonly url: string
}

/** 分割ビューのピン。`opened` が null なら両方とも閉じている */
const splitPin = (
  id: string,
  [left, right]: readonly [PageSeed, PageSeed],
  opened: { readonly firstTabId: number; readonly splitViewId: number } | null,
) => {
  const side = ({ title, url }: PageSeed, offset: number) =>
    pinnedItem(`${id}-${offset}`, {
      title,
      url,
      openTab:
        opened === null
          ? null
          : openPinnedTab(
              tabView(opened.firstTabId + offset, {
                title,
                url,
                splitViewId: SplitViewId.make(opened.splitViewId),
              }),
            ),
    })
  return pinnedSplit(id, [side(left, 0), side(right, 1)])
}

const comparisons = pinnedFolder("comparisons", {
  title: "見比べ",
  isExpanded: false,
  children: [
    splitPin(
      "compare-spec",
      [
        { title: "仕様書", url: "https://docs.example.com/spec/ja" },
        { title: "Spec", url: "https://docs.example.com/spec/en" },
      ],
      { firstTabId: 81, splitViewId: 5 },
    ),
    splitPin(
      "compare-design",
      [
        { title: "デザイン案 A", url: "https://design.example.com/a" },
        { title: "デザイン案 B", url: "https://design.example.com/b" },
      ],
      { firstTabId: 83, splitViewId: 6 },
    ),
    splitPin(
      "compare-closed",
      [
        { title: "旧版", url: "https://docs.example.com/v1" },
        { title: "新版", url: "https://docs.example.com/v2" },
      ],
      null,
    ),
  ],
})

const workSpace = (now: number) =>
  spaceView("work", {
    name: SpaceName.make("仕事"),
    theme: themed([color(295, 0.55), color(255, 0.5)], { mode: "dark", intensity: 0.6 }),
    pinnedNodes: [
      pinnedFolder("design-docs", {
        title: "設計資料",
        isExpanded: true,
        children: [
          pinnedItem("api-spec", {
            title: "API 設計書",
            url: "https://docs.example.com/api-spec",
            openTab: openPinnedTab(
              tabView(11, { title: "API 設計書 v3", url: "https://docs.example.com/api-spec" }),
            ),
          }),
          pinnedItem("screen-flow", {
            title: "画面遷移図",
            url: "https://design.example.com/screen-flow",
          }),
          pinnedSplit("spec-compare", [
            pinnedItem("spec-ja", { title: "仕様書", url: "https://docs.example.com/spec/ja" }),
            pinnedItem("spec-en", { title: "Spec", url: "https://docs.example.com/spec/en" }),
          ]),
          pinnedFolder("minutes", {
            title: "議事録",
            isExpanded: false,
            canCreateSubfolder: false,
            children: [
              pinnedItem("minutes-1028", {
                title: "10/28 定例",
                url: "https://docs.example.com/minutes/1028",
              }),
              minutesOct21,
            ],
          }),
          myPullRequests,
        ],
      }),
      comparisons,
      workInbox(now),
      reviewRequests(now),
      mentions,
      teamInbox,
      pinnedItem("tracker", {
        title: "Issue トラッカー",
        url: "https://tracker.example.com/board",
        openTab: openPinnedTab(
          tabView(12, {
            title: "#482 ドラッグ中に挿入線がちらつく",
            url: "https://tracker.example.com/issues/482",
          }),
          { hasNavigatedAway: true },
        ),
      }),
      pinnedItem("calendar", {
        title: "チームの予定表",
        url: "https://calendar.example.com/team",
      }),
      pinnedSplit("review", [
        pinnedItem("review-diff", {
          title: "PR #128",
          url: "https://git.example.com/katip/pull/128",
          openTab: openPinnedTab(
            tabView(13, {
              title: "分割ビューの行を追加 #128",
              url: "https://git.example.com/katip/pull/128",
              splitViewId: SplitViewId.make(2),
            }),
          ),
        }),
        pinnedItem("review-preview", {
          title: "プレビュー",
          url: "https://preview.example.com/",
          openTab: openPinnedTab(
            tabView(14, {
              title: "Katip プレビュー",
              url: "https://preview.example.com/",
              splitViewId: SplitViewId.make(2),
            }),
          ),
        }),
      ]),
      pinnedFolder("empty-folder", { title: "あとで読む", isExpanded: true }),
    ],
    temporaryEntries: [
      temporarySplit(
        1,
        tabView(36, { title: "r/sveltejs", url: "https://www.reddit.com/r/sveltejs/" }),
        tabView(37, { title: "Google", url: "https://www.google.com/", isActive: true }),
      ),
      ...[
        tabView(31, {
          title: "Runes • Svelte のドキュメント",
          url: "https://svelte.dev/docs/svelte/what-are-runes",
        }),
        tabView(32, {
          title: "HTML Drag and Drop API - Web API | MDN",
          url: "https://developer.mozilla.org/ja/docs/Web/API/HTML_Drag_and_Drop_API",
        }),
        tabView(33, {
          title: "Effect 4.0 リリースノート",
          url: "https://effect.website/blog/releases/effect/40",
          isLoading: true,
        }),
        tabView(34, {
          title: "作業用 BGM",
          url: "https://music.example.com/focus",
          isAudible: true,
        }),
        tabView(35, {
          title: "chrome.sidePanel | API | Chrome for Developers",
          url: "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
          isDiscarded: true,
        }),
      ].map(temporaryTab),
    ],
  })

const hobby = spaceView("hobby", {
  name: SpaceName.make("趣味"),
  theme: themed([color(90, 0.8)], { mode: "light" }),
  pinnedNodes: [
    pinnedItem("recipes", { title: "料理レシピ", url: "https://recipes.example.com/saved" }),
    newsletters,
  ],
  temporaryEntries: [
    temporarySplit(
      3,
      tabView(43, { title: "Reddit", url: "https://www.reddit.com/" }),
      tabView(44, { title: "Google", url: "https://www.google.com/", isActive: true }),
    ),
    temporaryTab(
      tabView(41, {
        title: "週末に行けるキャンプ場",
        url: "https://camp.example.com/search?area=kanto",
      }),
    ),
    temporaryTab(
      tabView(42, { title: "フィルムカメラの選び方", url: "https://camera.example.com/film" }),
    ),
  ],
})

const reading = spaceView("reading", {
  name: SpaceName.make("読書"),
  theme: themed([color(350, 0.55)], { mode: "light", grain: 0.35 }),
  pinnedNodes: [
    pinnedItem("novel", { title: "連載小説の目次", url: "https://novel.example.com/toc" }),
  ],
  temporaryTabs: [
    tabView(61, { title: "今月の新刊", url: "https://books.example.com/new", isActive: true }),
  ],
})

const travel = spaceView("travel", {
  name: SpaceName.make("旅行"),
  theme: themed([color(90, 0.8), color(25, 0.8), color(140, 0.7)]),
  temporaryTabs: [
    tabView(71, {
      title: "金沢 2 泊 3 日のモデルコース",
      url: "https://trip.example.com/kanazawa",
    }),
  ],
})

const notes = spaceView("notes", { name: SpaceName.make("メモ"), theme: neutralTheme })

const household = spaceView("household", {
  name: SpaceName.make("家計"),
  theme: themed([color(200, 0.6)], { mode: "dark" }),
  pinned: { _tag: "Unavailable" },
  temporaryTabs: [tabView(51, { title: "ネットバンキング", url: "https://bank.example.com/" })],
})

export const fixtureView = (now: number): SidebarView => {
  const work = workSpace(now)
  const view = sidebarView({
    spaces: [work, hobby, reading, travel, household, notes],
    activeSpaceId: work.id,
    favorites: [
      favoriteView(1, { title: "メール", url: "https://mail.example.com/inbox" }),
      favoriteView(2, { title: "カレンダー", url: "https://calendar.example.com/" }),
      favoriteView(3, { title: "チャット", url: "https://chat.example.com/" }),
      favoriteView(4, { title: "GitHub", url: "https://github.com/" }),
      favoriteView(5, { title: "翻訳", url: "https://translate.example.com/" }),
    ],
    archive: [
      archiveEntry("a1", {
        title: "Vite の設定リファレンス",
        url: "https://vite.dev/config/",
        spaceId: work.id,
        archivedAt: now - 5 * MINUTE_MS,
      }),
      archiveEntry("a2", {
        title: "テント比較 2026",
        url: "https://camp.example.com/tents",
        spaceId: hobby.id,
        archivedAt: now - 3 * 60 * MINUTE_MS,
      }),
      archiveEntry("a3", {
        title: "TypeScript 6.0 の変更点",
        url: "https://devblogs.microsoft.com/typescript/",
        spaceId: work.id,
        archivedAt: now - 2 * 24 * 60 * MINUTE_MS,
      }),
      archiveEntry("a4", {
        title: "削除済み Space のページ",
        url: "https://example.com/orphan",
        spaceId: SpaceId.make("deleted-space"),
        archivedAt: now - 10 * 24 * 60 * MINUTE_MS,
      }),
    ],
    autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(360) },
  })
  return withRecomputedPeeks(view)
}
