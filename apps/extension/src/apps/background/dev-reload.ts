const readBuildId = () =>
  fetch(chrome.runtime.getURL("dev-build-id.txt"), { cache: "no-store" }).then((response) =>
    response.ok ? response.text() : null,
  )

/**
 * Reloads the extension when the development build changes.
 *
 * It only watches while the service worker is awake, but an open side panel or development page
 * keeps it awake with periodic KeepAlives, which is enough for checking changes while working.
 */
export const reloadOnRebuild = async () => {
  const initial = await readBuildId().catch(() => null)
  setInterval(() => {
    readBuildId()
      .then((current) => {
        if (current !== null && current !== initial) chrome.runtime.reload()
      })
      // Ignored: dist can be briefly empty during a build, and the next check picks the change up
      .catch(() => undefined)
  }, 1000)
}
