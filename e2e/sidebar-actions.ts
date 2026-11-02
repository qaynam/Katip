import type { Locator, Page, Worker } from "@playwright/test"

/** 最初の Space「Home」のフォルダに、ブックマークを上から順に作る。`url` の無いものはフォルダになる */
export const seedPins = (
  background: Worker,
  pins: ReadonlyArray<{ readonly title: string; readonly url?: string }>,
) =>
  background.evaluate(async (pins) => {
    const [root] = await chrome.bookmarks.search({ title: "Katip" })
    const home =
      root === undefined
        ? undefined
        : (await chrome.bookmarks.getChildren(root.id)).find((node) => node.title === "Home")
    if (home === undefined) throw new Error("最初の Space のフォルダがまだ作られていない")
    for (const pin of pins) await chrome.bookmarks.create({ parentId: home.id, ...pin })
  }, pins)

/** `ratio` は落とす位置の高さの割合。行の上寄りは前、下寄りは後ろ、フォルダの中ほどは中に入れる */
export const dragOnto = async (source: Locator, target: Locator, ratio: number) => {
  const box = await target.boundingBox()
  if (box === null) throw new Error("ドロップ先が表示されていない")
  await source.dragTo(target, { targetPosition: { x: box.width * 0.75, y: box.height * ratio } })
}

export const renameRow = async (sidebar: Page, row: Locator, title: string) => {
  await row.dblclick()
  await sidebar.keyboard.press("ControlOrMeta+A")
  await sidebar.keyboard.type(title)
  await sidebar.keyboard.press("Enter")
}
