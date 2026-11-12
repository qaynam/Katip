# Changelog

What changed for people using Katip, version by version. Each version's section becomes the notes of its release on GitHub. Changes go under Unreleased as they land; a release renames it to the version and its date.

Each language opens with one sentence on what the version brings, then lists the changes under New, Improved and Fixed, each led by a short bold name. Versions up to 1.6.1 list the changes alone.

Katip の利用者から見て変わったことを、バージョンごとに書きます。各バージョンの節が、GitHub のリリースノートになります。変更は入れたときに Unreleased に書き、リリースのときにその節をバージョン番号と日付に改めます。

各言語の最初の一文でその版の要点を述べ、変更を新機能・改善・修正に分けて、それぞれ短い太字の名前から書きます。1.6.1 までの版は、変更を並べただけです。

## Unreleased

### English

Spotlight puts the commands first among equally good matches.

#### Improved

- **Commands first** — Among results that match what you typed equally well, Spotlight lists commands first, then your open tabs, then pins, bookmarks and history. A page you visited a moment ago no longer jumps ahead of a command with the same name, though a result that matches better still comes first.

### 日本語

同じくらい一致する結果の中では、Spotlight がコマンドを先に出すようになりました。

#### 改善

- **コマンドを先頭に** — 打った言葉に同じくらい一致する結果の中では、コマンド、開いているタブ、ピン留めやブックマークと履歴の順に並べます。さっき開いた履歴が同じ名前のコマンドより先に出ることはなくなりました。よりよく一致する結果は、これまでどおり上に出ます。

## 1.7.0 — 2026-11-11

### English

Split a tab with a new one right from Spotlight, and bangs that keep up with fast typing.

#### New

- **Split view from Spotlight** — “Split with New Tab” shows a new tab beside the one you’re on. On a tab in a split view, “Separate Split Tabs” turns the two back into single tabs.

#### Improved

- **Bang suggestions are back** — While you type a bang, Spotlight suggests the bundled bangs again, as before 1.6.1, with the commands in your list that have a keyword first. A `!` alone suggests those commands, and bangs are suggested in command mode too.
- **No flash when you type `!`** — Spotlight no longer shows, for a moment, what it found for the text before the `!`.

#### Fixed

- **Enter right after typing** — Pressing Enter right after typing opens what all of your text finds. In a site’s mode, an Enter pressed quickly could do nothing before. While you type there, Spotlight no longer looks through your tabs and history, so it no longer shows that it is searching.
- **Enter in a compact Spotlight** — Pressing Enter before typing anything no longer switches to a recent tab that isn’t shown.
- **Muting from the side panel** — Clicking the speaker on a tab playing sound mutes it, and clicking it again unmutes it.

### 日本語

Spotlight から新しいタブと画面を分割できるようになり、bangs を速く打っても取りこぼさなくなりました。

#### 新機能

- **Spotlight から分割表示** — 「新しいタブと分割」で、いま見ているタブの右に新しいタブを並べます。分割中のタブでは「分割を解除」で 2 つのタブに戻せます。

#### 改善

- **bangs の候補が元どおりに** — bangs を打っている途中の候補に、1.6.1 より前と同じく同梱の bangs も出るように戻しました。リストのコマンドのうちキーワードのあるものが先頭に出ます。`!` だけのときはそれらのコマンドを出し、コマンドモードでも bangs の候補を出します。
- **`!` を打ったときのちらつきをなくしました** — `!` の前の言葉で見つかった結果が、一瞬映ることがなくなりました。

#### 修正

- **打ってすぐの Enter** — 打ってすぐ Enter を押しても、打った言葉すべてで見つかるものを開きます。サイトのモードでは、これまで速く Enter を押すと何も起きないことがありました。サイトのモードで打っている間はタブや履歴を探さなくなり、検索中の表示も出なくなりました。
- **コンパクトの Spotlight の Enter** — 何も打たずに Enter を押しても、表示されていない最近のタブに切り替わらなくなりました。
- **サイドパネルからミュート** — 音の出ているタブのスピーカーを押すとミュートし、もう一度押すと解除します。

## 1.6.1 — 2026-11-10

### English

- Choosing a bang in Spotlight, with Enter or Tab, or typing one in full followed by a space, such as `!yt `, puts Spotlight in that site: its name shows before the search field, as command mode's does, and what you type searches the site. Backspace in the empty field or Escape leaves it. With nothing to fill in, Tab leaves the search field as it is instead of moving away from it.
- While a bang is typed, Spotlight suggests only the commands in your list. The bundled bangs still search when typed in full, such as `!w`.

### 日本語

- Spotlight で bangs を Enter か Tab で選ぶか、`!yt ` のように最後まで打ってスペースを押すと、そのサイトのモードに入るようにしました。コマンドモードと同じく検索欄の左にサイト名が出て、打った言葉でそのサイトを検索します。空の検索欄で Backspace か Esc を押すと抜けます。補完するものがないときの Tab は、検索欄から離れず何もしません。
- bangs を打っている途中の候補には、リストにあるコマンドだけを出すようにしました。同梱の bangs も、`!w` のように最後まで打てば検索できます。

