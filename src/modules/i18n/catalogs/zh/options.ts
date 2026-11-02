import type { CatalogSection } from "../../catalog"

export const options: CatalogSection<"options"> = {
  "options.documentTitle": "Katip 设置",
  "options.title": "设置",
  "options.loadFailed": "无法载入设置。请重新加载此页面。",
  "options.saved": "已保存",
  "options.saveFailed": "无法保存更改。请稍候片刻，然后重试。",

  "options.general.heading": "通用",
  "options.language.label": "语言",
  "options.language.automatic": "自动（{language}）",
  "options.language.footnote": "选择“自动”时，将跟随浏览器的语言。",
  "options.about.heading": "关于 Katip",
  "options.version.label": "版本",
  "options.sourceCode.label": "源代码",

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

  "options.spotlight.heading": "Spotlight",
  "options.spotlight.history.label": "同时搜索浏览历史记录",
  "options.spotlight.history.footnote": "开启时会请求读取浏览历史记录的权限。关闭时会移除该权限。",
  "options.spotlight.history.denied": "未获得访问浏览历史记录的权限。",

  "options.shortcuts.heading": "快捷键",
  "options.shortcuts.intro": "按键在 Chrome 的扩展程序快捷键页面中设置。",
  "options.shortcuts.open": "在 Chrome 中更改",
  "options.shortcuts.openFailed": "无法打开 Chrome 的快捷键页面。",
  "options.shortcuts.notSet": "未设置",
  "options.shortcuts.openAndMove.heading": "打开与切换",
  "options.shortcuts.currentTab.heading": "当前标签页",
  "options.shortcuts.copy.footnote":
    "复制快捷键关闭时，按下按键不会有任何反应。若要将该按键用于其他用途，请在 Chrome 的快捷键页面中移除它。",
  "options.commands.openSidePanel": "打开侧边栏",
  "options.commands.openSpotlight": "打开 Spotlight",
  "options.commands.nextTabInSpace": "切换到空间中的下一个标签页",
  "options.commands.previousTabInSpace": "切换到空间中的上一个标签页",
  "options.commands.togglePin": "固定或取消固定标签页",
  "options.commands.copyUrl": "复制网址",
  "options.commands.copyMarkdownLink": "以 Markdown 链接复制网址",

  "options.data.heading": "数据",
  "options.data.export.label": "导出数据",
  "options.data.export.button": "导出",
  "options.data.export.footnote":
    "将空间、已固定的标签页、打开的标签页、收藏和设置保存为 JSON 文件。不包含 GitHub 令牌和归档。",
  "options.data.exported": "已导出",
  "options.data.exportFailed": "无法导出数据。请稍候片刻，然后重试。",
}
