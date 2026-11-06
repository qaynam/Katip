import "@testing-library/svelte/vitest"
import { fireEvent, render } from "@testing-library/svelte"
import { tick } from "svelte"
import { beforeEach, vi } from "vitest"
import type { LocalePreference } from "#modules/i18n"
import type { Release } from "#modules/updates"
import type { SidebarCommand, SidebarView } from "#protocol"
import App from "../App.svelte"
import {
  createMemoryConnection,
  type MemoryConnectionOptions,
} from "../connection/memory-connection"
import { createMemoryLocalePreferences } from "../connection/locale-preferences"
import { createMemoryOriginAccess } from "../connection/memory-origin-access"
import { createMemoryScrollPositions } from "../connection/memory-scroll-positions"
import { createMemoryUpdateNotices } from "../connection/memory-update-notices"
import type { ScrollPositions } from "../connection/scroll-positions"

// jsdom has no layout and doesn't implement scrollIntoView
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// jsdom can't play animations, so the side panel runs as it does for people who ask for reduced
// motion. Every other media query is left unmatched, as it was without matchMedia
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  return () => vi.unstubAllGlobals()
})

export const renderSidebar = async (
  view: SidebarView | null,
  options: Pick<MemoryConnectionOptions, "respond"> & {
    /** Whether to grant access when a live folder source asks for it. Granted by default. */
    readonly grantsAccess?: boolean
    /** The language chosen in the settings. English by default. */
    readonly locale?: LocalePreference
    /** The browser languages used when the language setting is auto. */
    readonly browserLanguages?: ReadonlyArray<string>
    /** Pass the same one to two renders to reopen the side panel. Empty by default. */
    readonly scrollPositions?: ScrollPositions
    /** The newer release the side panel is told about. None by default. */
    readonly updateNotice?: Release | null
  } = {},
) => {
  const {
    grantsAccess = true,
    locale = "en",
    browserLanguages = [],
    scrollPositions = createMemoryScrollPositions(),
    updateNotice = null,
    ...connectionOptions
  } = options
  const connection = createMemoryConnection({
    ...(view === null ? {} : { view }),
    ...connectionOptions,
  })
  const originAccess = createMemoryOriginAccess({ decide: () => grantsAccess })
  const localePreferences = createMemoryLocalePreferences(locale)
  const updateNotices = createMemoryUpdateNotices(updateNotice)
  const onReload = vi.fn()
  const result = render(App, {
    props: {
      connection,
      originAccess,
      localePreferences,
      browserLanguages,
      scrollPositions,
      updateNotices,
      onReload,
    },
  })
  await tick()
  return {
    ...result,
    connection,
    originAccess,
    updateNotices,
    onReload,
    /** Simulates changing the language setting while the panel stays open. */
    changeLocale: async (preference: LocalePreference) => {
      localePreferences.set(preference)
      await tick()
    },
    pushView: async (next: SidebarView) => {
      connection.pushView(next)
      await tick()
    },
  }
}

export const commandsOf = (
  commands: ReadonlyArray<SidebarCommand>,
  tag: SidebarCommand["_tag"],
): ReadonlyArray<SidebarCommand> => commands.filter((command) => command._tag === tag)

/**
 * The colors currently painted over the whole sidebar. The background is read from the top
 * layer, since switching Spaces stacks layers while fading.
 */
export const shownAppearance = (container: HTMLElement) => {
  const root = container.querySelector<HTMLElement>("[data-scheme]")
  const layers = container.querySelectorAll<HTMLElement>("[data-backdrop-layer]")
  return {
    scheme: root?.dataset["scheme"],
    text: root?.style.getPropertyValue("--text"),
    background: layers[layers.length - 1]?.style.getPropertyValue("--layer-background"),
  }
}

/**
 * Simulates dragging over the element at a position given as ratios (0 to 1) of its size.
 * Horizontally it defaults to the right side.
 *
 * jsdom has no layout or DragEvent, so this stubs the element's bounds and dispatches a mouse
 * event with coordinates.
 */
export const dragOverAt = async (
  element: HTMLElement,
  verticalRatio: number,
  horizontalRatio = 0.75,
) => {
  const bounds = new DOMRect(0, 100, 240, 36)
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds)
  await fireEvent(
    element,
    new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width * horizontalRatio,
      clientY: bounds.top + bounds.height * verticalRatio,
    }),
  )
}
