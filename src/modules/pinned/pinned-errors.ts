import { Schema } from "effect"
import { SpaceId } from "#modules/space"
import { BookmarkId } from "#platform/browser"

/** Space のピン留めツリーを読めなかった。空のツリーとは区別する。 */
export class PinnedTreeUnavailable extends Schema.TaggedError<PinnedTreeUnavailable>()(
  "PinnedTreeUnavailable",
  { spaceId: SpaceId },
) {}

/**
 * Katip の Space フォルダ配下に、求められた種類（ブックマークかフォルダ）のノードが無い。
 *
 * Katip の外にあるブックマーク、Space フォルダそのもの、存在しない ID はすべてこれになる。
 */
export class PinnedNodeNotFound extends Schema.TaggedError<PinnedNodeNotFound>()(
  "PinnedNodeNotFound",
  { bookmarkId: BookmarkId },
) {}

export class FolderDepthExceeded extends Schema.TaggedError<FolderDepthExceeded>()(
  "FolderDepthExceeded",
  { depth: Schema.Int, maxDepth: Schema.Int },
) {}

/** フォルダを、そのフォルダ自身かその配下のフォルダの中へ移そうとした。 */
export class MoveIntoDescendant extends Schema.TaggedError<MoveIntoDescendant>()(
  "MoveIntoDescendant",
  { folderId: BookmarkId, parentId: BookmarkId },
) {}
