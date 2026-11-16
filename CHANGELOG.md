# Changelog

What changed for people using Katip, version by version. Each version's section becomes the notes of its release on GitHub. Changes go under Unreleased as they land; a release renames it to the version and its date.

Each language opens with one sentence on what the version brings, then lists the changes under New, Improved and Fixed, each led by a short bold name.

Katip のアップデート内容をバージョンごとにまとめています。各バージョンの内容は、そのまま GitHub のリリースノートとして公開されます。開発中の変更は Unreleased に記載し、リリース時にバージョン番号と日付を確定します。

各言語の冒頭にそのバージョンの要約を 1 文で記載し、その下に変更内容を「新機能」「改善」「修正」に分類して、短い太字の見出しとともに説明します。

## 1.10.0 — 2026-11-17

## English

Each Space has Favorites of its own, Gmail live folders and GitHub notifications show only what’s still unread, GitHub notifications no longer need a token, your downloads show in the sidebar, and Spotlight is now called the Command Palette.

### 🚀 New

- **A button that closes the sidebar** — The sidebar button to the right of the search field at the top of the sidebar closes the side panel, without reaching for Chrome’s toolbar or a shortcut.
- **Downloads in the sidebar** — The button at the bottom left of the sidebar shows your downloads in place of the Space, newest first, each with its file’s icon, the site it came from and how far it got. Search Downloads finds one by its name or site among your last 200, forgiving a typo, and the chips above the list narrow it to images, videos, audio, documents, archives or other files. Click a finished file to open it, show it in Finder or in its folder, pause, resume or cancel one still downloading, or choose Show All Downloads for Chrome’s downloads page. Esc clears the search, then takes you back to your tabs, as the back button at the top or at the bottom left, where the Downloads button was, does. The first click asks to read your downloads; if you don’t allow it, the button opens Chrome’s downloads page instead, and right-clicking it asks again.
- **Toggle Sidebar in the Command Palette** — The Toggle Sidebar command closes the side panel when it’s open in the window and opens it when it isn’t, with the key Chrome gives the side panel shown beside it if one is set.
- **Open Downloads in the Command Palette** — The Open Downloads command opens the side panel if it’s closed and shows your downloads there. If Katip can’t read your downloads yet, the view offers to allow it.

### ✨ Improved

- **Favorites for each Space** — Each Space has Favorites of its own: a new Space starts with none, and adding, moving or removing a Favorite changes only the Space you’re in. The Favorites you already have stay in every Space you have now, and from then on each Space’s change on their own. Chrome pins the tabs of the shown Space’s Favorites only; those of other Spaces stay open, unpinned, as that Space’s other tabs do, and are pinned again when you switch back. Deleting a Space deletes its Favorites too, while their open tabs move to another Space. Exports and imports keep each Space’s Favorites, a file from an earlier version gives its Favorites to every Space it adds, and an import from Arc gives each Space the Favorites of its Arc profile.
- **GitHub notifications without a token** — A GitHub live folder of notifications reads them from github.com with the session you’re signed in with, as the folders of searches do, instead of asking for a personal access token. It asks for access to github.com rather than api.github.com. Opening a notification from the folder marks it read on GitHub, as opening it from GitHub’s inbox does, and the welcome tour offers a notifications folder alongside the others. A notifications folder you already have switches on its next refresh; if it asks, allow access to github.com.
- **Only unread in Gmail and GitHub notifications** — A Gmail live folder, or a GitHub folder of notifications, lists only what you haven’t read: an item you open, or mark read with Mark All as Read, leaves the list once its tab is closed. Gmail itself still counts a mail marked read only in Katip as unread. Folders of GitHub searches keep their read items, as review requests and pull requests stay to be done.
- **A live mark that isn't a badge** — A live folder’s icon carries a small feed mark instead of the red dot, which looked like unread mail even when nothing was unread. How many items are unread still shows on the right of the folder.
- **Folder icons that stand out** — A folder with an icon shows the icon itself, full size and in the text color, in place of the folder with a small icon inside. It tips forward a little while the folder is open.
- **Command Palette** — Spotlight is now called the Command Palette, in the settings, on Chrome’s shortcuts page and everywhere else Katip names it. It works as before, and its size, position and other settings stay as you set them.
- **The site you’re on, at the top** — The search field at the top of the sidebar shows the site of the tab you’re viewing, such as github.com, in place of Search. Clicking it still opens the Command Palette. On a new tab or one of the browser’s own pages, it says Search as before.
- **The Archive from the Space menu and the Command Palette** — The Archive moves from the button at the bottom left, which now shows your downloads, to Open Archive in a Space’s … menu and the Open Archive command in the Command Palette. The × at its top right takes you back to your tabs. From the Command Palette, it opens the side panel first if it’s closed.
- **How many items a live folder shows** — A live folder shows its first 10 items, in the order you sorted it, and ends with a row such as “3 more” that opens the rest on Gmail or GitHub. Right-click the folder and choose 5, 10, 20 or All under Items to Show, below Sort By. An item open in a tab stays on its row wherever it falls, and the count on the right of the folder still counts every unread item.
- **Sliding between Spaces** — Switching Spaces slides the Space’s Favorites, name, pins and tabs in from the side its dot sits on in the bottom bar, pushing the Space you leave out the other side, while the background changes color along with them. Downloads slide in from the left as a whole, pushing the Space aside, and the Archive slides in from the left under the Space’s name; both slide back when closed. If your system is set to reduce motion, they change at once.
- **Swiping stops at the ends** — Swiping sideways no longer goes around from the last Space to the first. Past the first Space, it shows your downloads; if Katip can’t read them yet, Allow Access to Downloads in the view asks for it. Past the last Space, it shows a new Space to name. Swiping further than either nudges the sidebar instead of going on.
- **Name a new Space before it’s created** — The + at the bottom right, like swiping past the last Space, shows a new Space with a name ready to edit, and creates it only when you press Enter or Create; the theme picker then opens as before. Esc, Cancel, swiping back or clicking elsewhere gives it up, and neither the Space nor its bookmark folder is created.

