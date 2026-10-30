import type { CatalogSection } from "../../catalog"

export const options: CatalogSection<"options"> = {
  "options.documentTitle": "Katip 设置",
  "options.title": "设置",
  "options.loadFailed": "无法载入设置。请重新加载此页面。",
  "options.saved": "已保存",
  "options.saveFailed": "无法保存更改。请稍候片刻，然后重试。",

  "options.language.label": "语言",
  "options.language.automatic": "自动（{language}）",
  "options.language.footnote": "选择“自动”时，将跟随浏览器的语言。",

  "options.tabs.heading": "标签页",
  "options.newTabsOnTop.label": "在顶部显示新标签页",
  "options.newTabsOnTop.description":
    "关闭后，临时标签页将按 Chrome 标签栏的顺序排列，新标签页会添加到最下方。",
  "options.collapsedFolders.label": "在已折叠的文件夹中显示所有打开的标签页",
  "options.collapsedFolders.description":
    "关闭后，已折叠的文件夹下只显示当前标签页，以及在文件夹折叠期间查看过的标签页。",
  "options.syncTabGroups.label": "将空间与 Chrome 标签页分组同步",
  "options.syncTabGroups.description":
    "在每个窗口中，将每个空间显示为一个标签页分组。在分组上更改名称或颜色不会影响空间，并会在下次同步时还原。同步期间，无法在文件夹中再创建文件夹。",
  "options.splitView.label": "分屏视图",
  "options.splitView.available": "可以使用",
  "options.splitView.unavailable": "此浏览器无法使用（需要 Chrome 155 或更高版本）",

  "options.autoArchive.heading": "归档",
  "options.autoArchive.label": "自动归档闲置的标签页",
  "options.autoArchive.idleTime.label": "闲置多久后归档",
  "options.autoArchive.footnote":
    "超过这段时间未查看的临时标签页会被关闭并保存到归档中，之后可以从归档重新打开。已固定的标签页、收藏的标签页、正在播放音频的标签页以及当前查看的标签页不会被关闭。",

  "options.shortcuts.label": "键盘快捷键",
  "options.shortcuts.open": "在 Chrome 中更改",
  "options.shortcuts.openFailed": "无法打开 Chrome 的快捷键页面。",
  "options.shortcuts.footnote":
    "打开侧边栏、Spotlight 等操作所用的按键，可以在 Chrome 的扩展程序快捷键页面中设置。",

  "options.pageShortcuts.heading": "快捷键",
  "options.pageShortcuts.footnote":
    "在浏览网页时可用。开启时会请求访问所有网站的权限（仅用于接收这些按键）。在 chrome:// 页面、新标签页和 Chrome 应用商店中无法使用。",
  "options.pageShortcuts.denied": "未获得访问所有网站的权限，因此保持关闭。",

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "同时搜索浏览历史记录",
  "options.spotlight.history.footnote": "开启时会请求读取浏览历史记录的权限。关闭时会移除该权限。",
  "options.spotlight.history.denied": "未获得访问浏览历史记录的权限。",

  "options.version.label": "版本",
}
