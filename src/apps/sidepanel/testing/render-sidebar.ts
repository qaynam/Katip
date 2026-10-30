import "@testing-library/svelte/vitest"
import { fireEvent, render } from "@testing-library/svelte"
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

/**
 * 要素の上から ratio（0〜1）の高さの位置にドラッグ中のポインタを重ねる。
 * jsdom はレイアウトを持たず DragEvent も無いので、要素の矩形と座標付きのマウスイベントで代用する
 */
export const dragOverAt = async (element: HTMLElement, ratio: number) => {
  const bounds = new DOMRect(0, 100, 240, 36)
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(bounds)
  await fireEvent(
    element,
    new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientY: bounds.top + bounds.height * ratio,
    }),
  )
}
