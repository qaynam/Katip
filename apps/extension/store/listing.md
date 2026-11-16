# Chrome Web Store listing

The text to paste into the Chrome Web Store Developer Dashboard, field by field, and how versions get to the store. Keep it in sync with the extension when features or permissions change.

## Store listing

**Item name:** Katip

**Category:** Productivity → Workflow & Planning

**Homepage URL:** https://github.com/qaynam/Katip

**Support URL:** https://github.com/qaynam/Katip/issues

**Graphic assets**

| Field                         | File                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Store icon (128×128)          | `assets/brand/png/icon-128.png`                                                                     |
| Screenshots (1280×800)        | `apps/extension/store/screenshots/en/` (English), `apps/extension/store/screenshots/ja/` (Japanese) |
| Small promo tile (440×280)    | `apps/extension/store/promo/small-tile.png`                                                         |
| Marquee promo tile (1400×560) | `apps/extension/store/promo/marquee.png`                                                            |

### English (default)

**Summary** (132 characters at most)

> Vertical tabs in the side panel. Organize tabs into Spaces with pinned tabs, folders, split view and a Spotlight search.

**Description**

> Katip turns the side panel into a sidebar that keeps your tabs in order.
>
> SPACES
> Keep separate sets of tabs for work, side projects or hobbies. Each Space has its own pinned tabs, open tabs and colors, and you switch between them from the bottom of the side panel.
>
> PINNED TABS AND FOLDERS
> Pin the pages you come back to and group them in folders with icons. Pins are saved as bookmarks, so your browser's sync carries them to your other computers.
>
> SPLIT VIEW
> Drop one tab onto another to view them side by side, and pin the pair to open it again later (Chrome 155 or later).
>
> SPOTLIGHT
> One search box for open tabs, pins, Spaces, history and the web. It also runs commands: copy the URL, copy a Markdown link, pin a tab, move it to another Space and more. Press Tab on an empty box to search commands only.
>
> LIVE FOLDERS
> A folder that lists your Gmail inbox or a label, or your GitHub review requests, pull requests, issues and mentions, using the accounts you're already signed in to.
>
> AND MORE
> • Favorites: the pages you keep at hand as a row of icons, kept even when their tabs are closed
> • Archive: tabs you haven't used for a while are closed and kept, ready to bring back
> • Keyboard shortcuts for the side panel, Spotlight and copying links
> • Export your data to a file and import it again
> • English, Japanese, Simplified Chinese and Spanish
>
> COMING FROM ARC?
> Import your Arc Spaces, colors, pinned tabs, folders, split views and Favorites from Arc's sidebar file in a minute. Nothing you already have is changed.
>
> PRIVATE BY DESIGN
> Katip has no server and collects nothing. Your data stays in your browser. Live folders talk to Gmail and GitHub directly from your browser, and only after you allow it.
>
> Katip is open source: https://github.com/qaynam/Katip

### Japanese

**Summary**

> サイドパネルに縦にタブを並べ、Space ごとに整理します。ピン留め、フォルダ、分割ビュー、Spotlight 検索に対応。

**Description**

