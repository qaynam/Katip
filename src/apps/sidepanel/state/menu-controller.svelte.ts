import type { SpaceColor } from "#modules/space"
import type { Rect } from "../logic/menu-position"

export type MenuEntry =
  | {
      readonly _tag: "Action"
      readonly label: string
      readonly onSelect: () => void
      readonly tone?: "danger"
      readonly disabled?: boolean
      readonly color?: SpaceColor
    }
  | { readonly _tag: "Separator" }
  | { readonly _tag: "Submenu"; readonly label: string; readonly entries: ReadonlyArray<MenuEntry> }
  | {
      readonly _tag: "ColorPicker"
      readonly label: string
      readonly selected: SpaceColor
      readonly onPick: (color: SpaceColor) => void
    }

export const action = (
  label: string,
  onSelect: () => void,
  options: {
    readonly tone?: "danger"
    readonly disabled?: boolean
    readonly color?: SpaceColor
  } = {},
): MenuEntry => ({ _tag: "Action", label, onSelect, ...options })

export const separator: MenuEntry = { _tag: "Separator" }

export const submenu = (label: string, entries: ReadonlyArray<MenuEntry>): MenuEntry => ({
  _tag: "Submenu",
  label,
  entries,
})

export interface OpenMenu {
  readonly label: string
  readonly anchor: Rect
  readonly entries: ReadonlyArray<MenuEntry>
  /** このボタンの上での押下は「外側のクリック」とみなさない（開閉ボタンとして使うため） */
  readonly trigger: HTMLElement | null
}

export class MenuController {
  current = $state.raw<OpenMenu | null>(null)
  #returnFocusTo: HTMLElement | null = null

  open(menu: OpenMenu) {
    this.#returnFocusTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.current = menu
  }

  toggle(menu: OpenMenu & { readonly trigger: HTMLElement }) {
    if (this.current?.trigger === menu.trigger) {
      this.close()
      return
    }
    this.open(menu)
  }

  close() {
    if (this.current === null) return
    this.current = null
    const focusTarget = this.#returnFocusTo
    this.#returnFocusTo = null
    if (focusTarget?.isConnected === true) focusTarget.focus()
  }
}