### 🐛 Fixed

- **Links open in their place** — A tab opened from a link shows right below the tab it came from as soon as it appears in the sidebar, instead of showing up above that tab and then moving down. A link opened from a pin shows at the top of the temporary tabs straight away.

## 日本語

Favorites を Space ごとに持てるようになり、Gmail のライブフォルダと GitHub の通知に未読のものだけが並び、GitHub の通知はトークンなしで読めるようになり、サイドバーでダウンロードを見られるようになって、Spotlight はコマンドパレットという名前になりました。

### 🚀 新機能

- **サイドバーを閉じるボタン** — サイドバー上部の検索欄の右にあるサイドバーのボタンで、サイドパネルを閉じられるようになりました。Chrome のツールバーやショートカットを使わずに閉じられます。
- **サイドバーにダウンロード** — サイドバー左下のボタンで、Space の代わりにダウンロードを新しい順に表示できるようになりました。ファイルのアイコン、ダウンロード元のサイト、どこまで進んだかも表示します。「ダウンロードを検索」では直近 200 件からファイル名やサイトで探せて（※多少の入力ミスがあっても見つかります）、一覧の上のボタンで画像・動画・音声・書類・圧縮ファイル・その他に絞り込めます。ダウンロードし終えたファイルはクリックで開くほか、Finder やフォルダで表示でき、ダウンロード中のものは一時停止・再開・キャンセルできます。「すべてのダウンロードを表示」で Chrome のダウンロードのページを開きます。Esc で検索を消し、もう一度押すとタブの一覧に戻ります。上部の戻るボタンや、ダウンロードのボタンがあった左下の戻るボタンでも戻れます。最初のクリックでダウンロードを読む許可を求めます（※許可しなかった場合、ボタンは代わりに Chrome のダウンロードのページを開きます。右クリックからあらためて許可できます）。
- **コマンドパレットでサイドバーを切り替え** — 「サイドバーを切り替え」で、そのウィンドウのサイドパネルが開いていれば閉じ、閉じていれば開きます。Chrome でサイドパネルを開くキーを設定していれば、そのキーも横に表示します。
- **コマンドパレットからダウンロード** — 「ダウンロードを開く」で、閉じていればサイドパネルを開いて、ダウンロードを表示します（※ダウンロードを読む許可がまだない場合は、表示した画面から許可できます）。

### ✨ 改善

