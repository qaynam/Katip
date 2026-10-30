import "@testing-library/svelte/vitest"
import { render } from "@testing-library/svelte"
import { tick } from "svelte"
import { beforeEach, vi } from "vitest"
import type { SidebarCommand, SidebarView } from "#protocol"
import App from "../App.svelte"
import {
  createMemoryConnection,
  type MemoryConnectionOptions,
} from "../connection/memory-connection"

// jsdom はレイアウトを持たず scrollIntoView も実装していない
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

export const renderSidebar = async (
  view: SidebarView | null,
  options: Pick<MemoryConnectionOptions, "respond"> = {},
) => {
  const connection = createMemoryConnection({
    ...(view === null ? {} : { view }),
    ...options,
  })
  const onReload = vi.fn()
  const result = render(App, { props: { connection, onReload } })
  await tick()
  return {
    ...result,
    connection,
    onReload,
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

/** サイドバー全体に今塗られている色。背景は Space 切り替えのフェードで重なった層の一番上 */
export const shownAppearance = (container: HTMLElement) => {
  const root = container.querySelector<HTMLElement>("[data-scheme]")
  const layers = container.querySelectorAll<HTMLElement>("[data-backdrop-layer]")
  return {
    scheme: root?.dataset["scheme"],
    text: root?.style.getPropertyValue("--text"),
    background: layers[layers.length - 1]?.style.getPropertyValue("--layer-background"),
  }
}
