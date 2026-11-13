# Changelog

What changed for people using Katip, version by version. Each version's section becomes the notes of its release on GitHub. Changes go under Unreleased as they land; a release renames it to the version and its date.

Each language opens with one sentence on what the version brings, then lists the changes under New, Improved and Fixed, each led by a short bold name. Versions up to 1.6.1 list the changes alone.

Katip のアップデート内容をバージョンごとにまとめています。各バージョンの内容は、そのまま GitHub のリリースノートとして公開されます。開発中の変更は Unreleased に記載し、リリース時にバージョン番号と日付を確定します。

各言語の冒頭にそのバージョンの要約を 1 文で記載し、その下に変更内容を「新機能」「改善」「修正」に分類して、短い太字の見出しとともに説明します（1.6.1 以前のバージョンは変更点のみを列挙しています）。

## 1.8.0 — 2026-11-12

### English

Spotlight forgives typos and puts the commands first among equally good matches, and where it opens is set over the whole page.

#### Improved

- **Commands first** — Among results that match what you typed equally well, Spotlight lists commands first, then your open tabs, then pins, bookmarks and history. A page you visited a moment ago no longer jumps ahead of a command with the same name, though a result that matches better still comes first.
- **Setting where Spotlight opens** — “Set Position…” in the settings dims the whole page and draws a grid over it. Drag Spotlight there, or move it with the arrow keys: near the centre, the grid lines, the edges and where it opens by default, it comes to rest and the line it rests on lights up. Done or Enter saves it, and Esc leaves it as it was.
- **Typos forgiven** — Spotlight finds what you meant through a mistyped, missing, extra or swapped character, such as `chatgtp` for ChatGPT or `githb` for GitHub. Words of four characters or more forgive more the longer they are, and such results come after those that match as typed.

### 日本語

Spotlight で多少の入力ミスがあっても検索できるようになり、一致度が同等の候補ではコマンドが優先して表示されるようになりました。また、画面全体を使って Spotlight の表示位置を自由に設定できるようになりました。

#### 改善

- **コマンドを優先して表示** — 入力したキーワードへの一致度が同等の場合、コマンド、開いているタブ、ピン留め・ブックマーク、履歴の順に優先して並びます。直前に開いた履歴が同じ名前のコマンドより前に出てしまうことがなくなりました（より合致する候補は、これまでどおり一番上に表示されます）。
- **Spotlight の表示位置を設定** — 設定の「位置を設定…」を選ぶと、画面全体が暗くなりグリッドが表示されます。Spotlight をドラッグまたは矢印キーで動かせば、画面の中央や端、グリッド線、デフォルト位置の近くでピタッと吸着します。「完了」か Enter で保存でき、Esc でキャンセルできます。
- **入力ミスがあっても検索可能に** — 1文字の打ち間違いや抜け、余分な文字、キーの入れ替わりがあっても、意図した候補を探し出します。たとえば `chatgtp` で ChatGPT、`githb` で GitHub が見つかります。4文字以上の単語で動作し、文字数が長いほど柔軟にヒットします。入力ミスを補正して見つかった結果は、完全一致する結果の後に表示されます。

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

Spotlight から直接新しいタブと並べて画面を分割できるようになり、素早くタイピングしても bangs の候補がスムーズに追従するようになりました。

#### 新機能

- **Spotlight から分割表示** — 「新しいタブと分割」を選ぶと、現在開いているタブの横に新しいタブを開いて並べます。分割表示中のタブでは「分割を解除」で別々の通常タブに戻せます。

#### 改善

- **bangs 候補の表示を復元** — bangs の入力中に、1.6.1 以前と同様に標準搭載の bangs も候補に出るように戻しました。一覧内ではキーワードが設定されたコマンドが優先されます。`!` だけを入力したときはそれらのコマンドを提案し、コマンドモードでも bangs の候補が表示されます。
- **`!` 入力時の画面のちらつきを解消** — `!` の前に入力していたテキストの検索結果が一瞬表示されてしまう問題を解消しました。

#### 修正

- **入力直後の Enter 操作** — 文字を入力してすぐに Enter を押した場合でも、入力内容全体に一致する結果を正しく開くようになりました。また、特定サイトの検索モードで素早く Enter を押した際に反応しないことがあった問題を修正しました。なお、このモードの入力中はタブや履歴を検索しないため、「検索中」の表示も出なくなりました。
- **コンパクト表示時の Enter キーの挙動** — 何も入力していない状態で Enter を押した際、画面に表示されていない直前のタブに切り替わってしまう不具合を修正しました。
- **サイドパネルからのミュート** — 音声再生中のタブにあるスピーカーアイコンをクリックしてミュート、もう一度クリックして解除できるようになりました。

