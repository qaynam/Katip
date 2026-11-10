import "@testing-library/svelte/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte"
import { Effect, Layer, ManagedRuntime, Option } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type Bang, BangCatalog, DEFAULT_BANG_FORMAT } from "#modules/bangs"
import { makeTranslator } from "#modules/i18n"
import { SettingsRepository } from "#modules/settings"
import { SiteCommands } from "#modules/site-commands"
import { themeOf } from "#modules/theme"
import { FakeBrowser } from "#platform/browser-testing"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { createMemoryConnection } from "../sidepanel/connection/memory-connection"
import { createMemoryOriginAccess } from "../sidepanel/connection/memory-origin-access"
import { sidebarView, spaceView } from "../sidepanel/testing/view-builders"
import App from "./App.svelte"

type Keys = Readonly<Record<string, string>>

const SUGGESTED: Keys = {
  _execute_action: "⌃⌘S",
  "open-spotlight": "⌥T",
  "copy-current-url": "⌃⇧C",
  "copy-current-url-as-markdown": "⌃⇧M",
}

const BUNDLED_BANGS: ReadonlyArray<Bang> = [
  {
    name: "GitHub",
    triggers: ["gh"],
    template: "https://github.com/search?q=%s",
    format: DEFAULT_BANG_FORMAT,
  },
]

const runtimes: Array<{ dispose: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()))
})

const renderOnboarding = async ({
  assigned = SUGGESTED,
  grantsAccess = true,
}: { assigned?: Keys; grantsAccess?: boolean } = {}) => {
  const browserKeys = { current: assigned }
  const browser = FakeBrowser.layer
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      SettingsRepository.layer.pipe(Layer.provide(browser)),
      SiteCommands.layer.pipe(Layer.provide(browser)),
      BangCatalog.layerTest(BUNDLED_BANGS),
      Layer.succeed(
        KeyboardShortcuts,
        KeyboardShortcuts.of({
          assigned: Effect.suspend(() =>
            Effect.succeed(new Map(Object.entries(browserKeys.current))),
          ),
          suggested: Effect.succeed(new Map(Object.entries(SUGGESTED))),
          isMac: Effect.succeed(true),
        }),
      ),
      browser,
    ),
  )
  runtimes.push(runtime)
  // The window the onboarding page itself is open in
  await runtime.runPromise(FakeBrowser.use((fake) => fake.seedWindow({ tabs: [{}] })))
  const openSidePanel = vi.fn(async () => {})
  const close = vi.fn()
  const connection = createMemoryConnection({
    view: sidebarView({
      spaces: [spaceView("Work", { theme: themeOf([{ hue: 250, chroma: 0.6 }]) })],
    }),
  })
  const originAccess = createMemoryOriginAccess({ decide: () => grantsAccess })
  render(App, {
    props: {
      runtime,
      translator: makeTranslator("en"),
      optionsPageUrl: "chrome-extension://katip-test/options/index.html",
      openSidePanel,
      close,
      connection,
      originAccess,
      faviconUrl: () => null,
    },
  })
  return {
    openSidePanel,
    close,
    connection,
    originAccess,
    readCommands: () => runtime.runPromise(SiteCommands.use((commands) => commands.get)),
    reassignKeysInChrome: (keys: Keys) => {
      browserKeys.current = keys
    },
    readSettings: () => runtime.runPromise(SettingsRepository.use((settings) => settings.get)),
    openedUrls: async () => {
      const { tabs } = await runtime.runPromise(FakeBrowser.use((fake) => fake.snapshot))
      return tabs.flatMap((tab) => Option.toArray(tab.url))
    },
  }
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent

const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }))

/** Presses Continue, starting from the welcome, until the step titled `title` shows. */
const goTo = async (title: string) => {
  await press("Get Started")
  for (let presses = 0; heading() !== title; presses++) {
    if (presses > 10) throw new Error(`No step is titled ${title}`)
    await press("Continue")
  }
}

describe("the onboarding", () => {
  it("starts with a welcome, then shows where Katip lives", async () => {
    await renderOnboarding()
    expect(heading()).toBe("Welcome to Katip")

    await press("Get Started")

    expect(heading()).toBe("Katip lives in the side panel")
  })

  it("goes through every step to the end, and back again", async () => {
    await renderOnboarding()

    await goTo("You’re all set")
    const reached = heading()
    await press("Back")

    expect([reached, heading()]).toStrictEqual(["You’re all set", "Search any site with a bang"])
  })

  it("lets the steps that only show around be skipped, straight to the end", async () => {
    await renderOnboarding()
    await goTo("Check your shortcuts")
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull()
    await press("Continue")

    await press("Skip")

    expect(heading()).toBe("You’re all set")
  })
})

describe("the side panel step", () => {
  it("names the key that opens the side panel", async () => {
    await renderOnboarding()

    await goTo("Katip lives in the side panel")

    expect(screen.getByText("Or press").textContent).toContain("⌃⌘S")
  })

  it("opens the side panel on request", async () => {
    const { openSidePanel } = await renderOnboarding()
    await goTo("Katip lives in the side panel")

    await press("Open the Side Panel")

    expect(openSidePanel).toHaveBeenCalledOnce()
  })
})

