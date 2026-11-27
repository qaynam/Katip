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
import { createMemoryDownloads, type MemoryDownloadsOptions } from "../connection/memory-downloads"
import {
  createMemoryPageOutputs,
  type MemoryPageOutputsOptions,
} from "../connection/memory-page-outputs"
import { createMemoryOriginAccess } from "../connection/memory-origin-access"
import { createMemoryScrollPositions } from "../connection/memory-scroll-positions"
import { createMemorySidePanel } from "../connection/memory-side-panel"
import { createMemoryUpdateNotices } from "../connection/memory-update-notices"
import type { ScrollPositions } from "../connection/scroll-positions"
import { bundledTranslators } from "./bundled-translators"

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
    /** The browser's downloads, and how asking to read them goes. Granted when asked by default. */
    readonly downloads?: MemoryDownloadsOptions
    /** What tabs' pages know of the outputs. No access to any site by default. */
    readonly pageOutputs?: MemoryPageOutputsOptions
  } = {},
) => {
  const {
    grantsAccess = true,
    locale = "en",
    browserLanguages = [],
    scrollPositions = createMemoryScrollPositions(),
    updateNotice = null,
    downloads: downloadsOptions = {},
    pageOutputs: pageOutputsOptions = {},
    ...connectionOptions
  } = options
  const connection = createMemoryConnection({
    ...(view === null ? {} : { view }),
    ...connectionOptions,
  })
  const originAccess = createMemoryOriginAccess({ decide: () => grantsAccess })
  const downloads = createMemoryDownloads(downloadsOptions)
  const pageOutputs = createMemoryPageOutputs(pageOutputsOptions)
  const localePreferences = createMemoryLocalePreferences(locale)
  const updateNotices = createMemoryUpdateNotices(updateNotice)
  const sidePanel = createMemorySidePanel()
  const onReload = vi.fn()
  // The catalog of a language arrives a few promise turns after it is asked for. Not waited for
  // with a timer, which tests with fake timers would never let fire
  const translationsSettled = async () => {
    for (let turn = 0; turn < 5; turn++) await tick()
  }
  const result = render(App, {
    props: {
      connection,
      originAccess,
      pageOutputs,
      downloads,
      localePreferences,
      browserLanguages,
      ...bundledTranslators(browserLanguages),
      scrollPositions,
      updateNotices,
      sidePanel,
      onReload,
    },
  })
  await translationsSettled()
  return {
    ...result,
    connection,
    originAccess,
    pageOutputs,
    downloads,
    updateNotices,
    sidePanel,
    onReload,
    /** Simulates changing the language setting while the panel stays open. */
    changeLocale: async (preference: LocalePreference) => {
      localePreferences.set(preference)
      await translationsSettled()
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

// Shared by every element, so where a drag starts and where it hovers are on one horizontal scale
const rowBounds = new DOMRect(0, 100, 240, 36)

/**
 * Simulates starting to drag the element at a horizontal position given as a ratio (0 to 1) of
 * its width.
 *
 * jsdom has no DragEvent, so this dispatches a mouse event with coordinates.
 */
export const dragStartAt = async (element: HTMLElement, horizontalRatio: number) => {
  await fireEvent(
    element,
    new MouseEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      clientX: rowBounds.left + rowBounds.width * horizontalRatio,
    }),
  )
}

export interface DraggedLink {
  readonly url: string
  readonly title: string
}

// What Chrome hands a drop target for a link dragged from a page
const linkTransfer = ({ url, title }: DraggedLink) => {
  const data: Readonly<Record<string, string>> = {
    "text/uri-list": url,
    "text/html": `<meta charset="utf-8"><a href="${url}">${title}</a>`,
    "text/plain": url,
  }
  return {
    types: Object.keys(data),
    effectAllowed: "copyLink",
    dropEffect: "none",
    getData: (type: string) => data[type] ?? "",
  }
}

const withTransfer = (event: Event, link: DraggedLink) => {
  Object.defineProperty(event, "dataTransfer", { value: linkTransfer(link) })
  return event
}

/**
 * Simulates dragging a link from a page over the element, at a height given as a ratio (0 to 1)
 * of its height, as {@link dragOverAt} does for drags from the side panel.
 */
export const dragLinkOverAt = async (
  element: HTMLElement,
  verticalRatio: number,
  link: DraggedLink,
) => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rowBounds)
  await fireEvent(
    element,
    withTransfer(
      new MouseEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: rowBounds.left + rowBounds.width / 2,
        clientY: rowBounds.top + rowBounds.height * verticalRatio,
      }),
      link,
    ),
  )
}

/** Simulates letting a link dragged from a page go over the element. */
export const dropLinkOn = async (element: HTMLElement, link: DraggedLink) => {
  await fireEvent(
    element,
    withTransfer(new MouseEvent("drop", { bubbles: true, cancelable: true }), link),
  )
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
  const bounds = rowBounds
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
