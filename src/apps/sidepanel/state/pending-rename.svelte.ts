import type { BookmarkId } from "#platform/browser"

// 作成コマンドの結果と、作成されたフォルダを含むビューのどちらが先に届くかは決まっていない。
// 結果で受け取った ID を覚えておき、その行が描画された時点で名前の編集を始めさせる
export class PendingRename {
  bookmarkId = $state.raw<BookmarkId | null>(null)

  request(bookmarkId: BookmarkId) {
    this.bookmarkId = bookmarkId
  }

  /** 自分宛ての依頼なら受け取って消す */
  consume(bookmarkId: BookmarkId): boolean {
    if (this.bookmarkId !== bookmarkId) return false
    this.bookmarkId = null
    return true
  }
}