## 1.6.0 — 2026-11-10

### English

- When GitHub is limiting requests from your network, checking for updates in the settings says so and when to try again, instead of saying GitHub couldn’t be reached.
- Spotlight fills its window, without a margin and frame of its own inside it.
- Spotlight comes in three sizes, picked in the settings from a picture of each: Compact shows the search field alone until you type, Normal is as before, and Large is wider.
- Where Spotlight opens can be chosen in the settings, by dragging it over a picture of the browser window. It comes to rest at the center and the edges.
- The Space menu button and the button that clears temporary tabs are always shown, not only when the pointer is over the side panel.
- Closing a Favorite soon after the browser restarts no longer sends a tab opened later with the same page to the wrong Space.
- A welcome tour opens when Katip is installed. It shows where Katip lives, checks that Chrome gave Katip the keyboard shortcuts it suggests and helps fix any that went to another extension, then shows Favorites, themes, live folders, bangs and importing from Arc, each with an animated picture. A Space's color can be tried out, live folders added and Spotlight's commands changed right in the tour. It appears in the browser's language, light or dark as the browser is. The steps after setting up can be skipped, and the tour can be taken again from the settings.

### 日本語

- GitHub がネットワークからのリクエストを制限しているときは、設定のアップデート確認が「GitHub に接続できませんでした」ではなく、制限されていることと、いつ試し直せばよいかを表示します。
- Spotlight がウィンドウいっぱいに広がるようにしました。内側の余白と枠をなくしました。
- Spotlight の大きさを 3 つから選べるようにしました。設定で、それぞれを描いた絵から選びます。コンパクトは打ち始めるまで検索欄だけを表示し、標準はこれまでどおり、大きめは横に広くなります。
- Spotlight を開く位置を設定で選べるようにしました。ブラウザのウィンドウを描いた絵の上で Spotlight をドラッグします。中央と端ではぴたりと止まります。
- Space のメニューのボタンと、一時タブを片付けるボタンを、ポインタがサイドパネルの上にないときも表示するようにしました。
- ブラウザを再起動してすぐ Favorites のタブを閉じると、あとで同じページを開いたタブが別の Space に入ってしまう問題を直しました。
- Katip を入れたときに、ようこそツアーが開くようにしました。Katip の場所を案内し、Katip が求めるキーボードショートカットを Chrome が割り当てたかを確かめ、ほかの拡張機能に取られたものを直す手助けをします。続いて Favorites、テーマ、ライブフォルダ、bangs、Arc からの読み込みを、動く絵とともに紹介します。Space の色をその場で試したり、ライブフォルダを追加したり、Spotlight のコマンドを変えたりもできます。ツアーはブラウザの言語で、ブラウザに合わせてライトかダークで表示されます。設定のあとのステップは飛ばせ、ツアーは設定からもう一度見られます。

## 1.5.0 — 2026-11-10

### English

- Spotlight's commands have icons.
- Spotlight has commands for creating things on popular sites, such as a new Google Doc, Linear issue or GitHub repository. You can remove them, and add your own in the settings: a command opens a page, or searches a site for what you type after its keyword.
- Bangs: type `!` and a site's shortcut in Spotlight, as in `!gh katip`, to search that site directly. Typing `!g` suggests the bangs it can become. The bangs are Kagi's, as Helium ships them, and can be turned off in the settings.
- When adding a command in the settings, you can pick a site from the list of bangs to fill in its search.

### 日本語

- Spotlight のコマンドにアイコンを付けました。
- 新しい Google ドキュメント、Linear の Issue、GitHub のリポジトリなど、よく使うサイトで何かを作るコマンドを Spotlight に加えました。これらは消せます。設定で自分のコマンドも追加でき、ページを開くか、キーワードに続けて打った言葉でサイトを検索できます。
- bangs: Spotlight で `!gh katip` のように `!` に続けてサイトの短縮名を打つと、そのサイトを直接検索します。`!g` まで打つと候補が出ます。bangs の一覧は Helium が同梱している Kagi のもので、設定でオフにできます。
- 設定でコマンドを追加するときに、bangs の一覧からサイトを選んで検索の URL を埋められます。

## 1.4.0 — 2026-11-06

### English

- The theme picker works like Arc's: colors are most vivid at the center of the color field and pale toward white at its edges, and the most vivid colors paint the side panel far more richly than before. Saved themes keep their colors, but their dots move to match, and vivid themes are painted deeper.
- Spaces moved over from Arc come in closer to how Arc paints them at low intensity.

### 日本語

- テーマの色の選び方を Arc と同じにしました。色のエリアの中心ほど鮮やかで、端に行くほど白くなります。いちばん鮮やかな色は、以前よりずっと濃くサイドパネルを塗ります。保存済みのテーマの色はそのままですが、点の位置はそれに合わせて動き、鮮やかなテーマは濃く表示されます。
- Arc から移した Space の色の強さが低いときに、Arc の見え方により近くなりました。

