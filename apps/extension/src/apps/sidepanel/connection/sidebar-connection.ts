import type { CommandOutcome, ServerMessage, SidebarCommand } from "#protocol"

export type SidebarEvent = Extract<ServerMessage, { readonly _tag: "ViewUpdated" | "Notice" }>

/**
 * A command that couldn't reach the background, or whose delivery became uncertain.
 * It carries a reason code rather than text because the side panel's settings decide the
 * display language.
 */
export interface Undelivered {
  readonly _tag: "Undelivered"
  readonly reason: "Disconnected" | "NotConnected"
}

export interface SidebarConnection {
  /**
   * If a view has already been received, delivers it right after subscribing.
   * Call the returned function to unsubscribe.
   */
  readonly listen: (listener: (event: SidebarEvent) => void) => () => void
  /**
   * Never rejects. Resolves with {@link Undelivered} also when the connection drops and the
   * outcome is unknown.
   */
  readonly run: (command: SidebarCommand) => Promise<CommandOutcome | Undelivered>
}
