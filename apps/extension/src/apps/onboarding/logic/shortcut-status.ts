export type ShortcutStatus =
  | { readonly _tag: "Assigned"; readonly key: string }
  /**
   * Katip suggests a key that Chrome didn't assign. Chrome refuses a suggested key that another
   * extension already holds, which is the likely reason, though the user may have removed it too.
   */
  | { readonly _tag: "Refused"; readonly suggested: string }
  | { readonly _tag: "NotSet" }

/** @param assigned - and `suggested`: keys by command name, as `KeyboardShortcuts` reports them. */
export const shortcutStatusOf = (
  command: string,
  assigned: ReadonlyMap<string, string>,
  suggested: ReadonlyMap<string, string>,
): ShortcutStatus => {
  const key = assigned.get(command)
  if (key !== undefined) return { _tag: "Assigned", key }
  const suggestion = suggested.get(command)
  return suggestion === undefined ? { _tag: "NotSet" } : { _tag: "Refused", suggested: suggestion }
}
