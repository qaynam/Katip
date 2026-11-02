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

/** 手元のサイトのページを、渡した順に、アクティブにせずタブで開く。 */
export const openPages = (background: Worker, urls: ReadonlyArray<string>) =>
  background.evaluate(async (urls) => {
    for (const url of urls) await chrome.tabs.create({ url, active: false })
  }, urls)

/**
 * 手元のサイトを開いているタブを、index 順にパスと状態で表す。
 * 例: `"/a pinned"`、`"/b split"`、`"/c active"`
 */
export const pagesInBrowser = (background: Worker, site: string) =>
  background.evaluate(
    async (site) =>
      (await chrome.tabs.query({}))
        .filter((tab) => (tab.pendingUrl ?? tab.url ?? "").startsWith(site))
        .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
        .map((tab) =>
          [
            new URL(tab.pendingUrl ?? tab.url ?? "").pathname,
            ...(tab.pinned ? ["pinned"] : []),
            ...((tab as { splitViewId?: number }).splitViewId === undefined ||
            (tab as { splitViewId?: number }).splitViewId === -1
              ? []
              : ["split"]),
            ...(tab.active ? ["active"] : []),
          ].join(" "),
        ),
    site,
  )

/** Space のブックマークのフォルダの中身を、タイトルで表す。フォルダは `名前[中身 …]` */
export const pinnedBookmarks = (background: Worker, spaceName = "Home") =>
  background.evaluate(async (spaceName) => {
    const [root] = await chrome.bookmarks.search({ title: "Katip" })
    if (root === undefined) return null
    const space = (await chrome.bookmarks.getChildren(root.id)).find(
      (node) => node.title === spaceName,
    )
    if (space === undefined) return null
    const [tree] = await chrome.bookmarks.getSubTree(space.id)
    const render = (node: chrome.bookmarks.BookmarkTreeNode): string =>
      node.url === undefined
        ? `${node.title}[${(node.children ?? []).map(render).join(" ")}]`
        : node.title
    return (tree?.children ?? []).map(render)
  }, spaceName)

/** 一時タブの領域に表示されている順の、タブの名前の行。分割ビューの行は 2 つのタブに分かれる */
export const temporaryTitles = (sidebar: Page) =>
  sidebar
    .getByRole("region", { name: "Temporary tabs" })
    .getByRole("listitem")
    .getByRole("button", { name: /^Page \// })

export const isSplitViewAvailable = (background: Worker) =>
  background.evaluate(() => typeof chrome.tabs.createSplit === "function")

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

/** 行を右クリックしてメニューを開き、`path` の項目を順に選ぶ。サブメニューは途中の項目で開く */
export const chooseFromMenu = async (
  sidebar: Page,
  row: Locator,
  ...path: ReadonlyArray<string>
) => {
  await row.click({ button: "right" })
  for (const item of path) {
    await sidebar.getByRole("menu").getByRole("menuitem", { name: item, exact: true }).click()
  }
}
