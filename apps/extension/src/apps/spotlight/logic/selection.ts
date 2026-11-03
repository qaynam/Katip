/** The selection moved by `step`, wrapping past either end. 0 when there are no candidates. */
export const stepSelection = (current: number, count: number, step: 1 | -1): number =>
  count === 0 ? 0 : (((current + step) % count) + count) % count

type PressedKey = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">

const isOnlyCtrl = (key: PressedKey) => key.ctrlKey && !key.metaKey && !key.altKey && !key.shiftKey

/**
 * Which way a key moves the selection, if it does: the arrow keys, and Ctrl+N and Ctrl+P too.
 *
 * @remarks
 * On Windows and Linux, Ctrl+N is Chrome's shortcut for a new window, which a page can't stop.
 */
export const selectionStepOf = (key: PressedKey): 1 | -1 | null => {
  if (key.key === "ArrowDown") return 1
  if (key.key === "ArrowUp") return -1
  if (!isOnlyCtrl(key)) return null
  if (key.key === "n") return 1
  if (key.key === "p") return -1
  return null
}
