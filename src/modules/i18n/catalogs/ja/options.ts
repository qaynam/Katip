import type { CatalogSection } from "../../catalog"

export const options: CatalogSection<"options"> = {
  "options.documentTitle": "Katip の設定",
  "options.title": "設定",
  "options.loadFailed": "設定を読み込めませんでした。ページを再読み込みしてください。",
  "options.saved": "保存しました",
  "options.saveFailed": "保存できませんでした。少し待ってから、もう一度変更してください。",

  "options.language.label": "言語",
  "options.language.automatic": "自動（{language}）",
  "options.language.footnote": "自動にすると、ブラウザの言語に合わせます。",

  "options.tabs.heading": "タブ",
  "options.newTabsOnTop.label": "新しいタブを一番上に表示",
  "options.newTabsOnTop.description":
    "オフにすると、一時タブは Chrome のタブバーと同じ順に並び、新しいタブは一番下に追加されます。",
  "options.collapsedFolders.label": "閉じたフォルダでも開いているタブをすべて表示",
  "options.collapsedFolders.description":
    "オフにすると、閉じたフォルダの下にはアクティブなタブと、フォルダを閉じている間に表示したタブだけが並びます。",
  "options.syncTabGroups.label": "Space を Chrome のタブグループと同期",
  "options.syncTabGroups.description":
    "ウィンドウごとに Space をタブグループとして表示します。グループ側で名前や色を変えても Space には反映されず、次の同期で元に戻ります。同期中はフォルダの中にフォルダを作れません。",
  "options.splitView.label": "分割ビュー",
  "options.splitView.available": "使えます",
  "options.splitView.unavailable": "このブラウザでは使えません（Chrome 155 以降が必要）",

  "options.autoArchive.heading": "アーカイブ",
  "options.autoArchive.label": "使っていないタブを自動でアーカイブ",
  "options.autoArchive.idleTime.label": "アーカイブするまでの時間",
  "options.autoArchive.footnote":
    "最後に表示してからこの時間が過ぎた一時タブを閉じて、アーカイブに記録します。アーカイブからはあとで開き直せます。ピン留め・Favorites・音声を再生中・表示中のタブは閉じません。",

  "options.shortcuts.label": "キーボードショートカット",
  "options.shortcuts.open": "Chrome で変更",
  "options.shortcuts.openFailed": "Chrome のショートカット設定を開けませんでした。",
  "options.shortcuts.footnote":
    "サイドパネルや Spotlight を開くキーなどは、Chrome の拡張機能のショートカット設定で割り当てます。",

  "options.pageShortcuts.heading": "ショートカット",
  "options.pageShortcuts.footnote":
    "Web ページを見ている間に使えます。オンにすると、すべてのサイトへのアクセスの許可を求めます（キーを受け取るためだけに使います）。chrome:// のページ、新しいタブ、Chrome ウェブストアでは使えません。",
  "options.pageShortcuts.denied":
    "すべてのサイトへのアクセスが許可されなかったため、オフのままにしました",

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "閲覧履歴も検索する",
  "options.spotlight.history.footnote":
    "オンにすると、閲覧履歴を読む許可を求めます。オフにすると、その許可を外します。",
  "options.spotlight.history.denied": "閲覧履歴へのアクセスが許可されませんでした",

  "options.data.heading": "データ",
  "options.data.export.label": "データを書き出す",
  "options.data.export.button": "書き出す",
  "options.data.export.footnote":
    "Space・ピン留め・開いているタブ・Favorites・設定を JSON ファイルに保存します。GitHub のトークンとアーカイブは含みません。",
  "options.data.exported": "書き出しました",
  "options.data.exportFailed": "書き出せませんでした。少し待ってから、もう一度お試しください。",

  "options.version.label": "バージョン",
}
