import { fireEvent, screen, waitFor, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { TabId } from "#platform/browser"
import type { TabSoundView } from "#protocol"
import { commandsOf, renderSidebar } from "../testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "../testing/view-builders"

const MUSIC_URL = "https://music.example/song"

const viewWith = (...tabs: ReadonlyArray<ReturnType<typeof tabView>>) =>
  sidebarView({ spaces: [spaceView("work", { temporaryTabs: tabs })] })

const song = (overrides: Partial<Parameters<typeof tabView>[1]> = {}) =>
  tabView(1, { title: "Song", url: MUSIC_URL, ...overrides })

const rowOf = (title: string) => {
  const row = screen.getByRole("button", { name: title }).closest("li")
  if (row === null) throw new Error(`No row for ${title}`)
  return row
}

const openSound = async (title: string) => {
  await fireEvent.contextMenu(screen.getByRole("button", { name: title }))
  await fireEvent.click(screen.getByRole("menuitem", { name: "Sound Settings…" }))
}

const dialog = () => screen.getByRole("dialog", { name: /Sound Settings/ })

describe("the Sound Settings item in a tab's menu", () => {
  it("is offered for a page on the web, not for a browser page", async () => {
    await renderSidebar(
      viewWith(song(), tabView(2, { title: "Settings", url: "chrome://settings/" })),
    )

    await fireEvent.contextMenu(screen.getByRole("button", { name: "Song" }))
    const onWebPage = screen.queryByRole("menuitem", { name: "Sound Settings…" })
    await fireEvent.keyDown(window, { key: "Escape" })
    await fireEvent.contextMenu(screen.getByRole("button", { name: "Settings" }))

    expect([onWebPage, screen.queryByRole("menuitem", { name: "Sound Settings…" })]).toStrictEqual([
      expect.anything(),
      null,
    ])
  })
})

describe("the Sound Settings panel", () => {
  it("has Chrome ask for the site right from the menu, then the site for the microphone on its page, then lists the outputs", async () => {
    const { connection, originAccess, pageOutputs } = await renderSidebar(viewWith(song()), {
      pageOutputs: { outputs: ["MacBook Pro Speakers", "External Speaker"] },
    })

    await openSound("Song")

    await within(dialog()).findByRole("radio", { name: "External Speaker" })
    expect([
      originAccess.requestedOrigins,
      pageOutputs.askedTabs,
      commandsOf(connection.sentCommands, "ActivateTab"),
      within(dialog())
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent?.trim()),
    ]).toStrictEqual([
      [["https://music.example/*"]],
      [TabId.make(1)],
      [{ _tag: "ActivateTab", tabId: TabId.make(1) }],
      [
        "System default",
        "MacBook Pro Speakers",
        "External Speaker",
        "Always on music.example",
        "For this tab only",
      ],
    ])
  })

  it("says Katip wasn't allowed the site, and has Chrome ask again from the panel", async () => {
    const { originAccess } = await renderSidebar(viewWith(song()), { grantsAccess: false })
    await openSound("Song")

    const denied = await within(dialog()).findByRole("alert")
    await fireEvent.click(within(dialog()).getByRole("button", { name: "Allow Access" }))

    expect([denied.textContent, originAccess.requestedOrigins.length]).toStrictEqual([
      "Katip wasn’t allowed to access music.example, so it can’t choose the speaker the site plays on.",
      2,
    ])
  })

  it("says so when the site isn't allowed the microphone, and asks again", async () => {
    const { pageOutputs } = await renderSidebar(viewWith(song()), {
      pageOutputs: { allowsMicrophone: false },
    })
    await openSound("Song")

    const refused = await within(dialog()).findByRole("alert")
    await fireEvent.click(within(dialog()).getByRole("button", { name: "Ask Again" }))

    expect([refused.textContent, pageOutputs.askedTabs.length]).toStrictEqual([
      "music.example wasn’t allowed the microphone, so it can’t name your speakers.",
      2,
    ])
  })

  it("offers the site's settings when Chrome remembers its microphone as blocked, as Chrome won't ask again", async () => {
    const { pageOutputs } = await renderSidebar(viewWith(song()), {
      pageOutputs: { blocksMicrophone: true },
    })
    await openSound("Song")

    const blocked = await within(dialog()).findByRole("alert")
    await fireEvent.click(within(dialog()).getByRole("button", { name: "Open Site Settings" }))

    expect([blocked.textContent, pageOutputs.openedSiteSettings]).toStrictEqual([
      "Chrome remembers music.example’s microphone as blocked, so it won’t ask again. Open the site’s settings, set Microphone to Allow, then choose Ask Again.",
      ["https://music.example"],
    ])
  })

  it("applies the output chosen, kept for the site unless chosen for this tab only", async () => {
    const { connection } = await renderSidebar(viewWith(song()), {
      pageOutputs: { mayUseMicrophone: true, outputs: ["External Speaker"] },
    })
    await openSound("Song")

    await fireEvent.click(await within(dialog()).findByRole("radio", { name: "External Speaker" }))
    await fireEvent.click(within(dialog()).getByRole("radio", { name: "For this tab only" }))
    await fireEvent.click(within(dialog()).getByRole("button", { name: "Apply" }))

    expect(commandsOf(connection.sentCommands, "SetTabSoundOutput")).toStrictEqual([
      { _tag: "SetTabSoundOutput", tabId: TabId.make(1), output: "External Speaker", scope: "Tab" },
    ])
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("starts from the output chosen before, listed even while it isn't connected, and resets it", async () => {
    const sound: TabSoundView = {
      output: "External Speaker",
      scope: "Site",
      state: "OutputMissing",
    }
    const { connection } = await renderSidebar(viewWith(song({ sound })), {
      pageOutputs: { mayUseMicrophone: true, outputs: ["MacBook Pro Speakers"] },
    })
    await openSound("Song")

    const chosen = await within(dialog()).findByRole("radio", {
      name: "External Speaker (not connected)",
    })
    const wasChecked = (chosen as HTMLInputElement).checked
    await fireEvent.click(within(dialog()).getByRole("button", { name: "Reset" }))

    expect([wasChecked, commandsOf(connection.sentCommands, "ResetTabSound")]).toStrictEqual([
      true,
      [{ _tag: "ResetTabSound", tabId: TabId.make(1) }],
    ])
  })

  it("says a page that isn't secure can't play elsewhere", async () => {
    await renderSidebar(viewWith(song({ url: "http://music.example/song" })), {
      pageOutputs: { isSecure: false },
    })
    await openSound("Song")

    expect(await within(dialog()).findByText(/Only secure pages/)).toBeTruthy()
  })
})

describe("a tab's speaker", () => {
  it("tells the output a tab plays on when Katip sent it there", async () => {
    await renderSidebar(
      viewWith(
        song({
          isAudible: true,
          sound: { output: "External Speaker", scope: "Site", state: "Applied" },
        }),
      ),
    )

    expect(within(rowOf("Song")).getByRole("button", { name: /Mute Tab/ }).title).toBe(
      "Mute Tab · Playing on External Speaker",
    )
  })

  it("warns while the output a tab is meant for isn't connected", async () => {
    await renderSidebar(
      viewWith(
        song({
          isAudible: true,
          sound: { output: "External Speaker", scope: "Site", state: "OutputMissing" },
        }),
      ),
    )

    const speaker = within(rowOf("Song")).getByRole("button", { name: /Mute Tab/ })
    expect([speaker.classList.contains("warning"), speaker.title]).toStrictEqual([
      true,
      "Mute Tab · External Speaker isn’t connected, so this tab plays on the system default",
    ])
  })
})