describe("the shortcuts step", () => {
  const assignedButMarkdown = {
    _execute_action: "⌃⌘S",
    "open-spotlight": "⌥T",
    "copy-current-url": "⌃⇧C",
  }
  const refusal = "Chrome didn’t give Katip ⌃⇧M, most likely because another extension uses it."

  it("flags a key Katip suggests that Chrome didn't give it", async () => {
    await renderOnboarding({ assigned: assignedButMarkdown })

    await goTo("Check your shortcuts")

    expect(await screen.findByText(refusal)).toBeTruthy()
  })

  it("reads the keys again when the page is back from Chrome's shortcuts page", async () => {
    const { reassignKeysInChrome } = await renderOnboarding({ assigned: assignedButMarkdown })
    await goTo("Check your shortcuts")
    await screen.findByText(refusal)

    reassignKeysInChrome({ ...assignedButMarkdown, "copy-current-url-as-markdown": "⌥M" })
    window.dispatchEvent(new Event("focus"))

    await waitFor(() => {
      expect(screen.queryByText(refusal)).toBeNull()
    })
  })

  it("opens Chrome's shortcuts page in a new tab", async () => {
    const { openedUrls } = await renderOnboarding()
    await goTo("Check your shortcuts")

    await press("Edit in Chrome")

    await waitFor(async () => {
      expect(await openedUrls()).toContain("chrome://extensions/shortcuts")
    })
  })

  it("turns on a copy shortcut, saving it in the settings", async () => {
    const { readSettings } = await renderOnboarding()
    await goTo("Check your shortcuts")

    await fireEvent.click(await screen.findByRole("switch", { name: "Copy URL" }))

    await waitFor(async () => {
      expect((await readSettings()).pageShortcuts.copyUrl).toBe(true)
    })
  })
})

describe("the steps that show around", () => {
  it("open the settings at the Arc import", async () => {
    const { openedUrls } = await renderOnboarding()
    await goTo("Coming from Arc?")

    await press("Import from Arc…")

    await waitFor(async () => {
      expect(await openedUrls()).toContain("chrome-extension://katip-test/options/index.html#data")
    })
  })

  it("turn bangs off, saving it in the settings", async () => {
    const { readSettings } = await renderOnboarding()
    await goTo("Search any site with a bang")

    await fireEvent.click(await screen.findByRole("switch", { name: "Search sites with bangs" }))

    await waitFor(async () => {
      expect((await readSettings()).bangs).toBe(false)
    })
  })
})

describe("the theme step", () => {
  it("colors the Space shown beside the page, there and then", async () => {
    const { connection } = await renderOnboarding()
    await goTo("A color for each Space")

    await fireEvent.keyDown(screen.getByRole("slider", { name: "Color of “Work”" }), {
      key: "ArrowRight",
    })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "SetSpaceTheme", spaceId: "Work", theme: themeOf([{ hue: 260, chroma: 0.6 }]) },
    ])
  })
})

describe("the live folder step", () => {
  it("adds a live folder to the Space shown, once access to the site is allowed", async () => {
    const { connection, originAccess } = await renderOnboarding()
    await goTo("Folders that keep themselves up to date")

    await fireEvent.click(
      screen.getByRole("button", { name: "Add", description: "GitHub · Review Requests" }),
    )

    expect(await screen.findByText("Added")).toBeTruthy()
    expect([originAccess.requestedOrigins, connection.sentCommands]).toStrictEqual([
      [["https://github.com/*"]],
      [
        {
          _tag: "CreateLiveFolder",
          spaceId: "Work",
          parentId: null,
          source: { _tag: "GitHub", query: "review-requested" },
        },
      ],
    ])
  })

  it("says so when access to the site isn't allowed, adding nothing", async () => {
    const { connection } = await renderOnboarding({ grantsAccess: false })
    await goTo("Folders that keep themselves up to date")

    await fireEvent.click(
      screen.getByRole("button", { name: "Add", description: "Gmail · Unread mail" }),
    )

    expect(await screen.findByText(/access to Gmail wasn’t allowed/)).toBeTruthy()
    expect(connection.sentCommands).toStrictEqual([])
  })
})

describe("the commands in the bangs step", () => {
  it("lists the commands Katip comes with, which can be removed there", async () => {
    const { readCommands } = await renderOnboarding()
    await goTo("Search any site with a bang")

    await fireEvent.click(await screen.findByRole("button", { name: "Remove New Google Doc" }))

    await waitFor(async () => {
      expect((await readCommands()).removedDefaults).toStrictEqual(["google-doc"])
    })
  })

  it("adds a command filled in from the list of bangs", async () => {
    const { readCommands } = await renderOnboarding()
    await goTo("Search any site with a bang")
    await fireEvent.click(await screen.findByRole("button", { name: "Add Command" }))

    await fireEvent.input(screen.getByLabelText("Find a Site"), { target: { value: "git" } })
    await fireEvent.click(await screen.findByRole("button", { name: "GitHub !gh" }))
    await fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(async () => {
      expect(
        (await readCommands()).added.map(({ title, url, keyword }) => ({ title, url, keyword })),
      ).toStrictEqual([
        { title: "Search GitHub", url: "https://github.com/search?q=%s", keyword: "gh" },
      ])
    })
  })
})

describe("the end", () => {
  it("opens Katip's side panel and closes the page", async () => {
    const { openSidePanel, close } = await renderOnboarding()
    await goTo("You’re all set")

    await press("Open Katip")

    await waitFor(() => {
      expect([openSidePanel.mock.calls.length, close.mock.calls.length]).toStrictEqual([1, 1])
    })
  })

  it("closes the page without opening anything", async () => {
    const { openSidePanel, close } = await renderOnboarding()
    await goTo("You’re all set")

    await press("Close")

    expect([openSidePanel.mock.calls.length, close.mock.calls.length]).toStrictEqual([0, 1])
  })
})
