type BuildMode = "development" | "production"

export const buildManifest = (mode: BuildMode): chrome.runtime.ManifestV3 => ({
  manifest_version: 3,
  name: mode === "development" ? "Katip (dev)" : "Katip",
  version: "0.1.0",
  description: "サイドパネルで Space ごとにタブを整理する",
  minimum_chrome_version: "120",
  permissions: ["tabs", "tabGroups", "sidePanel", "storage", "bookmarks", "alarms", "favicon"],
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
    "next-tab-in-space": { description: "Space の中で次のタブへ移る" },
    "previous-tab-in-space": { description: "Space の中で前のタブへ移る" },
  },
  // 拡張ページはブラウザ自動操作ツールから開けないため、開発ビルドに限り localhost の
  // 検証用ページから background へ接続できるようにする
  ...(mode === "development" && {
    externally_connectable: { matches: ["http://localhost/*"] },
  }),
})