- **Space ごとの Favorites** — Favorites を Space ごとに持てるようになりました。新しい Space は Favorites が空の状態で始まり、Favorites の追加・並べ替え・削除は表示中の Space にだけ反映されます。今ある Favorites は今ある Space のすべてにそのまま残り、そこからは Space ごとに別々に変えられます。Chrome でピン留めするのは表示中の Space の Favorites のタブだけで、ほかの Space の Favorites のタブは、その Space のほかのタブと同じくピン留めを外して開いたまま残し、その Space に戻るとまたピン留めします。Space を削除すると、その Space の Favorites も削除します（※開いているタブは閉じずに、別の Space に移動します）。エクスポートと読み込みでは Space ごとの Favorites を引き継ぎます。以前のバージョンのファイルからは、追加するどの Space にもそのファイルの Favorites を追加し、Arc からの読み込みでは、各 Space にその Space の Arc のプロファイルの Favorites を追加します。
- **GitHub の通知をトークンなしで** — GitHub の通知のフォルダは、Personal access token の設定を求める代わりに、検索のフォルダと同じくログイン中のセッションで github.com から通知を読むようになりました。アクセスの許可も api.github.com ではなく github.com に求めます。フォルダから通知を開くと、GitHub の受信トレイから開いたときと同じく GitHub でも既読になります。ようこそツアーからも通知のフォルダを追加できます（※作成済みの通知のフォルダも次の更新から切り替わります。github.com へのアクセスを求められたら許可してください）。
- **未読だけを表示** — Gmail のライブフォルダと GitHub の通知のフォルダには、まだ読んでいないものだけが並びます。開いた項目や「すべて既読にする」で既読にした項目は、タブを閉じると一覧から消えます（※Katip で既読にしただけのメールは、Gmail 上では未読のままです）。GitHub の検索のフォルダでは、レビュー依頼やプルリクエストは対応が済むまで残るため、既読のものも引き続き表示します。
- **未読バッジに見えないライブの印** — ライブフォルダのアイコンの赤い点を、小さなフィードの印に変えました。赤い点は、未読がなくても未読があるように見えていました。未読の件数は、これまでどおりフォルダの右側に表示します。
- **目立つフォルダのアイコン** — アイコンを設定したフォルダは、フォルダの中に小さくアイコンを描く代わりに、アイコンそのものを文字と同じ色で大きく表示します。フォルダを開いているあいだは、少し傾きます。
- **コマンドパレット** — Spotlight の名前をコマンドパレットに変えました。設定や Chrome のショートカット設定など、Katip がこの機能の名前を出すところはすべてこの名前になります。使い方は変わらず、サイズや開く位置などの設定もそのまま引き継ぎます。
- **表示中のサイトを上部に** — サイドバー上部の検索欄に、「検索」の代わりに表示中のタブのサイト（github.com など）を表示します。クリックすると、これまでどおりコマンドパレットが開きます（※新しいタブやブラウザ自体のページでは、これまでどおり「検索」と表示します）。
- **Space のメニューとコマンドパレットからアーカイブ** — アーカイブは、ダウンロードを表示するようになった左下のボタンから、Space の「…」メニューとコマンドパレットの「アーカイブを開く」に移りました。右上の × でタブの一覧に戻ります。コマンドパレットからは、サイドパネルが閉じていれば先に開きます。
- **ライブフォルダに表示する件数** — ライブフォルダには、並べ替えた順に先頭の 10 件を表示し、最後に「ほか 3 件」のような行を置きます。この行をクリックすると、残りを Gmail や GitHub で開きます。件数は、フォルダの右クリックメニューで「並べ替え」の下にある「表示する件数」から、5 件・10 件・20 件・すべてのいずれかを選べます。タブで開いている項目は、何件目であっても自分の行に表示し、フォルダの右側の未読の件数は、表示していないものも含めてすべて数えます。
- **Space の切り替えをスライドで** — Space を切り替えると、Space の Favorites・名前・ピン・タブが、下部のバーでその Space の点がある側からスライドして入り、それまでの Space を反対側へ押し出します。背景の色も一緒に変わります。ダウンロードは画面全体が左から入って Space を横へ押しのけ、アーカイブは Space の名前の下に左から入ります。どちらも閉じると元の向きに戻ります（※システムで視差効果を減らす設定にしている場合は、動かさずに切り替えます）。
- **スワイプは端で止まるように** — 横へのスワイプで、最後の Space から最初の Space へ回り込まなくなりました。最初の Space からさらに戻るとダウンロードを表示します（※ダウンロードを読む許可がまだない場合は、表示した画面の「ダウンロードへのアクセスを許可」から許可できます）。最後の Space からさらに進むと、名前を付ける新しい Space を表示します。その先へスワイプしても、サイドバーが少し揺れるだけで止まります。
- **新しい Space は名前を決めてから作成** — 右下の ＋ や最後の Space からのスワイプで、名前を編集できる状態の新しい Space を表示し、Enter か「作成」を押したときにはじめて作成します。作成後は、これまでどおりテーマの選択が開きます。Esc、「キャンセル」、スワイプで戻る、ほかの場所をクリックのいずれかで取りやめ、Space もそのブックマークフォルダも作られません。

### 🐛 修正

- **リンクのタブを最初から定位置に** — リンクから開いたタブは、サイドバーに現れた時点から、開いた元のタブのすぐ下に表示されるようになりました。これまでは元のタブの上に一度表示されてから、下へ移動していました。ピン留めから開いたリンクも、最初から一時タブの一番上に表示されます。

## 1.9.0 — 2026-11-16

## English

Gmail live folders follow the mail Gmail marks important, and every live item shows who it is from.

### 🚀 New

- **GitHub notifications in a live folder** — A GitHub live folder can list the unread notifications in your GitHub inbox. It reads them with a personal access token (classic) with the notifications or repo scope, and asks you for one once the folder is made. Exports leave such a folder out, as the export file has no place for it yet.
- **Search History** — The Search History command in Spotlight searches your browsing history alone, forgiving typos as the rest of Spotlight does, and lists the pages you visited most recently before you type. Backspace in the empty field or Esc takes you back to the usual search. It needs history search turned on in the settings; until it is, the command offers to open the settings there.
- **Notifications for live folders** — Turn on “Notify about new items in live folders” in the settings, under Tabs, and Katip shows a system notification when mail Gmail marks important arrives in a Gmail live folder, or a new item in a GitHub live folder. Items that arrive together share one notification, and clicking it opens the item as clicking it in the side panel does. What a folder lists when it’s made isn’t announced.

### ✨ Improved

- **Important mail in Gmail live folders** — A new Gmail live folder lists the unread mail Gmail marks important. You can choose the Primary tab instead, which leaves out what Gmail sorts into Promotions, Social and Updates, or the whole inbox, or a label by its name. A folder made before keeps what it lists; make a new one to change it.
- **Important mail marked** — In any Gmail live folder, mail Gmail marks important carries a yellow marker, as in Gmail.
- **Read mail leaves sooner** — Live folders refresh every two minutes instead of five, and a Gmail live folder refreshes again soon after you open a mail from it, so a mail you’ve read leaves as soon as you close its tab.
- **Who each item is from** — A live folder shows the icon of Gmail or GitHub with a red dot for live. Its items show the icon of the sender’s site, or the sender’s initial for an address at a free mail service or a site not visited yet, and GitHub items show the avatar of the repository’s owner, in place of the same Gmail or GitHub icon on every row.
- **Live items open in place** — Opening a mail or a GitHub item from a live folder turns its row into the tab, as opening a pin does, instead of adding it to the temporary tabs. The row lights up while its tab is shown and has a close button, and clicking it again goes back to the tab. A mail Gmail has since counted read stays until you close its tab, and leaves the folder then. A collapsed live folder keeps the shown tab’s item in view under it, as a folder does with its pins.

