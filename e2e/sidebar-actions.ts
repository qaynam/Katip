import type { Locator, Page, Worker } from "@playwright/test"

/** Creates bookmarks in order in the folder of the first Space, "Home". Entries without `url` become folders. */
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
    if (home === undefined) throw new Error("the first Space's folder does not exist yet")
    for (const pin of pins) await chrome.bookmarks.create({ parentId: home.id, ...pin })
  }, pins)

/** Opens the local site's pages in tabs, in the given order, without activating them. */
export const openPages = (background: Worker, urls: ReadonlyArray<string>) =>
  background.evaluate(async (urls) => {
    for (const url of urls) await chrome.tabs.create({ url, active: false })
  }, urls)

/**
 * Renders the tabs showing the local site in index order, as path and state,
 * e.g. `"/a pinned"`, `"/b split"`, `"/c active"`.
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

/** Renders the contents of a Space's bookmark folder by title. A folder is `name[contents …]`. */
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

/** The tab names in the temporary tabs, in display order. A split view row yields both of its tabs. */
export const temporaryTitles = (sidebar: Page) =>
  sidebar
    .getByRole("region", { name: "Temporary tabs" })
    .getByRole("listitem")
    .getByRole("button", { name: /^Page \// })

export const isSplitViewAvailable = (background: Worker) =>
  background.evaluate(() => typeof chrome.tabs.createSplit === "function")

/** `ratio` is the drop height within the target: near the top inserts before, near the bottom after, and the middle of a folder drops into it. */
export const dragOnto = async (source: Locator, target: Locator, ratio: number) => {
  const box = await target.boundingBox()
  if (box === null) throw new Error("the drop target is not visible")
  await source.dragTo(target, { targetPosition: { x: box.width * 0.75, y: box.height * ratio } })
}

export const renameRow = async (sidebar: Page, row: Locator, title: string) => {
  await row.dblclick()
  await sidebar.keyboard.press("ControlOrMeta+A")
  await sidebar.keyboard.type(title)
  await sidebar.keyboard.press("Enter")
}

/** Opens the row's context menu and chooses the items in `path` in order; intermediate items open submenus. */
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
