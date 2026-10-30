import type { Catalog } from "../catalog"

export const zh: Catalog = {
  "common.home": "主页",
  "common.spaceNumbered": "空间 {n}",
  "common.newFolder": "新建文件夹",
  "common.newTab": "新标签页",
  "common.tabCount": { other: "{count} 个标签页" },
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.delete": "删除",
  "common.rename": "重命名",

  "options.documentTitle": "Katip 设置",
  "options.title": "设置",
  "options.loadFailed": "无法载入设置。请重新加载此页面。",
  "options.saved": "已保存",
  "options.saveFailed": "无法保存更改。请稍候片刻，然后重试。",
  "options.stepper.increment": "增加",
  "options.stepper.decrement": "减少",

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

  "options.autoArchive.heading": "归档",
  "options.autoArchive.label": "自动归档闲置的标签页",
  "options.autoArchive.idleTime.label": "闲置多久后归档",
  "options.autoArchive.idleTime.unit": { other: "分钟" },
  "options.autoArchive.idleTime.empty": "请输入分钟数。",
  "options.autoArchive.idleTime.invalid": "请输入不小于 1 的整数。",
  "options.autoArchive.footnote":
    "超过这段时间未查看的临时标签页会被关闭并保存到归档中，之后可以从归档重新打开。已固定的标签页、收藏的标签页、正在播放音频的标签页以及当前查看的标签页不会被关闭。",

  "options.shortcuts.label": "键盘快捷键",
  "options.shortcuts.open": "在 Chrome 中更改",
  "options.shortcuts.openFailed": "无法打开 Chrome 的快捷键页面。",
  "options.shortcuts.footnote":
    "打开侧边栏、Spotlight 等操作所用的按键，可以在 Chrome 的扩展程序快捷键页面中设置。",

  "options.version.label": "版本",
}
