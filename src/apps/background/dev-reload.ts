const readBuildId = () =>
  fetch(chrome.runtime.getURL("dev-build-id.txt"), { cache: "no-store" }).then((response) =>
    response.ok ? response.text() : null,
  )

/**
 * 開発ビルドが書き換わったら拡張を再読み込みする。
 *
 * service worker が起きている間しか見張らないが、サイドパネルや検証ページが開いていれば
 * 定期的な KeepAlive で起き続けるので、確認しながら作業する用途には足りる。
 */
export const reloadOnRebuild = async () => {
  const initial = await readBuildId().catch(() => null)
  setInterval(() => {
    readBuildId()
      .then((current) => {
        if (current !== null && current !== initial) chrome.runtime.reload()
      })
      // ビルド中は dist が一時的に空になり読めないことがある。次の確認で拾えばよい
      .catch(() => undefined)
  }, 1000)
}
