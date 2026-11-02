type BuildMode = "development" | "production"

// この公開鍵から拡張 ID が hggfdjnidgfpigakapgkgolnjemijaed に決まる
const DEVELOPMENT_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1NcVH3QU/wS6acXcUvFkkqNLkaAEPQh6F83b3us2DoqCNLlsArSL2k9AEocUbX3Pzzz9Zr6kWbwesAVcrsvsnn0IO206pbboppASdYB0N5beGkug7aA9ZkzIck2s4INm5U5Dd/NdNLiTjtXz7yfozehxBuYanzovkulYwVbUXvc8437BZAasznkP2CArE4yZC/Agwmaoz/W0l7V1MEbsR0skCSOJKcsGmhZUqlfAh5uTIK5Uvk4IYIuRNJjWKcHyH3qbLtrm8ELMVfNSvEdnSzm2QCf93dqHahEWhKZcMokEJQpnG1l1asuxNamSAOiPc325D1Ca2bXyTKNdornDyQIDAQAB"

// semver のプレリリースやビルドメタデータを付けた版では、Chrome が拡張を読み込まない。
// 付いた部分を落として通すと、別の版と同じ番号で配りかねないので、マニフェストを作らずに止める
const isChromeExtensionVersion = (version: string): boolean => {
  const parts = version.split(".")
  return (
    parts.length <= 4 && parts.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) <= 65535)
  )
}

export const buildManifest = (mode: BuildMode, version: string): chrome.runtime.ManifestV3 => {
  if (!isChromeExtensionVersion(version)) {
    throw new Error(
      `版 "${version}" は、0〜65535 の整数を点で 4 つまでつないだ形でないので、拡張の版にできない`,
    )
  }
  return manifestOf(mode, version)
}

const manifestOf = (mode: BuildMode, version: string): chrome.runtime.ManifestV3 => ({
  manifest_version: 3,
  name: mode === "development" ? "Katip (dev)" : "Katip",
  version,
  description: "サイドパネルで Space ごとにタブを整理する",
  homepage_url: "https://github.com/qaynam/Katip",
  minimum_chrome_version: "120",
  permissions: [
    "tabs",
    "tabGroups",
    "sidePanel",
    "storage",
    "bookmarks",
    "alarms",
    "favicon",
    "offscreen",
    "clipboardWrite",
    "search",
    "scripting",
    // キーボードショートカットで操作したタブにだけ、一時的にスクリプトを注入できる。すべての
    // サイトへのアクセスを許可していなくても、コピーしたことをそのページに表示できる
    "activeTab",
  ],
  // Spotlight で閲覧履歴も探すとき。設定で有効にしたときにだけ許可を求める
  optional_permissions: ["history"],
  // Live folder sources. Asked for only when a live folder needs one, so people who don't use
  // live folders are never asked
  optional_host_permissions: [
    "https://mail.google.com/*",
    "https://github.com/*",
    "https://api.github.com/*",
  ],
  side_panel: { default_path: "sidepanel/index.html" },
  action: { default_title: "Katip" },
  background: { service_worker: "background.js", type: "module" },
  options_page: "options/index.html",
  commands: {
    _execute_action: {
      suggested_key: { default: "Alt+S" },
      description: "サイドパネルを開く",
    },
    "quick-pin-toggle": {
      suggested_key: { default: "Alt+D" },
      description: "アクティブなタブをピン留め／ピン解除する",
    },
    "open-spotlight": {
      suggested_key: { default: "Alt+T" },
      description: "Spotlight を開いてタブ・ピン・Space を検索する",
    },
    // Chrome が既定のキーを割り当てるのは 4 つまでなので、使う頻度の低いものは各自で割り当てる
    "next-tab-in-space": { description: "Space の中で次のタブへ移る" },
    "previous-tab-in-space": { description: "Space の中で前のタブへ移る" },
    "copy-current-url": { description: "アクティブなタブの URL をコピーする" },
    "copy-current-url-as-markdown": {
      description: "アクティブなタブの URL を Markdown のリンクとしてコピーする",
    },
  },
  // 拡張ページはブラウザ自動操作ツールから開けないため、開発ビルドに限り localhost の
  // 検証用ページから background へ接続できるようにする。接続先の ID を読み込んだ場所に
  // よらず固定するため、開発用の公開鍵も載せる（対応する秘密鍵は持たない）
  ...(mode === "development" && {
    externally_connectable: { matches: ["http://localhost/*"] },
    key: DEVELOPMENT_PUBLIC_KEY,
  }),
})
