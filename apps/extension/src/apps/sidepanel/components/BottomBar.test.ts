import { fireEvent, screen, within } from "@testing-library/svelte"
import { tick } from "svelte"
import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName } from "#modules/space"
import { themeOf } from "#modules/theme"
import type { SidebarCommand, SidebarView } from "#protocol"
import type { CommandResponse } from "../connection/memory-connection"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView } from "../testing/view-builders"

const work = spaceView("work", { name: SpaceName.make("Work") })
const hobby = spaceView("hobby", { name: SpaceName.make("Hobby") })

const spaceBar = () => screen.getByRole("navigation", { name: "Switch Space" })

// Like the background, responds with a view whose active Space is the created or switched-to one
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
    const created = spaceView("created", {
      name: SpaceName.make("Space 3"),
      ...(command.theme === undefined ? {} : { theme: command.theme }),
    })
    return {
      outcome: succeeded,
      view: { ...current, spaces: [...current.spaces, created], activeSpaceId: created.id },
    }
  }
  return { outcome: succeeded }
}

describe("Space marks", () => {
  it("switches to a Space when its mark is clicked", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.click(within(spaceBar()).getByRole("button", { name: "Hobby" }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "hobby" },
    ])
  })

  it("marks the active Space's mark as current", async () => {
    await renderSidebar(sidebarView({ spaces: [work, hobby], activeSpaceId: hobby.id }))

    const current = within(spaceBar()).getByRole("button", { name: "Hobby" })

    expect(current.getAttribute("aria-current")).toBe("true")
  })

  it("opens the Space's menu on right-click", async () => {
    await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.contextMenu(within(spaceBar()).getByRole("button", { name: "Hobby" }))

    expect(screen.getByRole("menu", { name: "Space menu" })).toBeTruthy()
  })

  it("switches to a Space that isn't shown before opening the picker to edit its theme", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }), {
      respond: respondLikeBackground,
    })
    await fireEvent.contextMenu(within(spaceBar()).getByRole("button", { name: "Hobby" }))

    await fireEvent.click(screen.getByRole("menuitem", { name: "Edit Theme" }))
    await tick()

    expect(commandsOf(connection.sentCommands, "SwitchSpace")).toStrictEqual([
      { _tag: "SwitchSpace", windowId: 1, spaceId: "hobby" },
    ])
    expect(screen.getByRole("heading", { name: "Hobby" })).toBeTruthy()
    expect(screen.getByRole("dialog", { name: "Theme" })).toBeTruthy()
  })
})

describe("Creating a Space", () => {
  const nameField = () => screen.queryByRole<HTMLInputElement>("textbox", { name: "Space name" })
  const create = async () => {
    await fireEvent.click(screen.getByRole("button", { name: "Create Space" }))
    await fireEvent.submit(nameField() as HTMLElement)
    await tick()
  }

  it("shows a new Space to name, named like the next numbered Space, without creating it", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))

    await fireEvent.click(screen.getByRole("button", { name: "Create Space" }))

    expect([nameField()?.value, commandsOf(connection.sentCommands, "CreateSpace")]).toStrictEqual([
      "Space 3",
      [],
    ])
  })

  it("creates the confirmed Space in this window with a theme in a color not used yet", async () => {
    const used = themeOf([{ hue: 350, chroma: 0.55 }])
    const { connection } = await renderSidebar(
      sidebarView({ spaces: [{ ...work, theme: used }, hobby] }),
    )

    await create()

    const [command] = commandsOf(connection.sentCommands, "CreateSpace")
    expect(command).toMatchObject({ _tag: "CreateSpace", windowId: 1, name: "Space 3" })
    expect(command?._tag === "CreateSpace" && command.theme?.colors).not.toStrictEqual(used.colors)
    expect(command?._tag === "CreateSpace" && command.theme?.colors.length).toBe(1)
  })

  it("opens the theme picker once the created Space is shown", async () => {
    await renderSidebar(sidebarView({ spaces: [work, hobby] }), {
      respond: respondLikeBackground,
    })

    await create()
    await tick()

    expect(screen.getByRole("heading", { name: "Space 3" })).toBeTruthy()
    expect(screen.getByRole("dialog", { name: "Theme" })).toBeTruthy()
  })

  it("creates nothing when the new Space is cancelled", async () => {
    const { connection } = await renderSidebar(sidebarView({ spaces: [work, hobby] }))
    await fireEvent.click(screen.getByRole("button", { name: "Create Space" }))

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect([commandsOf(connection.sentCommands, "CreateSpace"), nameField()]).toStrictEqual([
      [],
      null,
    ])
  })

  it("doesn't start editing on a later switch to another Space when creation failed", async () => {
    const { pushView } = await renderSidebar(sidebarView({ spaces: [work, hobby] }), {
      respond: () => ({ outcome: { _tag: "Failed", reason: "Couldn't create the Space" } }),
    })
    await create()
    await tick()

    await pushView(
      sidebarView({
        spaces: [work, hobby, spaceView("later", { name: SpaceName.make("Later") })],
        activeSpaceId: SpaceId.make("later"),
      }),
    )

    expect(screen.queryByRole("textbox", { name: "Space name" })).toBeNull()
    expect(screen.queryByRole("dialog", { name: "Theme" })).toBeNull()
  })
})
