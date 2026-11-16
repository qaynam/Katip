import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SpaceName } from "#modules/space"
import type { SidebarCommand, SidebarView } from "#protocol"
import type { CommandResponse } from "./connection/memory-connection"
import { DownloadId, type Download } from "./logic/downloads"
import { commandsOf, renderSidebar } from "./testing/render-sidebar"
import { sidebarView, spaceView } from "./testing/view-builders"

const work = spaceView("work", { name: SpaceName.make("Work") })
const hobby = spaceView("hobby", { name: SpaceName.make("Hobby") })
const reading = spaceView("reading", { name: SpaceName.make("Reading") })
const spaces = [work, hobby, reading]

const report: Download = {
  id: DownloadId.make(1),
  fileName: "report.pdf",
  url: "https://files.example.com/report.pdf",
  mime: "application/pdf",
  startedAt: 1_000,
  progress: { _tag: "Complete", bytes: 2_048 },
}

// Swipes closer together than the cooldown count as one, so each swipe comes a second later
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
})

afterEach(() => {
  vi.useRealTimers()
})

const swipe = async (deltaX: number) => {
  vi.setSystemTime(Date.now() + 1_000)
  await fireEvent.wheel(screen.getByRole("main"), { deltaX, deltaY: 0 })
  await tick()
}

const toNext = () => swipe(40)
const toPrevious = () => swipe(-40)

const nameField = () => screen.queryByRole<HTMLInputElement>("textbox", { name: "Space name" })

// Like the background, shows the Space switched to, or the one created at the end
const respondLikeBackground = (
  command: SidebarCommand,
  current: SidebarView | null,
): CommandResponse => {
  const succeeded = { _tag: "Succeeded", createdBookmarkId: null } as const
  if (current === null) return { outcome: succeeded }
  if (command._tag === "SwitchSpace") {
    return { outcome: succeeded, view: { ...current, activeSpaceId: command.spaceId } }
  }
  if (command._tag === "CreateSpace") {
    const created = spaceView("created", { name: command.name ?? SpaceName.make("Space 4") })
    return {
      outcome: succeeded,
      view: { ...current, spaces: [...current.spaces, created], activeSpaceId: created.id },
    }
  }
  return { outcome: succeeded }
}

describe("Swiping between Spaces", () => {
  it("switches to the next Space on a swipe to the right", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces }))

    await toNext()

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "hobby" },
    ])
  })

  it("switches to the previous Space on a swipe to the left", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: hobby.id }))

    await toPrevious()

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "work" },
    ])
  })

  it("doesn't switch on horizontal scrolling over the Space marks", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces }))
    const marks = screen.getByRole("navigation", { name: "Switch Space" })

    await fireEvent.wheel(within(marks).getByRole("list"), { deltaX: 40, deltaY: 0 })

    expect(connection.sentCommands).toStrictEqual([])
  })

  it("doesn't switch while the theme picker is open", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces }))
    await fireEvent.click(screen.getByRole("button", { name: "Space menu" }))
    await fireEvent.click(screen.getByRole("menuitem", { name: "Edit Theme" }))

    await toNext()

    expect(commandsOf(connection.sentCommands, "SwitchSpace")).toStrictEqual([])
  })
})