> Katip は、サイドパネルをタブを整理するサイドバーに変えます。
>
> SPACE
> 仕事、個人の開発、趣味など、タブのまとまりを分けて持てます。Space ごとにピン、開いているタブ、色を持ち、サイドパネルの下から切り替えます。
>
> ピンとフォルダ
> よく開くページをピン留めし、アイコン付きのフォルダにまとめられます。ピンはブックマークとして保存されるので、ブラウザの同期でほかのパソコンにも届きます。
>
> 分割ビュー
> タブを別のタブに重ねると、2 つのページを並べて表示できます。その組み合わせをピン留めして、あとで開き直せます（Chrome 155 以降）。
>
> SPOTLIGHT
> 開いているタブ、ピン、Space、履歴、Web をひとつの検索窓で探せます。URL のコピー、Markdown のリンクとしてコピー、ピン留め、別の Space への移動などのコマンドも実行できます。空欄で Tab を押すと、コマンドだけを探せます。
>
> ライブフォルダ
> Gmail の受信トレイやラベル、GitHub のレビュー依頼・プルリクエスト・Issue・メンションを一覧にするフォルダです。ログイン済みのアカウントをそのまま使います。
>
> そのほか
> • Favorites: よく使うページをアイコンで並べて表示。タブを閉じても残ります
> • アーカイブ: しばらく使っていないタブを閉じて保存し、いつでも戻せます
> • サイドパネル、Spotlight、リンクのコピーのキーボードショートカット
> • データをファイルに書き出し、読み込み直せます
> • 英語、日本語、簡体字中国語、スペイン語に対応
>
> ARC から移行するなら
> Arc の Space、色、ピン、フォルダ、分割ビュー、Favorites を、Arc のサイドバーのファイルからすぐに読み込めます。今あるものは変更しません。
>
> プライバシー
> Katip はサーバーを持たず、データを集めません。データはブラウザの中にとどまります。ライブフォルダは、許可したときにだけ、ブラウザから Gmail や GitHub に直接つなぎます。
>
> Katip はオープンソースです: https://github.com/qaynam/Katip

## Privacy practices

**Single purpose**

> Katip organizes the user's browser tabs in the side panel: it groups tabs into Spaces and keeps pinned tabs, folders and split views for each Space, with a search box (Spotlight) to find and act on tabs.

**Permission justifications**

| Permission                                                                     | Justification                                                                                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabs`                                                                         | Reads tab titles and URLs to show the tabs in the sidebar and assign them to Spaces, and opens, moves, activates and closes tabs when the user asks. |
| `tabGroups`                                                                    | Mirrors each Space as a tab group when the user turns on tab group sync, and keeps split views inside the right group.                               |
| `sidePanel`                                                                    | The extension's main interface is shown in the side panel.                                                                                           |
| `storage`                                                                      | Saves Spaces, settings, the archive of closed tabs and live folder settings on the user's device.                                                    |
| `bookmarks`                                                                    | Pinned tabs and folders are stored as bookmarks so they persist across restarts and devices.                                                         |
| `alarms`                                                                       | Schedules the automatic archiving of idle tabs and the periodic refresh of live folders.                                                             |
| `favicon`                                                                      | Shows each tab's and pin's site icon from the browser's favicon cache.                                                                               |
| `offscreen`                                                                    | A service worker can't write to the clipboard, so copying a URL from a keyboard shortcut uses an offscreen document with the CLIPBOARD reason.       |
| `clipboardWrite`                                                               | Copies the current tab's URL or a Markdown link when the user runs that command.                                                                     |
| `search`                                                                       | Spotlight's "search the web" hands the query to the browser's default search engine.                                                                 |
| `scripting`                                                                    | Shows a brief "Copied" notice on the page the user copied from.                                                                                      |
| `activeTab`                                                                    | Limits that notice to the tab the user's keyboard shortcut ran on, without asking for access to every site.                                          |
| `history` (optional)                                                           | Searches the browsing history locally in Spotlight, only after the user turns on history search.                                                     |
| Host permission `https://mail.google.com/*` (optional)                         | Reads the Gmail inbox or label feed for a Gmail live folder the user creates.                                                                        |
| Host permissions `https://github.com/*`, `https://api.github.com/*` (optional) | Reads GitHub search results or notifications for a GitHub live folder the user creates.                                                              |

**Are you using remote code?** No. All code is included in the package.

**Data usage**

Katip does not collect or transmit any user data. Leave every data type unchecked, and certify:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://katip.qaynam.dev/en/privacy/

## Distribution

- **Visibility:** Public
- **Regions:** All regions
- **Pricing:** Free

## Notes for reviewers

> Click the toolbar icon (or press ⌃⌘S on macOS, Alt+S elsewhere) to open Katip in the side panel. Open a few tabs and they appear under the current Space; drag a tab into the pinned area to pin it, or onto another tab to open a split view (Chrome 155+). Press Alt+T for Spotlight. Live folders need an account signed in to Gmail or GitHub and are optional. Settings → Data has export and import; a sample Arc file for testing import is at https://github.com/qaynam/Katip/blob/main/apps/extension/src/modules/arc-import/fixtures/arc-sidebar.json

