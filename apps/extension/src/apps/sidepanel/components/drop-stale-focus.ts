/**
 * Takes the focus off any control under `root` that stops being the current one, such as the row
 * of a tab that another tab replaced as the active one. Attach it to the element to watch.
 */
export const dropFocusOnceNotCurrent = (root: HTMLElement) => {
  // Not left where it was: the focus stays on the row a tab was clicked in, where Space or Enter
  // clicks it again, so once another tab became active elsewhere, such as from the Command
  // Palette, either key would switch back to the tab the row is for
  const observer = new MutationObserver((records) => {
    for (const { target, oldValue } of records) {
      if (
        oldValue !== null &&
        target === document.activeElement &&
        target instanceof HTMLElement &&
        !target.hasAttribute("aria-current")
      ) {
        target.blur()
      }
    }
  })
  observer.observe(root, {
    subtree: true,
    attributeFilter: ["aria-current"],
    attributeOldValue: true,
  })
  return () => observer.disconnect()
}
