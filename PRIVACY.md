# Privacy Policy

_Last updated: November 6, 2026_

Katip is a browser extension that organizes your tabs into Spaces in the side panel. This policy explains what data Katip handles and where it goes. In short: Katip has no server, collects nothing, and sends nothing to its developer or to anyone else.

## What Katip stores, and where

Everything Katip keeps stays in your browser:

- **Pinned tabs and folders** are saved as bookmarks in a "Katip" folder of your browser's bookmarks.
- **Spaces, their colors, folder icons, live folder settings, the archive of closed tabs, and which tab belongs to which Space** are saved in the extension's local storage (`chrome.storage.local` and `chrome.storage.session`).
- **Settings** are saved in `chrome.storage.sync`.

If you have turned on sync in your browser (for example Chrome Sync), your browser may sync your bookmarks and `chrome.storage.sync` to your other devices through your browser vendor's account. That is your browser's feature, governed by its own privacy policy; Katip itself sends nothing.

## Network requests

Katip makes network requests only to check for updates and for live folders.

**Update checks**: the first time the side panel opens after your browser starts, and whenever you press "Check for Updates" in Katip's settings, Katip asks `api.github.com` which release of Katip is the latest. The request carries no data from Katip and no cookies; like any request, it lets GitHub see your IP address and your browser. You can turn the automatic check off in Katip's settings.

**Live folders** make requests only after you create one and allow access to that site:

- **Gmail live folders** read your Gmail inbox or label feed from `mail.google.com`, using the session you are already signed in with in your browser.
- **GitHub live folders** read search results from `github.com`, using the session you are already signed in with, or from `api.github.com`.
- If you choose to enter a **GitHub personal access token** for a live folder, it is stored in the extension's local storage on your device and is sent only to `api.github.com`.

These requests go directly from your browser to Gmail or GitHub. What they return (for example email subjects and senders, or pull request titles) is shown in your side panel and kept in local storage so the folder can be displayed; it is never sent anywhere else.

## Optional permissions

- **History**: if you turn on history search in Spotlight, Katip asks for permission to read your browsing history and searches it locally, on your device, when you type in Spotlight.
- **Gmail and GitHub access**: asked for only when you create a live folder for that site.

You can revoke these at any time from Katip's settings or from your browser's extension settings.

## Other features

- **Copying** a URL or Markdown link writes to your clipboard only when you ask for it.
- **Searching the web** from Spotlight hands your query to your browser's default search engine, exactly as if you had typed it into the address bar.
- **Exporting** creates a file on your device. **Importing** (including from Arc) reads a file you choose, inside your browser; the file is never uploaded.

## What Katip does not do

- No analytics, tracking, telemetry or advertising.
- No account, and no server operated by Katip's developer.
- No sale or transfer of any user data to anyone.
- No remotely hosted code: everything Katip runs is included in the extension package.

## Changes and contact

If this policy changes, the new version will be published at this address with a new date. Questions are welcome as an issue at [github.com/qaynam/Katip](https://github.com/qaynam/Katip/issues).

---

# プライバシーポリシー（日本語）

_最終更新: 2026 年 11 月 6 日_

Katip は、サイドパネルでタブを Space ごとに整理するブラウザの拡張機能です。Katip はサーバーを持たず、データを集めず、開発者を含む誰にも何も送りません。

## 保存するもの

Katip が保存するものは、すべてお使いのブラウザの中にあります。

- **ピンとフォルダ**: ブラウザのブックマークの「Katip」フォルダに保存します。
- **Space とその色、フォルダのアイコン、ライブフォルダの設定、閉じたタブのアーカイブ、タブと Space の対応**: 拡張機能のローカルストレージ（`chrome.storage.local`、`chrome.storage.session`）に保存します。
- **設定**: `chrome.storage.sync` に保存します。

ブラウザの同期（Chrome Sync など）を有効にしている場合、ブラウザがブックマークと `chrome.storage.sync` をほかの端末へ同期することがあります。これはブラウザの機能で、ブラウザ提供元のプライバシーポリシーに従います。Katip 自身は何も送りません。

## 通信

Katip が通信するのは、アップデートの確認とライブフォルダのときだけです。

**アップデートの確認**: ブラウザを起動して初めてサイドパネルを開いたときと、Katip の設定で「アップデートを確認」を押したときに、Katip の最新のリリースを `api.github.com` に問い合わせます。この通信は Katip のデータも Cookie も含みません。ほかの通信と同じく、IP アドレスとブラウザの種類は GitHub に伝わります。自動の確認は Katip の設定で止められます。

**ライブフォルダ** は、ライブフォルダを作り、そのサイトへのアクセスを許可した後に限り通信します。

- **Gmail のライブフォルダ**: ブラウザでログイン済みのセッションを使い、`mail.google.com` から受信トレイやラベルのフィードを読みます。
- **GitHub のライブフォルダ**: ログイン済みのセッションを使って `github.com` から、または `api.github.com` から検索結果を読みます。
- **GitHub のアクセストークン**: ライブフォルダに入力した場合は、端末の拡張機能のローカルストレージに保存し、`api.github.com` にだけ送ります。

通信はお使いのブラウザから Gmail や GitHub へ直接行います。取得した内容（メールの件名や差出人、プルリクエストのタイトルなど）は、サイドパネルに表示するために端末の中に保存するだけで、ほかへは送りません。

## 任意の権限

- **閲覧履歴**: Spotlight の履歴検索を有効にしたときにだけ許可を求め、入力した語で端末の中で検索します。
- **Gmail と GitHub へのアクセス**: そのサイトのライブフォルダを作るときにだけ許可を求めます。

これらの許可は、Katip の設定画面やブラウザの拡張機能の設定から、いつでも取り消せます。

## その他の機能

- **URL や Markdown のリンクのコピー**: 操作したときにだけクリップボードに書き込みます。
- **Spotlight からの Web 検索**: アドレスバーに入力したときと同じく、ブラウザの既定の検索エンジンに検索語を渡します。
- **書き出し**: 端末にファイルを作ります。**読み込み**（Arc からの移行を含む）は、選んだファイルをブラウザの中で読み、アップロードはしません。

## しないこと

- 分析、トラッキング、テレメトリ、広告はありません。
- アカウントはなく、開発者が運営するサーバーもありません。
- 利用者のデータを販売や譲渡しません。
- 外部からコードを読み込みません。Katip が実行するものは、すべて拡張機能のパッケージに含まれています。

## 変更とお問い合わせ

このポリシーを変更した場合は、このページに日付を更新して掲載します。ご質問は [github.com/qaynam/Katip](https://github.com/qaynam/Katip/issues) の Issue でお寄せください。
