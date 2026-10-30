import { IdleMinutes } from "#modules/settings"
import { SpaceId, SpaceName } from "#modules/space"
import type { SidebarView } from "#protocol"
import {
  archiveEntry,
  favoriteView,
  openPinnedTab,
  pinnedFolder,
  pinnedItem,
  sidebarView,
  spaceView,
  tabView,
} from "../sidepanel/testing/view-builders"

const MINUTE_MS = 60_000

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

const work = spaceView("work", {
  name: SpaceName.make("仕事"),
  color: "blue",
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
          peekedItems: [minutesOct21],
        }),
      ],
    }),
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
    pinnedFolder("empty-folder", { title: "あとで読む", isExpanded: true }),
  ],
  temporaryTabs: [
    tabView(31, {
      title: "Runes • Svelte のドキュメント",
      url: "https://svelte.dev/docs/svelte/what-are-runes",
      isActive: true,
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
    tabView(34, { title: "作業用 BGM", url: "https://music.example.com/focus", isAudible: true }),
    tabView(35, {
      title: "chrome.sidePanel | API | Chrome for Developers",
      url: "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
      isDiscarded: true,
    }),
  ],
})

const hobby = spaceView("hobby", {
  name: SpaceName.make("趣味"),
  color: "orange",
  pinnedNodes: [
    pinnedItem("recipes", { title: "料理レシピ", url: "https://recipes.example.com/saved" }),
  ],
  temporaryTabs: [
    tabView(41, {
      title: "週末に行けるキャンプ場",
      url: "https://camp.example.com/search?area=kanto",
    }),
    tabView(42, { title: "フィルムカメラの選び方", url: "https://camera.example.com/film" }),
  ],
})

const reading = spaceView("reading", { name: SpaceName.make("読書"), color: "green" })

const household = spaceView("household", {
  name: SpaceName.make("家計"),
  color: "purple",
  pinned: { _tag: "Unavailable" },
  temporaryTabs: [tabView(51, { title: "ネットバンキング", url: "https://bank.example.com/" })],
})

export const fixtureView = (now: number): SidebarView =>
  sidebarView({
    spaces: [work, hobby, reading, household],
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