## 1.3.0 — 2026-11-06

### English

- The side panel opens where its list was last scrolled, in each window and Space. Switching back to a Space returns to its place too.
- A tab you click is highlighted at once, without waiting for the browser to switch to it.
- Folders open and close as soon as you click them, their contents sliding down and back up while the folder icon opens and closes with them.
- Theme colors can be dragged out to the edges and corners of the color field, where the most vivid colors are.
- Pressing the middle of the grain dial switches between six textures: grain, speckle, film, lines, linen and paper.
- When a newer version of Katip is out, a card at the bottom of the side panel tells you, the first time the side panel opens after the browser starts. You can turn this off in the settings.
- The settings show when your version was released, and can check for updates when you ask.

### 日本語

- サイドパネルを開き直すと、ウィンドウと Space ごとに、前にスクロールしていた位置で表示します。別の Space から戻ったときも同じです。
- クリックしたタブを、ブラウザがそのタブに切り替わるのを待たずに、すぐハイライトします。
- フォルダをクリックするとすぐに開閉し、中身がなめらかにスライドするのに合わせて、フォルダのアイコンも開閉します。
- テーマの色の点を、色のエリアの端や角まで動かせるようになりました。いちばん鮮やかな色は端にあります。
- グレインのダイヤルの中央を押すと、粒子・斑点・フィルム・斜線・リネン・紙の 6 種類のテクスチャを切り替えられます。
- 新しいバージョンが出ていると、ブラウザを起動して初めてサイドパネルを開いたときに、下に出るカードでお知らせします。設定でオフにできます。
- 設定画面に、使っているバージョンのリリース日を出し、アップデートをその場で確認できるようにしました。

## 1.2.0 — 2026-11-05

### English

- Favorites stay when their tab is closed. A closed one shows as a dimmed tile that reopens on click, and Spotlight finds it too.
- Katip keeps its data when an update is unzipped into a different folder from the previous version. Updating from 1.1.0 still starts afresh once.
- Each release zip comes with a build provenance attestation, so you can check with `gh attestation verify` that it was built from this repository.

### 日本語

- お気に入りのタブを閉じても、お気に入りに残るようになりました。閉じたものは薄いタイルで残り、クリックするとまた開きます。Spotlight でも見つかります。
- アップデートを前のバージョンとは別のフォルダに展開しても、Katip のデータを引き継ぐようになりました。1.1.0 からの更新だけは、一度データが引き継がれません。
- リリースの zip に、このリポジトリでビルドしたことを示す証明（build provenance attestation）を付けました。`gh attestation verify` で確かめられます。

## 1.1.0 — 2026-11-04

### English

- A theme's colors move together as one harmony: dragging the primary color turns the others with it, and dragging another color sets how far they spread. The presets include grays.
- Light themes are painted lighter, keeping each hue's own lightness, so creams and yellows no longer look grey.
- The grain dial shows the grain at its strength, and the intensity wave grows from a flat line.
- Letting a tab go on the left or right of the page splits it with the tab shown there.

### 日本語

- テーマの色が、ひとつの配色としてまとまって動くようになりました。主色を動かすとほかの色も一緒に回り、ほかの色を動かすと色の広がりが変わります。プリセットにグレーを加えました。
- ライトのテーマを明るく、色相ごとの明るさを保って塗るようにしました。クリーム色や黄色がくすんで見えなくなります。
- グレインのダイヤルにその強さのグレインを表示し、色の強さの波が平らな線から育つようにしました。
- タブをページの左右で離すと、そこに表示しているタブと分割ビューになります。

## 1.0.0 — 2026-11-03

### English

The first release.

- Spaces in the side panel, each with its own pinned tabs, folders and theme. Pins are saved as bookmarks.
- Favorites, split views, folder icons and search within folders.
- Live folders that show Gmail mail and GitHub pull requests and issues.
- An archive of closed tabs, with automatic archiving of tabs left unviewed.
- Spotlight for searching tabs, pins, history and the web.
- Moving over from Arc, and exporting and importing Katip's data.
- Keyboard shortcuts, including copying the current page's URL or Markdown link.
- English, Japanese, Spanish and Simplified Chinese.

### 日本語

最初のリリースです。

- サイドパネルの Space。Space ごとにピン、フォルダ、テーマを持ちます。ピンはブックマークとして保存します。
- お気に入り、分割ビュー、フォルダのアイコン、フォルダ内の検索。
- Gmail のメールや GitHub のプルリクエスト、Issue を表示するライブフォルダ。
- 閉じたタブのアーカイブと、しばらく見ていないタブの自動アーカイブ。
- タブ、ピン、履歴、Web をまとめて検索できる Spotlight。
- Arc からの移行と、Katip のデータの書き出し・読み込み。
- 表示中のページの URL や Markdown のリンクをコピーするものを含む、キーボードショートカット。
- 英語、日本語、スペイン語、簡体字中国語。
