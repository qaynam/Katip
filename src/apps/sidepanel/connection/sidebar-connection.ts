import type { CommandOutcome, ServerMessage, SidebarCommand } from "#protocol"

export type SidebarEvent = Extract<ServerMessage, { readonly _tag: "ViewUpdated" | "Notice" }>

export interface SidebarConnection {
  /**
   * 既に受け取ったビューがあれば、購読した直後にまずそれを届ける。
   * 返り値の関数を呼ぶと購読をやめる。
   */
  readonly listen: (listener: (event: SidebarEvent) => void) => () => void
  /** reject しない。接続が切れて結果が分からないときも Failed で解決する */
  readonly run: (command: SidebarCommand) => Promise<CommandOutcome>
}

export const failedOutcome = (reason: string): CommandOutcome => ({ _tag: "Failed", reason })