### 🐛 Fixed

- **Fresh live folders** — Refreshing a live folder always asks Gmail or GitHub again, never answering from a copy the browser may have kept.
- **Deleting a live folder** — Delete Live Folder in a live folder’s menu removes it. Before, it did nothing.
- **Site icons on any theme** — A site icon drawn in one color for the system’s dark or light mode, such as GitHub’s or ChatGPT’s, no longer fades into a Space theme of the same lightness: it turns dark on a light theme and light on a dark one.

## 日本語

Gmail のライブフォルダで「重要」メールを追えるようになり、各項目に差出人がひと目でわかるアイコンが付きました。

### 🚀 新機能

- **GitHub の通知をライブフォルダに** — GitHub の未読通知を受信トレイから直接並べられるようになりました。notifications または repo スコープの Personal access token (classic) を使って読み取るため、フォルダ作成後にトークンの設定を案内します（※エクスポート形式に未対応のため、現在の設定書き出しには含まれません）。
- **履歴を検索** — Spotlight の「履歴を検索」コマンドで、閲覧履歴だけを検索できるようになりました。通常の検索と同じく多少の入力ミスがあってもヒットし、何も入力していないときは直近に開いたページを並べます。空欄で Backspace か Esc を押すと通常検索に戻ります。設定で履歴検索をオンにする必要があり、オフの場合はコマンドから直接設定を開けます。
- **ライブフォルダの新着通知** — 設定の「タブ」で「ライブフォルダの新着を通知する」をオンにすると、Gmail で「重要」マークのメールが届いたときや、GitHub で新しい項目が届いたときに、システムの通知で知らせます。同時に届いたものは 1 つにまとめられ、クリックするとサイドパネルから開いたときと同じように直接ページを開きます（フォルダ作成時点で既にある項目は通知しません）。

### ✨ 改善

- **Gmail ライブフォルダの表示対象** — 新しく作成する Gmail ライブフォルダは、デフォルトで未読の「重要」メールを並べるようになりました。メインタブ（プロモーションやソーシャル等を除く）、受信トレイ全体、任意のラベル指定も選べます（※既存のフォルダの設定は維持されるため、変更したい場合は新しくフォルダを作成してください）。
- **重要なメールに印** — Gmail のライブフォルダでも、Gmail が重要マークを付けたメールには Gmail と同じ黄色の印が付きます。
- **読んだメールがすぐ消える** — ライブフォルダの更新間隔を 5 分から 2 分に短縮しました。Gmail のライブフォルダからメールを開いた少しあとにも更新が走るため、読んだメールはタブを閉じるとすぐに消えます。
- **差出人がわかるアイコン** — フォルダには Gmail や GitHub のアイコンと、ライブ中を示す赤い点が付きます。フォルダ内の項目には、一律のアイコンではなく差出人サイトのアイコンを表示します（フリーメールのアドレスや未訪問サイトは差出人の頭文字、GitHub の項目にはリポジトリ所有者のアバターを表示します）。
- **ライブフォルダの項目をその場で開く** — ライブフォルダのメールや GitHub の項目を開くと、ピン留めを開いたときと同じように、その行がそのままタブになります。一時的なタブには加わりません。そのタブを表示しているあいだは行が強調され、閉じるボタンが付きます。もう一度クリックすると、そのタブに戻ります。開いたあとに Gmail で既読になったメールはタブを閉じるまで残り、閉じるとフォルダから消えます。ライブフォルダを畳んでも、表示中のタブの項目はフォルダの下に残ります（フォルダのピン留めと同じです）。

### 🐛 修正

- **ライブフォルダを最新に** — ライブフォルダの更新では、ブラウザのキャッシュを使わず、毎回 Gmail や GitHub に直接問い合わせて最新情報を取得します。
- **ライブフォルダの削除** — ライブフォルダのメニューの「ライブフォルダを削除」で、正しく削除できるようになりました（以前は何も起きないことがありました）。
- **どのテーマでも見えるサイトのアイコン** — GitHub や ChatGPT のように、システムのダーク／ライトモードに合わせて単色で描かれたアイコンが、同系色の Space テーマに溶けて見えなくなる問題を修正しました。明るいテーマでは暗く、暗いテーマでは明るく表示します。

## 1.8.0 — 2026-11-12

## English

Spotlight forgives typos and puts the commands first among equally good matches, and where it opens is set over the whole page.

### ✨ Improved

