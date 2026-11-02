import type { CatalogSection } from "../../catalog"

export const manifest: CatalogSection<"manifest"> = {
  "manifest.description": "在侧边栏中按空间整理标签页",
  "manifest.command.openSidePanel": "打开侧边栏",
  "manifest.command.openSpotlight": "打开 Spotlight，搜索标签页、固定项和空间",
  "manifest.command.copyUrl": "复制当前标签页的网址（需在 Katip 设置中开启）",
  "manifest.command.copyMarkdownLink":
    "以 Markdown 链接复制当前标签页的网址（需在 Katip 设置中开启）",
  "manifest.command.togglePin": "固定或取消固定当前标签页",
  "manifest.command.nextTabInSpace": "切换到空间中的下一个标签页",
  "manifest.command.previousTabInSpace": "切换到空间中的上一个标签页",
}
