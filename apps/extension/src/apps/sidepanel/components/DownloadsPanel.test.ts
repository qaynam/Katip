import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"
import type { MemoryDownloadsOptions } from "../connection/memory-downloads"
import { DownloadId, type Download, type DownloadProgress } from "../logic/downloads"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView } from "../testing/view-builders"

const KB = 1024

const download = (
  id: number,
  fileName: string,
  progress: DownloadProgress,
  options: { readonly site?: string; readonly mime?: string; readonly startedAt?: number } = {},
): Download => ({
  id: DownloadId.make(id),
  fileName,
  url: `https://${options.site ?? "files.example.com"}/${encodeURIComponent(fileName)}`,
  mime: options.mime ?? "",
  startedAt: options.startedAt ?? id * 1_000,
  progress,
})

const report = download(1, "report.pdf", { _tag: "Complete", bytes: 2 * KB })
const installer = download(2, "installer.dmg", {
  _tag: "InProgress",
  receivedBytes: KB,
  totalBytes: 4 * KB,
})
const photo = download(3, "photo.heic", { _tag: "Deleted" }, { site: "photos.example.net" })

const view = sidebarView({ spaces: [spaceView("work")] })

const downloadsButton = () => screen.getByRole("button", { name: "Downloads" })
const downloadsRegion = () => screen.getByRole("region", { name: "Downloads" })
const searchField = () =>
  screen.getByRole<HTMLInputElement>("searchbox", { name: "Search Downloads" })
const rows = () => within(downloadsRegion()).queryAllByRole("listitem")
const shownNames = () => rows().map((row) => within(row).getAllByText(/./)[0]?.textContent)
const rowOf = (fileName: string) =>
  rows().find((row) => row.textContent?.includes(fileName)) ?? null

const renderWithDownloads = (downloads: MemoryDownloadsOptions = {}) =>
  renderSidebar(view, { downloads: { downloads: [report, installer, photo], ...downloads } })

const showDownloads = async (downloads: MemoryDownloadsOptions = {}) => {
  const rendered = await renderWithDownloads(downloads)
  await fireEvent.click(downloadsButton())
  await tick()
  return rendered
}

const search = async (query: string) => {
  await fireEvent.input(searchField(), { target: { value: query } })
  await tick()
}

describe("The Downloads button", () => {
  it("asks for access to downloads, then shows them in place of the Space's tabs", async () => {
    const { downloads } = await showDownloads()

    expect([
      downloads.requestCount,
      screen.queryByRole("region", { name: "Downloads" }) !== null,
      screen.queryByRole("region", { name: "Temporary tabs" }),
    ]).toStrictEqual([1, true, null])
  })

  it("opens the browser's downloads page when access is refused", async () => {
    const { connection } = await showDownloads({ decide: () => false })

    expect([
      commandsOf(connection.sentCommands, "OpenDownloadsPage"),
      screen.queryByRole("region", { name: "Downloads" }),
    ]).toStrictEqual([[{ _tag: "OpenDownloadsPage", windowId: 1 }], null])
  })

  it("after a refusal, opens the downloads page without asking again", async () => {
    const { connection, downloads } = await renderWithDownloads({ access: "Declined" })

    await fireEvent.click(downloadsButton())

    expect([
      downloads.requestCount,
      commandsOf(connection.sentCommands, "OpenDownloadsPage").length,
    ]).toStrictEqual([0, 1])
  })

  it("after a refusal, can be asked again from its menu, and then shows the downloads", async () => {
    await renderWithDownloads({ access: "Declined" })
    await fireEvent.contextMenu(downloadsButton())

    await fireEvent.click(screen.getByRole("menuitem", { name: "Show Downloads in Sidebar" }))
    await tick()

    expect(downloadsRegion()).toBeTruthy()
  })
})

