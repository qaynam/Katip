import type { Rect } from "../logic/menu-position"

export type MenuEntry =
  | {
      readonly _tag: "Action"
      readonly label: string
      readonly onSelect: () => void
      readonly tone?: "danger"
      readonly disabled?: boolean
      /** 項目の前に置く色の見本（CSS の背景） */
      readonly swatch?: string
      /** 指定すると、いくつかから 1 つを選ぶ項目になり、true の項目に印が付く */
      readonly checked?: boolean
    }
  | { readonly _tag: "Separator" }
  | { readonly _tag: "Submenu"; readonly label: string; readonly entries: ReadonlyArray<MenuEntry> }

export const action = (
  label: string,
  onSelect: () => void,
  options: {
    readonly tone?: "danger"
    readonly disabled?: boolean
    readonly swatch?: string
    readonly checked?: boolean
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