describe("Swiping past the last Space", () => {
  it("shows a new Space to name, named like the next numbered Space, without creating it", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }))

    await toNext()

    expect([nameField()?.value, commandsOf(connection.sentCommands, "CreateSpace")]).toStrictEqual([
      "Space 4",
      [],
    ])
  })

  it("creates exactly one Space, with the confirmed name, once the name is confirmed", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }), {
      respond: respondLikeBackground,
    })
    await toNext()

    await fireEvent.input(nameField() as HTMLElement, { target: { value: "Travel" } })
    await fireEvent.submit(nameField() as HTMLElement)
    await tick()

    expect(commandsOf(connection.sentCommands, "CreateSpace")).toMatchObject([
      { _tag: "CreateSpace", windowId: 1, name: "Travel" },
    ])
    expect(screen.getByRole("heading", { name: "Travel" })).toBeTruthy()
  })

  it("creates no Space when the new Space is given up with Esc", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }))
    await toNext()

    await fireEvent.keyDown(nameField() as HTMLElement, { key: "Escape" })

    expect([commandsOf(connection.sentCommands, "CreateSpace"), nameField()]).toStrictEqual([
      [],
      null,
    ])
    expect(screen.getByRole("heading", { name: "Reading" })).toBeTruthy()
  })

  it("creates no Space when swiping back from the new Space", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }))
    await toNext()

    await toPrevious()

    expect([connection.sentCommands, nameField()]).toStrictEqual([[], null])
    expect(screen.getByRole("heading", { name: "Reading" })).toBeTruthy()
  })

  it("creates no Space when focus leaves the new Space", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }))
    await toNext()

    await fireEvent.focusOut(nameField() as HTMLElement, { relatedTarget: null })

    expect([commandsOf(connection.sentCommands, "CreateSpace"), nameField()]).toStrictEqual([
      [],
      null,
    ])
  })

  it("doesn't create a Space with an empty name", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }))
    await toNext()

    await fireEvent.input(nameField() as HTMLElement, { target: { value: "  " } })
    await fireEvent.submit(nameField() as HTMLElement)

    expect(commandsOf(connection.sentCommands, "CreateSpace")).toStrictEqual([])
  })

  it("marks the new Space after the Space marks while it's shown", async () => {
    await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }))
    const marks = screen.getByRole("navigation", { name: "Switch Space" })

    await toNext()

    expect([
      within(marks).getByRole("img", { name: "New Space" }).getAttribute("aria-current"),
      within(marks).getByRole("button", { name: "Reading" }).getAttribute("aria-current"),
    ]).toStrictEqual(["true", null])
  })

  it("goes no further than the new Space", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: reading.id }))
    await toNext()

    await toNext()

    expect([connection.sentCommands, nameField() !== null]).toStrictEqual([[], true])
  })
})

describe("Swiping past the first Space", () => {
  it("shows Downloads without switching Spaces", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces }))

    await toPrevious()

    expect([
      screen.queryByRole("region", { name: "Downloads" }) !== null,
      connection.sentCommands,
    ]).toStrictEqual([true, []])
  })

  it("asks for access to downloads only from a click in the view, then lists them", async () => {
    const { downloads } = await renderSidebar(sidebarView({ spaces }), {
      downloads: { downloads: [report] },
    })
    await toPrevious()
    const requestsBeforeClick = downloads.requestCount

    await fireEvent.click(screen.getByRole("button", { name: "Allow Access to Downloads" }))
    await tick()

    expect([
      requestsBeforeClick,
      downloads.requestCount,
      within(screen.getByRole("region", { name: "Downloads" })).queryByText("report.pdf") !== null,
    ]).toStrictEqual([0, 1, true])
  })

  it("comes back to the first Space on a swipe to the right from Downloads", async () => {
    await renderSidebar(sidebarView({ spaces }))
    await toPrevious()

    await toNext()

    expect([
      screen.queryByRole("region", { name: "Downloads" }),
      screen.getByRole("heading", { name: "Work" }) !== null,
    ]).toStrictEqual([null, true])
  })

  it("comes back by way of the first Space when Downloads covered another Space", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces, activeSpaceId: hobby.id }), {
      respond: respondLikeBackground,
      downloads: { access: "Granted" },
    })
    await fireEvent.click(screen.getByRole("button", { name: "Downloads" }))
    await tick()

    await toNext()

    expect(commandsOf(connection.sentCommands, "SwitchSpace")).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "work" },
    ])
    expect(screen.getByRole("heading", { name: "Work" })).toBeTruthy()
  })

  it("goes no further than Downloads", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces }))
    await toPrevious()

    await toPrevious()

    expect([
      screen.queryByRole("region", { name: "Downloads" }) !== null,
      connection.sentCommands,
    ]).toStrictEqual([true, []])
  })
})