- **Commands first** — Among results that match what you typed equally well, Spotlight lists commands first, then your open tabs, then pins, bookmarks and history. A page you visited a moment ago no longer jumps ahead of a command with the same name, though a result that matches better still comes first.
- **Setting where Spotlight opens** — “Set Position…” in the settings dims the whole page and draws a grid over it. Drag Spotlight there, or move it with the arrow keys: near the centre, the grid lines, the edges and where it opens by default, it comes to rest and the line it rests on lights up. Done or Enter saves it, and Esc leaves it as it was.
- **Typos forgiven** — Spotlight finds what you meant through a mistyped, missing, extra or swapped character, such as `chatgtp` for ChatGPT or `githb` for GitHub. Words of four characters or more forgive more the longer they are, and such results come after those that match as typed.

## 日本語

Spotlight で多少の入力ミスがあっても検索できるようになり、一致度が同等の候補ではコマンドが優先して表示されるようになりました。また、画面全体を使って Spotlight の表示位置を自由に設定できるようになりました。

### ✨ 改善

- **コマンドを優先して表示** — 入力したキーワードへの一致度が同等の場合、コマンド、開いているタブ、ピン留め・ブックマーク、履歴の順に優先して並びます。直前に開いた履歴が同じ名前のコマンドより前に出てしまうことがなくなりました（より合致する候補は、これまでどおり一番上に表示されます）。
- **Spotlight の表示位置を設定** — 設定の「位置を設定…」を選ぶと、画面全体が暗くなりグリッドが表示されます。Spotlight をドラッグまたは矢印キーで動かせば、画面の中央や端、グリッド線、デフォルト位置の近くでピタッと吸着します。「完了」か Enter で保存でき、Esc でキャンセルできます。
- **入力ミスがあっても検索可能に** — 1文字の打ち間違いや抜け、余分な文字、キーの入れ替わりがあっても、意図した候補を探し出します。たとえば `chatgtp` で ChatGPT、`githb` で GitHub が見つかります。4文字以上の単語で動作し、文字数が長いほど柔軟にヒットします。入力ミスを補正して見つかった結果は、完全一致する結果の後に表示されます。

## 1.7.0 — 2026-11-11

## English

Split a tab with a new one right from Spotlight, and bangs that keep up with fast typing.

### 🚀 New

- **Split view from Spotlight** — “Split with New Tab” shows a new tab beside the one you’re on. On a tab in a split view, “Separate Split Tabs” turns the two back into single tabs.

### ✨ Improved

- **Bang suggestions are back** — While you type a bang, Spotlight suggests the bundled bangs again, as before 1.6.1, with the commands in your list that have a keyword first. A `!` alone suggests those commands, and bangs are suggested in command mode too.
- **No flash when you type `!`** — Spotlight no longer shows, for a moment, what it found for the text before the `!`.

### 🐛 Fixed

- **Enter right after typing** — Pressing Enter right after typing opens what all of your text finds. In a site’s mode, an Enter pressed quickly could do nothing before. While you type there, Spotlight no longer looks through your tabs and history, so it no longer shows that it is searching.
- **Enter in a compact Spotlight** — Pressing Enter before typing anything no longer switches to a recent tab that isn’t shown.
- **Muting from the side panel** — Clicking the speaker on a tab playing sound mutes it, and clicking it again unmutes it.

## 日本語

Spotlight から直接新しいタブと並べて画面を分割できるようになり、素早くタイピングしても bangs の候補がスムーズに追従するようになりました。

### 🚀 新機能

- **Spotlight から分割表示** — 「新しいタブと分割」を選ぶと、現在開いているタブの横に新しいタブを開いて並べます。分割表示中のタブでは「分割を解除」で別々の通常タブに戻せます。

### ✨ 改善

- **bangs 候補の表示を復元** — bangs の入力中に、1.6.1 以前と同様に標準搭載の bangs も候補に出るように戻しました。一覧内ではキーワードが設定されたコマンドが優先されます。`!` だけを入力したときはそれらのコマンドを提案し、コマンドモードでも bangs の候補が表示されます。
- **`!` 入力時の画面のちらつきを解消** — `!` の前に入力していたテキストの検索結果が一瞬表示されてしまう問題を解消しました。

### 🐛 修正

- **入力直後の Enter 操作** — 文字を入力してすぐに Enter を押した場合でも、入力内容全体に一致する結果を正しく開くようになりました。また、特定サイトの検索モードで素早く Enter を押した際に反応しないことがあった問題を修正しました。なお、このモードの入力中はタブや履歴を検索しないため、「検索中」の表示も出なくなりました。
- **コンパクト表示時の Enter キーの挙動** — 何も入力していない状態で Enter を押した際、画面に表示されていない直前のタブに切り替わってしまう不具合を修正しました。
- **サイドパネルからのミュート** — 音声再生中のタブにあるスピーカーアイコンをクリックしてミュート、もう一度クリックして解除できるようになりました。

## 1.6.1 — 2026-11-10

## English

Site search modes for bangs in Spotlight, and focused command suggestions.

### ✨ Improved

- **Site search from bangs** — Choosing a bang in Spotlight, with Enter or Tab, or typing one in full followed by a space, such as `!yt `, puts Spotlight in that site: its name shows before the search field, as command mode's does, and what you type searches the site. Backspace in the empty field or Escape leaves it. With nothing to fill in, Tab leaves the search field as it is instead of moving away from it.
- **Focused bang suggestions** — While a bang is typed, Spotlight suggests only the commands in your list. The bundled bangs still search when typed in full, such as `!w`.

