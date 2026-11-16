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
  startedAt = id * 1_000,
): Download => ({
  id: DownloadId.make(id),
  fileName,
  url: `https://files.example.com/${encodeURIComponent(fileName)}`,
  startedAt,
  progress,
})

const report = download(1, "report.pdf", { _tag: "Complete", bytes: 2 * KB })
const installer = download(2, "installer.dmg", {
  _tag: "InProgress",
  receivedBytes: KB,
  totalBytes: 4 * KB,
})
const photo = download(3, "photo.heic", { _tag: "Deleted" })

const view = sidebarView({ spaces: [spaceView("work")] })

const downloadsButton = () => screen.getByRole("button", { name: "Downloads" })
const downloadsRegion = () => screen.getByRole("region", { name: "Downloads" })
const rowOf = (fileName: string) =>
  within(downloadsRegion())
    .getAllByRole("listitem")
    .find((row) => row.textContent?.includes(fileName)) ?? null

const renderWithDownloads = (downloads: MemoryDownloadsOptions = {}) =>
  renderSidebar(view, { downloads: { downloads: [report, installer, photo], ...downloads } })

const showDownloads = async (downloads: MemoryDownloadsOptions = {}) => {
  const rendered = await renderWithDownloads(downloads)
  await fireEvent.click(downloadsButton())
  await tick()
  return rendered
}

describe("The Downloads button", () => {
  it("asks for access to downloads, then shows them in place of the Space's tabs", async () => {
    const { downloads } = await showDownloads()

    expect([
      downloads.requestCount,
      downloadsButton().getAttribute("aria-pressed"),
      screen.queryByRole("region", { name: "Downloads" }) !== null,
      screen.queryByRole("region", { name: "Temporary tabs" }),
    ]).toStrictEqual([1, "true", true, null])
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

  it("goes back to the Space's tabs when clicked again", async () => {
    await showDownloads()

    await fireEvent.click(downloadsButton())

    expect([
      screen.queryByRole("region", { name: "Downloads" }),
      screen.queryByRole("region", { name: "Temporary tabs" }) !== null,
    ]).toStrictEqual([null, true])
  })
})

describe("The Downloads panel", () => {
  it("lists the downloads started last first, each with its site and how far it got", async () => {
    await showDownloads()

    const rows = within(downloadsRegion())
      .getAllByRole("listitem")
      .map((row) =>
        within(row)
          .getAllByText(/./)
          .map((piece) => piece.textContent),
      )

    expect(rows).toStrictEqual([
      ["photo.heic", "files.example.com", "Deleted"],
      ["installer.dmg", "files.example.com", "1 KB of 4 KB"],
      ["report.pdf", "files.example.com", "2 KB"],
    ])
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

    expect([
      rowOf("installer.dmg")?.textContent,
      within(downloadsRegion()).getAllByRole("listitem")[0]?.textContent,
    ]).toStrictEqual([expect.stringContaining("4 KB"), expect.stringContaining("slides.key")])
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

  it("goes back to the Space's tabs with Close Downloads", async () => {
    await showDownloads()

    await fireEvent.click(screen.getByRole("button", { name: "Close Downloads" }))

    expect(screen.queryByRole("region", { name: "Downloads" })).toBeNull()
  })
})
