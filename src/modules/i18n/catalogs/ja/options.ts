import type { CatalogSection } from "../../catalog"

export const options: CatalogSection<"options"> = {
  "options.documentTitle": "Katip の設定",
  "options.title": "設定",
  "options.loadFailed": "設定を読み込めませんでした。ページを再読み込みしてください。",
  "options.saved": "保存しました",
  "options.saveFailed": "保存できませんでした。少し待ってから、もう一度変更してください。",

  "options.general.heading": "一般",
  "options.language.label": "言語",
  "options.language.automatic": "自動（{language}）",
  "options.language.footnote": "自動にすると、ブラウザの言語に合わせます。",
  "options.about.heading": "Katip について",
  "options.version.label": "バージョン",
  "options.sourceCode.label": "ソースコード",

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

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "閲覧履歴も検索する",
  "options.spotlight.history.footnote":
    "オンにすると、閲覧履歴を読む許可を求めます。オフにすると、その許可を外します。",
  "options.spotlight.history.denied": "閲覧履歴へのアクセスが許可されませんでした",

  "options.shortcuts.heading": "ショートカット",
  "options.shortcuts.intro": "キーは Chrome の拡張機能のショートカット設定で割り当てます。",
  "options.shortcuts.open": "Chrome で変更",
  "options.shortcuts.openFailed": "Chrome のショートカット設定を開けませんでした。",
  "options.shortcuts.notSet": "未設定",
  "options.shortcuts.openAndMove.heading": "開く・移動する",
  "options.shortcuts.currentTab.heading": "表示中のタブ",
  "options.shortcuts.copy.footnote":
    "コピーのショートカットは、オフの間はキーを押しても何もしません。そのキーをほかの用途に使うときは、Chrome のショートカット設定でキーを外してください。",
  "options.commands.openSidePanel": "サイドパネルを開く",
  "options.commands.openSpotlight": "Spotlight を開く",
  "options.commands.nextTabInSpace": "Space の次のタブへ移る",
  "options.commands.previousTabInSpace": "Space の前のタブへ移る",
  "options.commands.togglePin": "タブをピン留め／ピン留めを外す",
  "options.commands.copyUrl": "URL をコピー",
  "options.commands.copyMarkdownLink": "URL を Markdown のリンクとしてコピー",

  "options.data.heading": "データ",
  "options.data.export.label": "データを書き出す",
  "options.data.export.button": "書き出す",
  "options.data.export.footnote":
    "Space・ピン留め・開いているタブ・Favorites・設定を JSON ファイルに保存します。GitHub のトークンとアーカイブは含みません。",
  "options.data.exported": "書き出しました",
  "options.data.exportFailed": "書き出せませんでした。少し待ってから、もう一度お試しください。",
}