describe("The Downloads view", () => {
  it("takes the place of the Space's search field, Favorites, header and Space switcher", async () => {
    await showDownloads()

    expect([
      screen.queryByRole("button", { name: "Space menu" }),
      screen.queryByRole("navigation", { name: "Switch Space" }),
      screen.queryByRole("button", { name: "Close Sidebar" }),
      screen.queryByRole("heading", { name: "Downloads" }) !== null,
    ]).toStrictEqual([null, null, null, true])
  })

  it("has its search field ready to type in when shown", async () => {
    await showDownloads()

    expect(document.activeElement).toBe(searchField())
  })

  it("gives the Space back with Close Downloads", async () => {
    await showDownloads()

    await fireEvent.click(screen.getByRole("button", { name: "Close Downloads" }))

    expect([
      screen.queryByRole("region", { name: "Downloads" }),
      screen.queryByRole("navigation", { name: "Switch Space" }) !== null,
      screen.queryByRole("region", { name: "Temporary tabs" }) !== null,
    ]).toStrictEqual([null, true, true])
  })

  it("lists the downloads started last first, each with its site and how far it got", async () => {
    await showDownloads()

    const shown = rows().map((row) =>
      within(row)
        .getAllByText(/./)
        .map((piece) => piece.textContent),
    )

    expect(shown).toStrictEqual([
      ["photo.heic", "photos.example.net", "Deleted"],
      ["installer.dmg", "files.example.com", "1 KB of 4 KB"],
      ["report.pdf", "files.example.com", "2 KB"],
    ])
  })

  it("shows every row alike whatever its state, naming the state and flagging a failure", async () => {
    const broken = download(4, "dataset.csv", { _tag: "Failed", canResume: false })
    await showDownloads({ downloads: [report, photo, broken] })

    expect([
      new Set(rows().map((row) => row.className)).size,
      within(rowOf("photo.heic") as HTMLElement).getByText("Deleted").dataset["tone"],
      within(rowOf("dataset.csv") as HTMLElement).getByText("Failed").dataset["tone"],
    ]).toStrictEqual([1, "State", "Alert"])
  })

  it("shows how far a running download got on a bar", async () => {
    await showDownloads()

    const bar = within(downloadsRegion()).getByRole<HTMLProgressElement>("progressbar", {
      name: "installer.dmg",
    })

    expect([bar.value, bar.max]).toStrictEqual([KB, 4 * KB])
  })

  it("opens a finished download's file when it is clicked", async () => {
    const { downloads } = await showDownloads()

    await fireEvent.click(within(downloadsRegion()).getByRole("button", { name: /report\.pdf/ }))

    expect(downloads.opened).toStrictEqual([report.id])
  })

  it("can't open a file that is gone or still downloading", async () => {
    await showDownloads()

    const openable = within(downloadsRegion())
      .getAllByRole("button")
      .filter((button) => /photo\.heic|installer\.dmg/.test(button.textContent ?? ""))

    expect(openable).toStrictEqual([])
  })

  it("shows a finished file in its folder", async () => {
    const { downloads } = await showDownloads()

    await fireEvent.click(
      within(rowOf("report.pdf") as HTMLElement).getByRole("button", { name: "Show in Folder" }),
    )

    expect(downloads.shown).toStrictEqual([report.id])
  })

  it("on macOS, shows a finished file in Finder", async () => {
    await showDownloads({ fileManager: "Finder" })

    expect(
      within(rowOf("report.pdf") as HTMLElement).queryByRole("button", { name: "Show in Finder" }),
    ).not.toBeNull()
  })

  it("pauses a running download, and resumes it", async () => {
    await showDownloads()

    await fireEvent.click(
      within(rowOf("installer.dmg") as HTMLElement).getByRole("button", { name: "Pause" }),
    )
    await tick()
    const whilePaused = rowOf("installer.dmg")?.textContent ?? ""
    await fireEvent.click(
      within(rowOf("installer.dmg") as HTMLElement).getByRole("button", { name: "Resume" }),
    )
    await tick()

    expect([whilePaused.includes("Paused"), rowOf("installer.dmg")?.textContent]).toStrictEqual([
      true,
      expect.not.stringContaining("Paused"),
    ])
  })

  it("cancels a running download", async () => {
    await showDownloads()

    await fireEvent.click(
      within(rowOf("installer.dmg") as HTMLElement).getByRole("button", { name: "Cancel" }),
    )
    await tick()

    expect(rowOf("installer.dmg")?.textContent).toContain("Canceled")
  })

  it("keeps up with downloads that start and move on while it is shown", async () => {
    const { downloads } = await showDownloads()

    downloads.put({ ...installer, progress: { _tag: "Complete", bytes: 4 * KB } })
    downloads.put(
      download(4, "slides.key", { _tag: "InProgress", receivedBytes: 0, totalBytes: null }),
    )
    await tick()

    expect([rowOf("installer.dmg")?.textContent, shownNames()[0]]).toStrictEqual([
      expect.stringContaining("4 KB"),
      "slides.key",
    ])
  })

  it("opens the browser's downloads page from Show All Downloads", async () => {
    const { connection } = await showDownloads()

    await fireEvent.click(screen.getByRole("button", { name: "Show All Downloads" }))

    expect(commandsOf(connection.sentCommands, "OpenDownloadsPage")).toStrictEqual([
      { _tag: "OpenDownloadsPage", windowId: 1 },
    ])
  })

  it("says so when nothing has been downloaded", async () => {
    await showDownloads({ downloads: [] })

    expect(within(downloadsRegion()).getByText("No downloads")).toBeTruthy()
  })
})