## 日本語

Spotlight で bangs によるサイト専用検索モードに対応し、bang 入力時の候補表示を整理しました。

### ✨ 改善

- **bangs からのサイト専用検索** — Spotlight で bangs を Enter や Tab で選択するか、`!yt ` のように最後まで入力してスペースを押すと、そのサイト専用の検索モードに入るようになりました。コマンドモードと同様に検索欄の左にサイト名が表示され、入力したキーワードでそのサイト内を直接検索できます。空の入力欄で Backspace または Esc を押すと通常の検索に戻ります。また、補完候補がないときに Tab を押しても検索欄からフォーカスが外れなくなりました。
- **bangs 候補の絞り込み** — bangs の入力中の候補には、登録済みコマンドのみを表示するようにしました（標準搭載の bangs も、`!w` のように最後まで入力すればそのまま検索できます）。

## 1.6.0 — 2026-11-10

## English

A welcome tour on install, three sizes and position settings for Spotlight, and UI refinements throughout.

### 🚀 New

- **Welcome tour** — A welcome tour opens when Katip is installed. It shows where Katip lives, checks that Chrome gave Katip the keyboard shortcuts it suggests and helps fix any that went to another extension, then shows Favorites, themes, live folders, bangs and importing from Arc, each with an animated picture. A Space's color can be tried out, live folders added and Spotlight's commands changed right in the tour. It appears in the browser's language, light or dark as the browser is. The steps after setting up can be skipped, and the tour can be taken again from the settings.
- **Three Spotlight sizes** — Spotlight comes in three sizes, picked in the settings from a picture of each: Compact shows the search field alone until you type, Normal is as before, and Large is wider.
- **Spotlight position** — Where Spotlight opens can be chosen in the settings, by dragging it over a picture of the browser window. It comes to rest at the center and the edges.

### ✨ Improved

- **Frameless Spotlight** — Spotlight fills its window, without a margin and frame of its own inside it.
- **Always visible Space buttons** — The Space menu button and the button that clears temporary tabs are always shown, not only when the pointer is over the side panel.
- **Rate limit notice** — When GitHub is limiting requests from your network, checking for updates in the settings says so and when to try again, instead of saying GitHub couldn’t be reached.

### 🐛 Fixed

- **Favorites Space routing** — Closing a Favorite soon after the browser restarts no longer sends a tab opened later with the same page to the wrong Space.

## 日本語

インストール時の「ようこそツアー」の導入、Spotlight の 3 サイズ展開と表示位置の設定など、操作性を全般的に向上させました。

### 🚀 新機能

- **ようこそツアー** — Katip のインストール時に「ようこそツアー」を表示するようにしました。Katip の使い方を案内し、推奨ショートカットが正しく割り当てられているか確認して他の拡張機能との競合解消をサポートします。さらに Favorites、テーマ、ライブフォルダ、bangs、Arc からのデータ移行などをアニメーションを交えて紹介します。ツアー内では Space のテーマ色を試したり、ライブフォルダの追加や Spotlight コマンドのカスタマイズも行えます。ツアーはブラウザの言語およびライト／ダーク設定に合わせて表示され、初期設定以降のステップはスキップ可能です（設定画面からいつでも再確認できます）。
- **Spotlight のサイズ選択** — Spotlight のサイズを 3 種類（コンパクト・標準・大きめ）から選べるようにしました。設定画面でプレビューを見ながら選択できます。コンパクトは文字を入力するまで検索バーのみを表示し、大きめは横幅が広くなります。
- **Spotlight の表示位置設定** — Spotlight を開く位置を設定画面で調整できるようになりました。ブラウザウィンドウのプレビュー上で Spotlight をドラッグして配置でき、中央や端にピタッと吸着します。

### ✨ 改善

- **Spotlight のフレームレス表示** — Spotlight のウィンドウ内の余白と枠線をなくし、ウィンドウいっぱいに表示されるようにしました。
- **常時表示のボタン** — Space メニューボタンと一時タブを閉じるボタンを、サイドパネルにカーソルを合わせていないときでも常に表示するようにしました。
- **レート制限時のメッセージ改善** — GitHub の API レート制限がかかっている場合、設定画面のアップデート確認で「GitHub に接続できませんでした」と表示する代わりに、制限中である旨と再試行できる目安時間を表示するようにしました。

### 🐛 修正

- **Favorites の Space 振り分け修正** — ブラウザの再起動直後に Favorites（お気に入り）のタブを閉じた際、後から同じページを開いたタブが意図しない別の Space に割り振られてしまう不具合を修正しました。

## 1.5.0 — 2026-11-10

## English

Direct site searches with bangs, quick-create commands, and command icons in Spotlight.

### 🚀 New

- **Bangs** — Type `!` and a site's shortcut in Spotlight, as in `!gh katip`, to search that site directly. Typing `!g` suggests the bangs it can become. The bangs are Kagi's, as Helium ships them, and can be turned off in the settings.
- **Quick-create commands** — Spotlight has commands for creating things on popular sites, such as a new Google Doc, Linear issue or GitHub repository. You can remove them, and add your own in the settings: a command opens a page, or searches a site for what you type after its keyword.
- **Adding commands from bangs** — When adding a command in the settings, you can pick a site from the list of bangs to fill in its search.

