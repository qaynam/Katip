import type { CommandOutcome, ServerMessage, SidebarCommand } from "#protocol"

export type SidebarEvent = Extract<ServerMessage, { readonly _tag: "ViewUpdated" | "Notice" }>

/**
 * background に届けられなかった、または届けたかどうか分からなくなったコマンド。
 * 理由を表示する言語はサイドパネルの設定で決まるので、文言にせずに返す。
 */
export interface Undelivered {
  readonly _tag: "Undelivered"
  readonly reason: "Disconnected" | "NotConnected"
}

export interface SidebarConnection {
  /**
   * 既に受け取ったビューがあれば、購読した直後にまずそれを届ける。
   * 返り値の関数を呼ぶと購読をやめる。
   */
  readonly listen: (listener: (event: SidebarEvent) => void) => () => void
  /** reject しない。接続が切れて結果が分からないときも {@link Undelivered} で解決する */
  readonly run: (command: SidebarCommand) => Promise<CommandOutcome | Undelivered>
}
