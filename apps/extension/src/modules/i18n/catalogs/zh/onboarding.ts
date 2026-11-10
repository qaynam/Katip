import type { CatalogSection } from "../../catalog"

export const onboarding: CatalogSection<"onboarding"> = {
  "onboarding.documentTitle": "欢迎使用 Katip",
  "onboarding.progress": "第 {current} 步，共 {total} 步",
  "onboarding.continue": "继续",
  "onboarding.back": "返回",
  "onboarding.skip": "跳过",

  "onboarding.welcome.title": "欢迎使用 Katip",
  "onboarding.welcome.lead":
    "空间、固定的标签页和 Spotlight，都在 Chrome 的侧边栏里。设置只需一分钟。",
  "onboarding.welcome.start": "开始",

  "onboarding.sidePanel.title": "Katip 在侧边栏中",
  "onboarding.sidePanel.body":
    "点击工具栏中的 Katip 图标即可打开。为了随时看到它，请在拼图形状的扩展程序菜单中把图标固定下来。",
  "onboarding.sidePanel.shortcut": "也可以按",
  "onboarding.sidePanel.open": "打开侧边栏",

  "onboarding.shortcuts.title": "检查快捷键",
  "onboarding.shortcuts.body":
    "Chrome 只把一个按键分配给第一个请求它的扩展程序。如果另一个扩展程序先用了，Katip 的快捷键就不会被分配；即使 Chrome 的快捷键页面仍然显示它，也不起作用。",
  "onboarding.shortcuts.notSet": "未设置",
  "onboarding.shortcuts.refused":
    "Chrome 没有把 {key} 分配给 Katip，很可能是另一个扩展程序在使用它。",
  "onboarding.shortcuts.copyNote": "复制相关的快捷键在这里打开之前不会起作用。",
  "onboarding.shortcuts.edit": "在 Chrome 中修改",

  "onboarding.arcImport.title": "从 Arc 过来？",
  "onboarding.arcImport.body":
    "可以带上你的空间及其中固定的标签页、文件夹和分屏视图，以及收藏。在设置中选择 Arc 的侧边栏文件，它只会在你的浏览器中读取。",
  "onboarding.arcImport.open": "从 Arc 导入…",

  "onboarding.favorites.title": "收藏在每个空间都在",
  "onboarding.favorites.body":
    "把标签页拖到侧边栏顶部，或右键点击并选择“添加到收藏”。无论你在哪个空间，收藏都在同一个地方。",

  "onboarding.themes.title": "每个空间一种颜色",
  "onboarding.themes.body":
    "打开空间名称旁边的空间菜单，选择“编辑主题”。侧边栏会换上你选的颜色，让你一眼就能分清各个空间。",

  "onboarding.liveFolders.title": "会自己更新的文件夹",
  "onboarding.liveFolders.body":
    "在空间菜单中选择“添加实时文件夹”，即可关注 Gmail 中的未读邮件，或 GitHub 上的审查请求、拉取请求、议题和提及。它们会自动刷新。",

  "onboarding.bangs.title": "用 bang 搜索任何网站",
  "onboarding.bangs.body":
    "在 Spotlight 中输入 ! 和网站的简称，例如 GitHub 用 !gh katip，维基百科用 !w。你也可以在设置中添加自己的命令。",

  "onboarding.done.title": "一切就绪",
  "onboarding.done.body": "你可以在 Katip 的设置中再次查看这个导览。",
  "onboarding.done.openKatip": "打开 Katip",
  "onboarding.done.close": "关闭",
}
