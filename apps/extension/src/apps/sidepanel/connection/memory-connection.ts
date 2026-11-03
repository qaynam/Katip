import type { CommandOutcome, SidebarCommand, SidebarView } from "#protocol"
import type { SidebarConnection, SidebarEvent } from "./sidebar-connection"

export interface CommandResponse {
  readonly outcome: CommandOutcome
  /** When given, this view is delivered before the outcome is returned. */
  readonly view?: SidebarView
  readonly notice?: string
}

export interface MemoryConnectionOptions {
  readonly view?: SidebarView
  readonly respond?: (command: SidebarCommand, current: SidebarView | null) => CommandResponse
}

/** A connection that runs the UI without the background and records the sent commands. */
export interface MemoryConnection extends SidebarConnection {
  readonly sentCommands: ReadonlyArray<SidebarCommand>
  readonly pushView: (view: SidebarView) => void
  readonly pushNotice: (message: string) => void
}

const succeedWithoutChange = (): CommandResponse => ({
  outcome: { _tag: "Succeeded", createdBookmarkId: null },
})

export const createMemoryConnection = (options: MemoryConnectionOptions = {}): MemoryConnection => {
  const respond = options.respond ?? succeedWithoutChange
  const listeners = new Set<(event: SidebarEvent) => void>()
  const sentCommands: Array<SidebarCommand> = []
  let latestView = options.view ?? null

  const emit = (event: SidebarEvent) => {
    for (const listener of listeners) listener(event)
  }
  const pushView = (view: SidebarView) => {
    latestView = view
    emit({ _tag: "ViewUpdated", view })
  }
  const pushNotice = (message: string) => emit({ _tag: "Notice", message })

  return {
    sentCommands,
    pushView,
    pushNotice,
    listen: (listener) => {
      listeners.add(listener)
      if (latestView !== null) listener({ _tag: "ViewUpdated", view: latestView })
      return () => listeners.delete(listener)
    },
    run: async (command) => {
      sentCommands.push(command)
      const response = respond(command, latestView)
      if (response.view !== undefined) pushView(response.view)
      if (response.notice !== undefined) pushNotice(response.notice)
      return response.outcome
    },
  }
}
