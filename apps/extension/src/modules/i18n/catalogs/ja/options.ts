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
  "options.version.released": "{date} リリース",
  "options.updates.label": "アップデート",
  "options.updates.check": "アップデートを確認",
  "options.updates.checking": "確認しています…",
  "options.updates.upToDate": "最新のバージョンです。",
  "options.updates.available":
    "バージョン {version} が出ています。リリースページからダウンロードし、いまの Katip に上書きして読み込んでください。",
  "options.updates.openRelease": "リリースページを開く",
  "options.updates.failed": "GitHub に接続できませんでした。少し待ってからもう一度試してください。",
  "options.updates.limited":
    "GitHub がいま、このネットワークからのリクエストを制限しています。{time} を過ぎてからもう一度試してください。",
  "options.updates.automatic.label": "アップデートを自動で確認",
  "options.updates.automatic.description":
    "ブラウザを起動して初めてサイドパネルを開いたときに、GitHub に最新のリリースを問い合わせ、新しいバージョンがあればお知らせします。Katip のデータは何も送りません。",
  "options.github.label": "GitHub",

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
  "options.spotlight.size.label": "サイズ",
  "options.spotlight.size.Compact": "コンパクト",
  "options.spotlight.size.Normal": "標準",
  "options.spotlight.size.Large": "大きめ",
  "options.spotlight.size.footnote":
    "次に Spotlight を開いたときから変わります。コンパクトでは、結果を 1 件ずつ 1 行にまとめます。",
  "options.spotlight.history.label": "閲覧履歴も検索する",
  "options.spotlight.history.footnote":
    "オンにすると、閲覧履歴を読む許可を求めます。オフにすると、その許可を外します。",
  "options.spotlight.history.denied": "閲覧履歴へのアクセスが許可されませんでした",

  "options.spotlight.bangs.label": "bangs でサイトを検索する",
  "options.spotlight.bangs.footnote":
    "Spotlight で ! に続けてサイトの短縮名を打つと、そのサイトを検索できます。たとえば !gh katip で GitHub を、!w で Wikipedia を検索します。短縮名の一覧は、Helium が同梱している Kagi の bangs です。",
  "options.commands.heading": "コマンド",
  "options.commands.footnote":
    "これらのコマンドは Spotlight のコマンドの一覧に出ます。キーワードを付けると、! に続けてキーワードを打って実行できます。URL に %s を入れると、キーワードのあとに打った言葉で検索します。",
  "options.commands.add": "コマンドを追加",
  "options.commands.restoreDefaults": "既定のコマンドを戻す",
  "options.commands.edit": "編集",
  "options.commands.remove": "削除",
  "options.commands.editLabel": "「{title}」を編集",
  "options.commands.removeLabel": "「{title}」を削除",
  "options.commands.save": "保存",
  "options.commands.newHeading": "新しいコマンド",
  "options.commands.editHeading": "コマンドを編集",
  "options.commands.field.site": "サイトを探す",
  "options.commands.field.sitePlaceholder": "GitHub、YouTube、MDN など",
  "options.commands.field.siteDescription": "bangs の一覧から、そのサイトの検索を埋めます。",
  "options.commands.noSites": "一致するサイトはありません",
  "options.commands.field.title": "名前",
  "options.commands.field.url": "URL",
  "options.commands.field.urlDescription":
    "キーワードのあとに打った言葉を入れる場所に %s を書きます。",
  "options.commands.field.keyword": "キーワード",
  "options.commands.field.keywordDescription": "ページを開くだけのコマンドなら省けます。",
  "options.commands.searchTitle": "{site} で検索",
  "options.commands.problem.titleMissing": "名前を入力してください",
  "options.commands.problem.urlInvalid":
    "https://example.com/ のような Web のアドレスを入力してください",
  "options.commands.problem.keywordInvalid": "空白や ! を含まないキーワードにしてください",
  "options.commands.problem.keywordMissing":
    "検索するコマンドには、検索する言葉を続けて打つためのキーワードが必要です",
  "options.commands.problem.keywordTaken": "このキーワードはほかのコマンドが使っています",

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

  "options.data.import.heading": "読み込み",
  "options.data.import.arc.label": "Arc から読み込む",
  "options.data.import.arc.description":
    "Arc の Space と、そのピン留めタブ・フォルダ・分割ビュー、Favorites を追加します。",
  "options.data.import.arc.file": "Arc のサイドバーのファイル",
  "options.data.import.katip.label": "Katip のファイルを読み込む",
  "options.data.import.katip.description":
    "Katip から書き出したファイルの Space・ピン留め・Favorites を追加します。",
  "options.data.import.katip.file": "Katip の書き出しファイル",
  "options.data.import.choose": "ファイルを選択…",
  "options.data.import.footnote":
    "ファイルはこの端末の中で読み、ブラウザの外へは送りません。読み込んだ Space は今ある Space の後ろに追加し、今あるものは変更も削除もしません。",
  "options.data.import.arcLocation.heading": "Arc のファイルの場所",
  "options.data.import.arcLocation.mac": "macOS",
  "options.data.import.arcLocation.macTip":
    "ファイルを選ぶ画面で ⌘⇧G を押し、このパスを貼り付けます。",
  "options.data.import.arcLocation.windows": "Windows",
  "options.data.import.arcLocation.windowsTip":
    "Packages の下の、名前が TheBrowserCompany.Arc_ で始まるフォルダの中にあります。",
  "options.data.import.arc.spaces": "読み込む Space",
  "options.data.import.arc.untitledSpace": "名前のない Space",
  "options.data.import.arc.profile.default": "デフォルトのプロファイル",
  "options.data.import.arc.profile.other": "その他のプロファイル",
  "options.data.import.arc.arrangement": "追加のしかた",
  "options.data.import.arc.separate.label": "別々の Space にする",
  "options.data.import.arc.separate.description": "Arc の Space をそれぞれ 1 つの Space にします。",
  "options.data.import.arc.combined.label": "1 つの Space にまとめる",
  "options.data.import.arc.combined.description":
    "{name} という名前の Space を 1 つ追加し、Arc の Space ごとにフォルダを作って入れます。{name} という Space がすでにあるときは、新しい Space の名前に番号を付けます。",
  "options.data.import.preview.arcHeading": "Arc から読み込む内容",
  "options.data.import.preview.katipHeading": "Katip のファイルから読み込む内容",
  "options.data.import.preview.added": "追加するもの",
  "options.data.import.preview.adjusted": "Katip に合わせて変えるもの",
  "options.data.import.preview.leftOut": "読み込まないもの",
  "options.data.import.preview.spaces": { other: "{count} 個の Space" },
  "options.data.import.preview.pins": { other: "{count} 個のピン留めタブ" },
  "options.data.import.preview.folders": { other: "{count} 個のフォルダ" },
  "options.data.import.preview.splits": { other: "{count} 個の分割ビュー" },
  "options.data.import.preview.liveFolders": { other: "{count} 個のライブフォルダ" },
  "options.data.import.preview.favorites": { other: "{count} 個の Favorites" },
  "options.data.import.preview.flattenedFolders": {
    other:
      "{count} 個のフォルダは Katip で作れる深さを超えているため、中身を 1 つ上のフォルダに入れます。",
  },
  "options.data.import.preview.widerSplits": {
    other:
      "{count} 個の分割ビューには 3 つ以上のタブがあります。それぞれ最初の 2 つを分割ビューのままにし、残りはその直後のピン留めタブにします。",
  },
  "options.data.import.preview.temporaryTabs": {
    other: "ピン留めしていない {count} 個のタブ（一時的なタブのため）",
  },
  "options.data.import.preview.favoritesAlreadySaved": {
    other: "すでに Favorites にある {count} 個のページ",
  },
  "options.data.import.preview.nonWebLinks": {
    other: "Web ページではない {count} 個のタブ（http と https のアドレスだけを読み込むため）",
  },
  "options.data.import.preview.unsupportedItems": {
    other: "Katip に相当するものが無い {count} 個の項目（ノートやイーゼルなど）",
  },
  "options.data.import.preview.settings": "ファイルの設定。今の設定はそのままです。",
  "options.data.import.preview.nothing": "このファイルには読み込めるものがありません。",
  "options.data.import.preview.noneChosen": "読み込む Space を 1 つ以上選んでください。",
  "options.data.import.preview.addOnly":
    "新しい Space を追加するだけです。今ある Space の名前の変更、統合、削除はしません。",
  "options.data.import.addFavorites.label": "Favorites に追加",
  "options.data.import.addFavorites.description":
    "今ある Favorites の後ろに、閉じた状態で追加します。",
  "options.data.import.addFavorites.descriptionByProfile":
    "今ある Favorites の後ろに、閉じた状態で追加します。追加するのは、選んだ Space のプロファイルの Favorites だけです。",
  "options.data.import.confirm": "読み込む",
  "options.data.import.cancel": "キャンセル",
  "options.data.import.problem.notArc":
    "Arc のサイドバーのファイルではありません。StorableSidebar.json を選んでください。",
  "options.data.import.problem.katipFileChosen":
    "Katip から書き出したファイルです。「Katip のファイルを読み込む」から読み込んでください。",
  "options.data.import.problem.notKatip": "Katip から書き出したファイルではありません。",
  "options.data.import.problem.arcFileChosen":
    "Arc のサイドバーのファイルです。「Arc から読み込む」から読み込んでください。",
  "options.data.import.problem.newerVersion":
    "新しい版の Katip で書き出したファイルです。Katip を更新してから、もう一度お試しください。",
  "options.data.import.problem.malformed": "この Katip のファイルは壊れていて読めません。",
  "options.data.import.problem.unreadable": "ファイルを読めませんでした。",
  "options.data.import.problem.unavailable":
    "読み込みの準備ができませんでした。少し待ってから、もう一度お試しください。",
  "options.data.imported": "読み込みました",
  "options.data.importFailed":
    "読み込みを最後まで終えられませんでした。止まるまでに追加した Space は残っています。",
}
