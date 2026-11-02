import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { IdleMinutes } from "#modules/settings"
import { SpaceId } from "#modules/space"
import { renderSidebar } from "../testing/render-sidebar"
import { archiveEntry, sidebarView, spaceView } from "../testing/view-builders"

const work = spaceView("work")
const hobby = spaceView("hobby")
const archived = [
  archiveEntry("older", { title: "Older article", spaceId: work.id, archivedAt: 1_000 }),
  archiveEntry("newer", { title: "Newer article", spaceId: work.id, archivedAt: 2_000 }),
  archiveEntry("hobby", {
    title: "Hobby article",
    spaceId: SpaceId.make("hobby"),
    archivedAt: 3_000,
  }),
]

const renderArchive = async (overrides: Parameters<typeof sidebarView>[0] = {}) => {
  const rendered = await renderSidebar(
    sidebarView({ spaces: [work, hobby], archive: archived, ...overrides }),
  )
  await fireEvent.click(screen.getByRole("button", { name: "Archive" }))
  return rendered
}

const archiveRegion = () => screen.getByRole("region", { name: "Archive" })
const entryTitles = () =>
  within(archiveRegion())
    .getAllByRole("listitem")
    .map((item) => within(item).getAllByRole("button")[0]?.textContent ?? "")

describe("Archive panel", () => {
  it("lists the active Space's archive, newest first, when opened", async () => {
    await renderArchive()

    const titles = entryTitles()

    expect(titles).toHaveLength(2)
    expect(titles[0]).toContain("Newer article")
    expect(titles[1]).toContain("Older article")
  })

  it("also lists other Spaces' archives when All Spaces is chosen", async () => {
    await renderArchive()

    await fireEvent.click(screen.getByRole("radio", { name: "All Spaces" }))

    expect(entryTitles()[0]).toContain("Hobby article")
  })

  it("restores an entry into this window when clicked", async () => {
    const { connection } = await renderArchive()

    await fireEvent.click(within(archiveRegion()).getByRole("button", { name: /Newer article/ }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RestoreArchiveEntry", windowId: 1, entryId: "newer" },
    ])
  })

  it("removes an entry from the archive with ×", async () => {
    const { connection } = await renderArchive()
    const [newest] = within(archiveRegion()).getAllByRole("listitem")

    await fireEvent.click(
      within(newest as HTMLElement).getByRole("button", { name: "Remove from Archive" }),
    )

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RemoveArchiveEntry", entryId: "newer" },
    ])
  })

  it("says so when the archive is empty", async () => {
    await renderArchive({ archive: [] })

    expect(within(archiveRegion()).getByText("No archived tabs")).toBeTruthy()
  })
})

describe("Auto-archive settings", () => {
  const durationSelect = () =>
    screen.getByRole<HTMLSelectElement>("combobox", { name: "Time before archiving" })
  const optionTexts = () =>
    [...durationSelect().options].map((option) => option.textContent?.trim())
  const selectedText = () => durationSelect().selectedOptions[0]?.textContent?.trim()

  it("turns on with the current time setting", async () => {
    const { connection } = await renderArchive({
      autoArchive: { enabled: false, idleMinutes: IdleMinutes.make(360) },
    })

    await fireEvent.click(
      screen.getByRole("checkbox", { name: "Archive inactive tabs automatically" }),
    )

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "UpdateAutoArchive", enabled: true, idleMinutes: 360 },
    ])
  })

  it("lists each time option in the largest unit that divides it evenly", async () => {
    await renderArchive({ autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(360) } })

    expect(optionTexts()).toStrictEqual([
      "30 minutes",
      "1 hour",
      "3 hours",
      "6 hours",
      "12 hours",
      "1 day",
      "3 days",
      "1 week",
    ])
  })

  it("selects the currently configured time", async () => {
    await renderArchive({ autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(3 * 1440) } })

    expect(selectedText()).toBe("3 days")
  })

  it("changes to the chosen number of minutes", async () => {
    const { connection } = await renderArchive({
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(360) },
    })

    await fireEvent.change(durationSelect(), { target: { value: "1440" } })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "UpdateAutoArchive", enabled: true, idleMinutes: 1440 },
    ])
  })

  it("shows a saved value that isn't among the options as selected", async () => {
    await renderArchive({ autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) } })

    expect(selectedText()).toBe("90 minutes")
    expect(optionTexts().slice(0, 3)).toStrictEqual(["30 minutes", "1 hour", "90 minutes"])
  })

  it("can't change the time while turned off", async () => {
    await renderArchive({ autoArchive: { enabled: false, idleMinutes: IdleMinutes.make(360) } })

    expect(durationSelect().disabled).toBe(true)
  })
})