describe("Searching downloads", () => {
  it("narrows the list to the downloads whose name holds what is typed", async () => {
    await showDownloads()

    await search("report")

    expect(shownNames()).toStrictEqual(["report.pdf"])
  })

  it("finds downloads by the site they came from", async () => {
    await showDownloads()

    await search("photos.example")

    expect(shownNames()).toStrictEqual(["photo.heic"])
  })

  it("forgives a typo in a longer word", async () => {
    await showDownloads()

    await search("instaler")

    expect(shownNames()).toStrictEqual(["installer.dmg"])
  })

  it("finds a download older than the last 30", async () => {
    const recent = Array.from({ length: 40 }, (_, index) =>
      download(index + 10, `page-${index}.html`, { _tag: "Complete", bytes: KB }),
    )
    await showDownloads({ downloads: [report, ...recent] })

    await search("report")

    expect(shownNames()).toStrictEqual(["report.pdf"])
  })

  it("lists only the kind chosen, told by the file's extension or type", async () => {
    const clip = download(4, "clip", { _tag: "Complete", bytes: KB }, { mime: "video/mp4" })
    await showDownloads({ downloads: [report, installer, photo, clip] })

    await fireEvent.click(screen.getByRole("radio", { name: "Videos" }))
    const videos = shownNames()
    await fireEvent.click(screen.getByRole("radio", { name: "Documents" }))
    const documents = shownNames()
    await fireEvent.click(screen.getByRole("radio", { name: "All" }))

    expect([videos, documents, shownNames().length]).toStrictEqual([["clip"], ["report.pdf"], 4])
  })

  it("says no download matches when none does", async () => {
    await showDownloads()

    await search("zzzz")

    expect(within(downloadsRegion()).getByText("No matching downloads")).toBeTruthy()
  })

  it("clears the search with Escape, and gives the Space back with a second Escape", async () => {
    await showDownloads()
    await search("report")

    await fireEvent.keyDown(searchField(), { key: "Escape" })
    const afterFirst = [searchField().value, shownNames().length]
    await fireEvent.keyDown(searchField(), { key: "Escape" })

    expect([afterFirst, screen.queryByRole("region", { name: "Downloads" })]).toStrictEqual([
      ["", 3],
      null,
    ])
  })

  it("moves through the results with the arrow keys and opens a finished file with Enter", async () => {
    const { downloads } = await showDownloads()

    await fireEvent.keyDown(searchField(), { key: "ArrowDown" })
    await fireEvent.keyDown(searchField(), { key: "ArrowDown" })
    await fireEvent.keyDown(searchField(), { key: "Enter" })

    expect(downloads.opened).toStrictEqual([report.id])
  })
})