## Publishing

### Which zip

Upload `katip-<version>-chrome-web-store.zip` from `pnpm package:store`, never the zip of a GitHub release from `pnpm package`. The store package is the same code without the manifest's `key`, which the store refuses on a new item, and without the check for newer GitHub releases, since the store updates its installs itself.

### The first version, by hand

The Chrome Web Store API can't create an item.

1. Push the version's tag. The **Chrome Web Store** workflow builds the store package for it, the `chrome-web-store-package` artifact of the run, and goes no further while `CHROME_WEB_STORE_ITEM_ID` isn't set. The artifact downloads as a zip holding the store package. (`pnpm package:store` on the tag builds the same.)
2. In the Developer Dashboard, choose **Add new item**, upload the store package, fill in the tabs from the sections above, and submit it for review.
3. Note the item ID, on the item's **Package** tab, and the publisher ID, under **Publisher → Settings**.

### Access for the workflow

The workflow signs in to Google as a service account through Workload Identity Federation, so no key or secret is kept anywhere.

1. In a Google Cloud project, turn on the APIs and create a service account without any roles:

   ```sh
   gcloud services enable chromewebstore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"
   gcloud iam service-accounts create katip-chrome-web-store --project "$PROJECT_ID"
   ```

2. Let only this repository's Chrome Web Store workflow, run on a tag, act as the service account:

   ```sh
   PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
   gcloud iam workload-identity-pools create github --project "$PROJECT_ID" --location global
   gcloud iam workload-identity-pools providers create-oidc katip --project "$PROJECT_ID" --location global \
     --workload-identity-pool github --issuer-uri https://token.actions.githubusercontent.com \
     --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition "assertion.repository == 'qaynam/Katip' && assertion.workflow_ref.startsWith('qaynam/Katip/.github/workflows/chrome-web-store.yml@refs/tags/v')"
   gcloud iam service-accounts add-iam-policy-binding "katip-chrome-web-store@$PROJECT_ID.iam.gserviceaccount.com" \
     --project "$PROJECT_ID" --role roles/iam.workloadIdentityUser \
     --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/qaynam/Katip"
   ```

3. In the Developer Dashboard, add the service account's email under **Account**. A publisher can have only one.
4. In the repository's **Settings → Secrets and variables → Actions → Variables**, set these. None of them is a secret.

| Variable                                      | Value                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CHROME_WEB_STORE_PUBLISHER_ID`               | The publisher ID                                                                                                  |
| `CHROME_WEB_STORE_SERVICE_ACCOUNT`            | `katip-chrome-web-store@<project ID>.iam.gserviceaccount.com`                                                     |
| `CHROME_WEB_STORE_WORKLOAD_IDENTITY_PROVIDER` | `projects/<project number>/locations/global/workloadIdentityPools/github/providers/katip`                         |
| `CHROME_WEB_STORE_ITEM_ID`                    | The item ID. Set it last: from then on, every `v*` tag uploads its version to the store and submits it for review |

### Later versions

Pushing a `v*` tag runs CI, uploads the tag's store package and submits it for review, to be published once approved. The run succeeds once the submission is waiting for review.

Run the workflow by hand from **Actions → Chrome Web Store → Run workflow**, choosing the tag under **Use workflow from**, to:

- send a tag created on GitHub's release page, which can come without a tag push;
- stage the version once approved, to be published from the Developer Dashboard;
- upload the version only, to be submitted from the Developer Dashboard.

### Moving from the GitHub zip to the store

The store gives Katip its own ID, not the zip's `ipbjfhfabfhcgdaigheeomapmikalpak`, so the store's Katip is another extension. Remove the zip's Katip from `chrome://extensions` before installing from the store: two Katips in one profile share the "Katip" bookmark folder, and each can remove the other's pins. The pins stay in that folder, where the store's Katip finds them, but it starts without the removed one's extension storage (Favorites, Space colors, folder icons, the archive) and settings.