### ✨ Improved

- **Command icons** — Spotlight's commands have icons.

## 日本語

Spotlight に bangs 検索やよく使うサービスへのクイック作成コマンド、コマンドアイコンを追加しました。

### 🚀 新機能

- **bangs 検索** — Spotlight で `!gh katip` のように `!` とサイトのショートカットを入力することで、そのサイトを直接検索できます。`!g` など途中まで入力すると候補が表示されます。bangs のリストには Helium 同梱の Kagi のデータを使用しており、設定画面で無効化することも可能です。
- **クイック作成コマンド** — よく使う外部サービス（Google ドキュメントの新規作成、Linear の Issue 作成、GitHub リポジトリの新規作成など）のアクションコマンドを Spotlight に追加しました。これらは不要なら削除でき、設定画面から独自のコマンドを追加することも可能です（指定のページを開くか、キーワードに続く文字列でサイト内検索を行えます）。
- **bangs からのコマンド追加** — 設定画面でコマンドを追加する際、bangs の一覧から対象サイトを選んで検索 URL を自動入力できるようにしました。

### ✨ 改善

- **コマンドアイコン** — Spotlight の各コマンドにアイコンを表示するようにしました。

## 1.4.0 — 2026-11-06

## English

An Arc-like theme picker with deeper, more vivid colors, and refined theme import.

### ✨ Improved

- **Vivid theme picker** — The theme picker works like Arc's: colors are most vivid at the center of the color field and pale toward white at its edges, and the most vivid colors paint the side panel far more richly than before. Saved themes keep their colors, but their dots move to match, and vivid themes are painted deeper.
- **Arc Space colors** — Spaces moved over from Arc come in closer to how Arc paints them at low intensity.

## 日本語

テーマのカラーピッカーを Arc スタイルに刷新し、より鮮やかで深みのある色合いに対応しました。

### ✨ 改善

- **より鮮やかなカラーピッカー** — テーマのカラーピッカーの操作感を Arc に近づけました。カラーフィールドの中央ほど鮮やかで、外側に向かうほど白に近い淡い色合いになり、最も鮮やかな色を選んだ際はサイドパネルにより深みのある発色で反映されます。保存済みのテーマカラーはそのまま保持されますが、ピッカー上のピンの位置は新しい色空間に合わせて更新され、鮮やかなテーマはより深みのある色合いで表示されます。
- **Arc テーマの再現性向上** — Arc からインポートした Space のカラー強度が低い場合でも、Arc 本来の表示により近い見た目で再現されるように改善しました。

## 1.3.0 — 2026-11-06

## English

Instant interactions, scroll position memory, update notifications, and richer theme textures.

### 🚀 New

- **Update notifications** — When a newer version of Katip is out, a card at the bottom of the side panel tells you, the first time the side panel opens after the browser starts. You can turn this off in the settings.
- **Release dates and update check** — The settings show when your version was released, and can check for updates when you ask.
- **Six theme textures** — Pressing the middle of the grain dial switches between six textures: grain, speckle, film, lines, linen and paper.

### ✨ Improved

- **Scroll position memory** — The side panel opens where its list was last scrolled, in each window and Space. Switching back to a Space returns to its place too.
- **Instant tab highlight** — A tab you click is highlighted at once, without waiting for the browser to switch to it.
- **Animated folders** — Folders open and close as soon as you click them, their contents sliding down and back up while the folder icon opens and closes with them.
- **Expanded color field** — Theme colors can be dragged out to the edges and corners of the color field, where the most vivid colors are.

## 日本語

操作レスポンスの高速化、スクロール位置の記憶、アップデート通知、6 種類のテクスチャ切り替えを追加しました。

### 🚀 新機能

- **アップデート通知** — 新しいバージョンがリリースされている場合、ブラウザ起動後に初めてサイドパネルを開いたタイミングで、下部に通知カードを表示するようになりました（設定画面でオフにできます）。
- **リリース日表示と手動確認** — 設定画面に使用中のバージョンのリリース日を表示し、手動でアップデートの確認ができるようにしました。
- **6 種類のテクスチャ** — グレイン（質感）ダイヤルの中央をクリックすることで、6 種類のテクスチャ（グレイン・斑点・フィルム・斜線・リネン・紙）を切り替えられるようにしました。

### ✨ 改善

- **スクロール位置の記憶** — サイドパネルを開いた際、ウィンドウや Space ごとに前回スクロールしていた位置を記憶して復元するようになりました。別の Space から戻った際も同様に元の位置に戻ります。
- **タブの即座ハイライト** — タブをクリックした際、ブラウザ側のタブ切り替えを待たずに即座にハイライトされるようにし、体感速度を向上させました。
- **フォルダ開閉のアニメーション** — フォルダをクリックすると即座に開閉し、中身がスムーズにスライド展開すると同時にフォルダアイコンのアニメーションも連動するようにしました。
- **カラーフィールドの端まで選択可能に** — テーマのカラーピッカーで、最も鮮やかな色域があるカラーフィールドの端や四隅までピンを動かせるようになりました。

## 1.2.0 — 2026-11-05

## English

Closed favorites stay as quick-launch tiles, seamless data retention across update folders, and build provenance attestations.

### 🚀 New

