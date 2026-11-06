# Changelog

What changed for people using Katip, version by version. Each version's section becomes the notes of its release on GitHub. Changes go under Unreleased as they land; a release renames it to the version and its date.

Katip の利用者から見て変わったことを、バージョンごとに書きます。各バージョンの節が、GitHub のリリースノートになります。変更は入れたときに Unreleased に書き、リリースのときにその節をバージョン番号と日付に改めます。

## Unreleased

### English

- The side panel opens where its list was last scrolled, in each window and Space. Switching back to a Space returns to its place too.
- A tab you click is highlighted at once, without waiting for the browser to switch to it.
- Theme colors can be dragged out to the edges and corners of the color field, where the most vivid colors are.
- Pressing the middle of the grain dial switches between six textures: grain, speckle, film, lines, linen and paper.
- When a newer version of Katip is out, a card at the bottom of the side panel tells you, the first time the side panel opens after the browser starts. You can turn this off in the settings.
- The settings show when your version was released, and can check for updates when you ask.

### 日本語

- サイドパネルを開き直すと、ウィンドウと Space ごとに、前にスクロールしていた位置で表示します。別の Space から戻ったときも同じです。
- クリックしたタブを、ブラウザがそのタブに切り替わるのを待たずに、すぐハイライトします。
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