## 1.6.1 — 2026-11-10

### English

- Choosing a bang in Spotlight, with Enter or Tab, or typing one in full followed by a space, such as `!yt `, puts Spotlight in that site: its name shows before the search field, as command mode's does, and what you type searches the site. Backspace in the empty field or Escape leaves it. With nothing to fill in, Tab leaves the search field as it is instead of moving away from it.
- While a bang is typed, Spotlight suggests only the commands in your list. The bundled bangs still search when typed in full, such as `!w`.

### 日本語

- Spotlight で bangs を Enter や Tab で選択するか、`!yt ` のように最後まで入力してスペースを押すと、そのサイト専用の検索モードに入るようになりました。コマンドモードと同様に検索欄の左にサイト名が表示され、入力したキーワードでそのサイト内を直接検索できます。空の入力欄で Backspace または Esc を押すと通常の検索に戻ります。また、補完候補がないときに Tab を押しても検索欄からフォーカスが外れなくなりました。
- bangs の入力中の候補には、登録済みコマンドのみを表示するようにしました（標準搭載の bangs も、`!w` のように最後まで入力すればそのまま検索できます）。

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

- GitHub の API レート制限がかかっている場合、設定画面のアップデート確認で「GitHub に接続できませんでした」と表示する代わりに、制限中である旨と再試行できる目安時間を表示するようにしました。
- Spotlight のウィンドウ内の余白と枠線をなくし、ウィンドウいっぱいに表示されるようにしました。
- Spotlight のサイズを 3 種類（コンパクト・標準・大きめ）から選べるようにしました。設定画面でプレビューを見ながら選択できます。コンパクトは文字を入力するまで検索バーのみを表示し、大きめは横幅が広くなります。
- Spotlight を開く位置を設定画面で調整できるようになりました。ブラウザウィンドウのプレビュー上で Spotlight をドラッグして配置でき、中央や端にピタッと吸着します。
- Space メニューボタンと一時タブを閉じるボタンを、サイドパネルにカーソルを合わせていないときでも常に表示するようにしました。
- ブラウザの再起動直後に Favorites（お気に入り）のタブを閉じた際、後から同じページを開いたタブが意図しない別の Space に割り振られてしまう不具合を修正しました。
- Katip のインストール時に「ようこそツアー」を表示するようにしました。Katip の使い方を案内し、推奨ショートカットが正しく割り当てられているか確認して他の拡張機能との競合解消をサポートします。さらに Favorites、テーマ、ライブフォルダ、bangs、Arc からのデータ移行などをアニメーションを交えて紹介します。ツアー内では Space のテーマ色を試したり、ライブフォルダの追加や Spotlight コマンドのカスタマイズも行えます。ツアーはブラウザの言語およびライト／ダーク設定に合わせて表示され、初期設定以降のステップはスキップ可能です（設定画面からいつでも再確認できます）。

## 1.5.0 — 2026-11-10

### English

- Spotlight's commands have icons.
- Spotlight has commands for creating things on popular sites, such as a new Google Doc, Linear issue or GitHub repository. You can remove them, and add your own in the settings: a command opens a page, or searches a site for what you type after its keyword.
- Bangs: type `!` and a site's shortcut in Spotlight, as in `!gh katip`, to search that site directly. Typing `!g` suggests the bangs it can become. The bangs are Kagi's, as Helium ships them, and can be turned off in the settings.
- When adding a command in the settings, you can pick a site from the list of bangs to fill in its search.

### 日本語

- Spotlight の各コマンドにアイコンを表示するようにしました。
- よく使う外部サービス（Google ドキュメントの新規作成、Linear の Issue 作成、GitHub リポジトリの新規作成など）のアクションコマンドを Spotlight に追加しました。これらは不要なら削除でき、設定画面から独自のコマンドを追加することも可能です（指定のページを開くか、キーワードに続く文字列でサイト内検索を行えます）。
- bangs 検索に対応しました。Spotlight で `!gh katip` のように `!` とサイトのショートカットを入力することで、そのサイトを直接検索できます。`!g` など途中まで入力すると候補が表示されます。bangs のリストには Helium 同梱の Kagi のデータを使用しており、設定画面で無効化することも可能です。
- 設定画面でコマンドを追加する際、bangs の一覧から対象サイトを選んで検索 URL を自動入力できるようにしました。

## 1.4.0 — 2026-11-06

### English

- The theme picker works like Arc's: colors are most vivid at the center of the color field and pale toward white at its edges, and the most vivid colors paint the side panel far more richly than before. Saved themes keep their colors, but their dots move to match, and vivid themes are painted deeper.
- Spaces moved over from Arc come in closer to how Arc paints them at low intensity.

### 日本語

