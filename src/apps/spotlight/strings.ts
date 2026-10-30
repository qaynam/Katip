import type { SpotlightResult } from "#protocol"

export const strings = {
  windowTitle: "Spotlight",
  searchLabel: "タブ・ピン・Space・ブックマークを検索",
  placeholder: "検索するか URL を入力",
  resultsLabel: "候補",
  loading: "読み込み中…",
  noRecentTabs: "最近使ったタブはありません",
  noMatches: "一致するタブ・ピン・ブックマークはありません",
  unreachable: "Katip に接続できませんでした。もう一度お試しください",
  kind: {
    OpenTab: "タブ",
    Pin: "ピン",
    Space: "Space",
    Bookmark: "ブックマーク",
    OpenUrl: "開く",
    SearchWeb: "ウェブで検索",
  } satisfies Record<SpotlightResult["_tag"], string>,
  favorites: "Favorites",
  outsideSpaces: "Space に属さないタブ",
  otherWindow: "別のウィンドウ",
  currentSpace: "現在の Space",
  switchSpace: "この Space に切り替える",
  splitView: "分割ビュー",
  openInNewTab: "新しいタブで開く",
  searchWithDefaultEngine: "既定の検索エンジンで検索",
  hints: { select: "選択", open: "開く", close: "閉じる" },
} as const
