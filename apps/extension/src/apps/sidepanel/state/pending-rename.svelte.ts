import type { BookmarkId } from "#platform/browser"

// Either the create command's outcome or the view containing the new folder may arrive first.
// The ID from the outcome is kept here, and renaming starts once that row is rendered
export class PendingRename {
  bookmarkId = $state.raw<BookmarkId | null>(null)

  request(bookmarkId: BookmarkId) {
    this.bookmarkId = bookmarkId
  }

  /** Takes and clears the request if it is for this bookmark. */
  consume(bookmarkId: BookmarkId): boolean {
    if (this.bookmarkId !== bookmarkId) return false
    this.bookmarkId = null
    return true
  }
}
