import type { CatalogSection } from "../../catalog"

export const manifest: CatalogSection<"manifest"> = {
  "manifest.description": "サイドパネルで Space ごとにタブを整理する",
  "manifest.command.openSidePanel": "サイドパネルを開く",
  "manifest.command.openSpotlight": "Spotlight を開いてタブ・ピン留め・Space を検索する",
  "manifest.command.copyUrl":
    "アクティブなタブの URL をコピーする（Katip の設定でオンにしたときだけ）",
  "manifest.command.copyMarkdownLink":
    "アクティブなタブの URL を Markdown のリンクとしてコピーする（Katip の設定でオンにしたときだけ）",
  "manifest.command.togglePin": "アクティブなタブのピン留めを切り替える",
  "manifest.command.nextTabInSpace": "Space の中で次のタブへ移る",
  "manifest.command.previousTabInSpace": "Space の中で前のタブへ移る",
}