- テーマのカラーピッカーの操作感を Arc に近づけました。カラーフィールドの中央ほど鮮やかで、外側に向かうほど白に近い淡い色合いになり、最も鮮やかな色を選んだ際はサイドパネルにより深みのある発色で反映されます。保存済みのテーマカラーはそのまま保持されますが、ピッカー上のピンの位置は新しい色空間に合わせて更新され、鮮やかなテーマはより深みのある色合いで表示されます。
- Arc からインポートした Space のカラー強度が低い場合でも、Arc 本来の表示により近い見た目で再現されるように改善しました。

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

- サイドパネルを開いた際、ウィンドウや Space ごとに前回スクロールしていた位置を記憶して復元するようになりました。別の Space から戻った際も同様に元の位置に戻ります。
- タブをクリックした際、ブラウザ側のタブ切り替えを待たずに即座にハイライトされるようにし、体感速度を向上させました。
- フォルダをクリックすると即座に開閉し、中身がスムーズにスライド展開すると同時にフォルダアイコンのアニメーションも連動するようにしました。
- テーマのカラーピッカーで、最も鮮やかな色域があるカラーフィールドの端や四隅までピンを動かせるようになりました。
- グレイン（質感）ダイヤルの中央をクリックすることで、6 種類のテクスチャ（グレイン・斑点・フィルム・斜線・リネン・紙）を切り替えられるようにしました。
- 新しいバージョンがリリースされている場合、ブラウザ起動後に初めてサイドパネルを開いたタイミングで、下部に通知カードを表示するようになりました（設定画面でオフにできます）。
- 設定画面に使用中のバージョンのリリース日を表示し、手動でアップデートの確認ができるようにしました。

## 1.2.0 — 2026-11-05

### English

- Favorites stay when their tab is closed. A closed one shows as a dimmed tile that reopens on click, and Spotlight finds it too.
- Katip keeps its data when an update is unzipped into a different folder from the previous version. Updating from 1.1.0 still starts afresh once.
- Each release zip comes with a build provenance attestation, so you can check with `gh attestation verify` that it was built from this repository.

### 日本語

- タブを閉じても Favorites（お気に入り）に残るようになりました。閉じているタブは薄いタイル状で表示され、クリックするとすぐに再表示できます。Spotlight からの検索にもヒットします。
- アップデート時に zip を以前と異なるフォルダに解凍した場合でも、Katip のデータを引き継げるようになりました（※1.1.0 からのアップデート時のみ、初回に一度データのリセットが発生します）。
- リリースの zip ファイルにビルド証明（build provenance attestation）を添付しました。`gh attestation verify` コマンドを使って、このリポジトリの公式ワークフローからビルドされたものであることを検証できます。

## 1.1.0 — 2026-11-04

### English

- A theme's colors move together as one harmony: dragging the primary color turns the others with it, and dragging another color sets how far they spread. The presets include grays.
- Light themes are painted lighter, keeping each hue's own lightness, so creams and yellows no longer look grey.
- The grain dial shows the grain at its strength, and the intensity wave grows from a flat line.
- Letting a tab go on the left or right of the page splits it with the tab shown there.

### 日本語

- テーマの複数の色が調和を保ちながら連動するようになりました。主色（プライマリカラー）を動かすと他の色もバランスを保って回転し、他の色を動かすと配色の広がり具合を調整できます。また、プリセットにグレー系を追加しました。
- ライトテーマの明度を向上させ、各色相本来の明るさを保つようにしました。クリーム色やイエローがくすんだグレーに見えてしまうことがなくなります。
- グレインダイヤルの表示を強度に合わせて変化させ、色の強弱を表すウェーブがフラットな状態から滑らかに展開するようにしました。
- タブを画面の左端または右端にドラッグ＆ドロップすることで、その位置にあるタブと画面を 2 分割表示できるようになりました。

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

Katip の最初のリリースです。

- サイドパネルで管理できる「Space」。Space ごとにピン留めタブ、フォルダ、テーマカラーを設定でき、ピン留めは Chrome ブックマークとして安全に保存されます。
- Favorites（お気に入り）、分割ビュー、カスタムフォルダアイコン、フォルダ内検索。
- Gmail の受信メールや GitHub の Pull Request・Issue を一覧表示できる「ライブフォルダ」。
- 閉じたタブのアーカイブ機能と、一定時間閲覧していないタブの自動アーカイブ。
- 開いているタブ、ピン留め、閲覧履歴、Web をまとめて素早く横断検索できる「Spotlight」。
- Arc ブラウザからのデータ移行、および Katip データのエクスポート／インポート機能。
- 表示中ページの URL コピーや Markdown リンクコピーを含む、充実したキーボードショートカット。
- 英語、日本語、スペイン語、簡体字中国語に対応。
