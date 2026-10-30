/** 取得元のサイトへのアクセスの許可。テストや検証ページでは偽物に差し替える */
export interface OriginAccess {
  /**
   * 許可を求め、許可されたかどうかで解決する。許可済みなら尋ねずに true になる。reject しない。
   * Chrome はクリックなどのユーザー操作を処理している間しか尋ねないので、操作のハンドラから
   * await を挟まずに呼ぶこと。
   */
  readonly request: (origins: ReadonlyArray<string>) => Promise<boolean>
}

export const chromeOriginAccess: OriginAccess = {
  request: (origins) => chrome.permissions.request({ origins: [...origins] }).catch(() => false),
}