- **Build provenance attestations** — Each release zip comes with a build provenance attestation, so you can check with `gh attestation verify` that it was built from this repository.

### ✨ Improved

- **Persistent Favorites tiles** — Favorites stay when their tab is closed. A closed one shows as a dimmed tile that reopens on click, and Spotlight finds it too.
- **Folder-independent data retention** — Katip keeps its data when an update is unzipped into a different folder from the previous version. Updating from 1.1.0 still starts afresh once.

## 日本語

Favorites（お気に入り）の保持機能、別フォルダ解凍時のデータ引き継ぎ、ビルド証明（attestation）に対応しました。

### 🚀 新機能

- **ビルド証明の添付** — リリースの zip ファイルにビルド証明（build provenance attestation）を添付しました。`gh attestation verify` コマンドを使って、このリポジトリの公式ワークフローからビルドされたものであることを検証できます。

### ✨ 改善

- **Favorites の保持と再表示** — タブを閉じても Favorites（お気に入り）に残るようになりました。閉じているタブは薄いタイル状で表示され、クリックするとすぐに再表示できます。Spotlight からの検索にもヒットします。
- **別フォルダへの更新時のデータ引き継ぎ** — アップデート時に zip を以前と異なるフォルダに解凍した場合でも、Katip のデータを引き継げるようになりました（※1.1.0 からのアップデート時のみ、初回に一度データのリセットが発生します）。

## 1.1.0 — 2026-11-04

## English

Harmonious multi-color theme customization, lighter themes, and drag-to-split tabs.

### 🚀 New

- **Drag to split tabs** — Letting a tab go on the left or right of the page splits it with the tab shown there.

### ✨ Improved

- **Harmonious color palettes** — A theme's colors move together as one harmony: dragging the primary color turns the others with it, and dragging another color sets how far they spread. The presets include grays.
- **Clearer light themes** — Light themes are painted lighter, keeping each hue's own lightness, so creams and yellows no longer look grey.
- **Theme control animations** — The grain dial shows the grain at its strength, and the intensity wave grows from a flat line.

## 日本語

テーマ配色の連動調整、ライトテーマの視認性向上、ドラッグ＆ドロップによる画面分割に対応しました。

### 🚀 新機能

- **画面端へのドラッグで分割表示** — タブを画面の左端または右端にドラッグ＆ドロップすることで、その位置にあるタブと画面を 2 分割表示できるようになりました。

### ✨ 改善

- **調和するテーマ配色** — テーマの複数の色が調和を保ちながら連動するようになりました。主色（プライマリカラー）を動かすと他の色もバランスを保って回転し、他の色を動かすと配色の広がり具合を調整できます。また、プリセットにグレー系を追加しました。
- **ライトテーマの明度改善** — ライトテーマの明度を向上させ、各色相本来の明るさを保つようにしました。クリーム色やイエローがくすんだグレーに見えてしまうことがなくなります。
- **テーマコントロールの表現向上** — グレインダイヤルの表示を強度に合わせて変化させ、色の強弱を表すウェーブがフラットな状態から滑らかに展開するようにしました。

## 1.0.0 — 2026-11-03

## English

The initial release of Katip, bringing vertical tabs, Spaces, and powerful tools to Chrome's side panel.

### 🚀 New

- **Spaces and vertical tabs** — Spaces in the side panel, each with its own pinned tabs, folders and theme. Pins are saved as bookmarks.
- **Favorites and split views** — Favorites, split views, folder icons and search within folders.
- **Live folders** — Live folders that show Gmail mail and GitHub pull requests and issues.
- **Tab archive** — An archive of closed tabs, with automatic archiving of tabs left unviewed.
- **Spotlight** — Spotlight for searching tabs, pins, history and the web.
- **Arc import and data portability** — Moving over from Arc, and exporting and importing Katip's data.
- **Keyboard shortcuts** — Keyboard shortcuts, including copying the current page's URL or Markdown link.
- **Multilingual support** — English, Japanese, Spanish and Simplified Chinese.

## 日本語

Katip の最初のリリースです。Chrome のサイドパネルに、縦型タブ、Space、多彩な整理ツールをお届けします。

### 🚀 新機能

- **Space と縦型タブ** — サイドパネルで管理できる「Space」。Space ごとにピン留めタブ、フォルダ、テーマカラーを設定でき、ピン留めは Chrome ブックマークとして安全に保存されます。
- **Favorites と分割表示** — Favorites（お気に入り）、分割ビュー、カスタムフォルダアイコン、フォルダ内検索。
- **ライブフォルダ** — Gmail の受信メールや GitHub の Pull Request・Issue を一覧表示できるライブフォルダ。
- **タブアーカイブ** — 閉じたタブのアーカイブ機能と、一定時間閲覧していないタブの自動アーカイブ。
- **Spotlight 検索** — 開いているタブ、ピン留め、閲覧履歴、Web をまとめて素早く横断検索できる Spotlight。
- **Arc からのデータ移行** — Arc ブラウザからのデータ移行、および Katip データのエクスポート／インポート機能。
- **キーボードショートカット** — 表示中ページの URL コピーや Markdown リンクコピーを含む、充実したキーボードショートカット。
- **多言語対応** — 英語、日本語、スペイン語、簡体字中国語に対応。
