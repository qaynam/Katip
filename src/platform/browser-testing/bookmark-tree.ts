import { Array, Equivalence, Option, Predicate, Result } from "effect"
import {
  type BookmarkCreateOptions,
  type BookmarkFolder,
  type BookmarkFolderType,
  BookmarkId,
  type BookmarkMoveOptions,
  type BookmarkNode,
  type BookmarkSearchQuery,
  type BookmarkUpdateOptions,
  type BrowserEvent,
} from "#platform/browser"

export interface BookmarkRecord {
  readonly id: BookmarkId
  readonly parentId: Option.Option<BookmarkId>
  readonly title: string
  /** `None` ならフォルダ。 */
  readonly url: Option.Option<string>
  readonly dateAdded: number
  readonly folderType: Option.Option<BookmarkFolderType>
  readonly childIds: ReadonlyArray<BookmarkId>
}

export interface BookmarkTree {
  readonly nodes: ReadonlyArray<BookmarkRecord>
  readonly lastIssuedId: number
}

export interface BookmarkOutcome<A> {
  readonly tree: BookmarkTree
  readonly events: ReadonlyArray<BrowserEvent>
  readonly value: A
}

const ROOT_ID = BookmarkId.make("0")
const OTHER_BOOKMARKS_ID = BookmarkId.make("2")

const permanentFolder = (
  id: string,
  title: string,
  folderType: BookmarkFolderType,
  now: number,
): BookmarkRecord => ({
  id: BookmarkId.make(id),
  parentId: Option.some(ROOT_ID),
  title,
  url: Option.none(),
  dateAdded: now,
  folderType: Option.some(folderType),
  childIds: [],
})

/**
 * Like a new Chrome profile, only the bookmarks bar and other bookmarks exist. The mobile
 * bookmarks folder appears only when a synced device has bookmarks.
 */
export const initialBookmarkTree = (now: number): BookmarkTree => ({
  nodes: [
    {
      id: ROOT_ID,
      parentId: Option.none(),
      title: "",
      url: Option.none(),
      dateAdded: now,
      folderType: Option.none(),
      childIds: ["1", "2"].map((id) => BookmarkId.make(id)),
    },
    permanentFolder("1", "Bookmarks Bar", "bookmarks-bar", now),
    permanentFolder("2", "Other Bookmarks", "other", now),
  ],
  // Chrome reserves 3 and 4 for the mobile and managed folders
  lastIssuedId: 4,
})

const isPermanent = (record: BookmarkRecord) =>
  record.id === ROOT_ID || Option.isSome(record.folderType)

const isFolder = (record: BookmarkRecord) => Option.isNone(record.url)

const findRecord = (tree: BookmarkTree, id: BookmarkId): Option.Option<BookmarkRecord> =>
  Array.findFirst(tree.nodes, (node) => node.id === id)

const requireRecord = (tree: BookmarkTree, id: BookmarkId) =>
  Result.fromOption(findRecord(tree, id), () => "Can't find bookmark for id.")

const requireModifiable = (record: BookmarkRecord) =>
  isPermanent(record)
    ? Result.fail("Can't modify the root bookmark folders.")
    : Result.succeed(record)

const requireParentFolder = (tree: BookmarkTree, id: BookmarkId) =>
  Result.gen(function* () {
    const parent = yield* Result.fromOption(
      findRecord(tree, id),
      () => "Can't find parent bookmark for id.",
    )
    if (!isFolder(parent))
      return yield* Result.fail("Parameter 'parentId' does not specify a folder.")
    if (parent.id === ROOT_ID) return yield* Result.fail("Can't modify the root bookmark folders.")
    return parent
  })

const requireValidUrl = (url: string) =>
  URL.canParse(url) ? Result.succeed(url) : Result.fail("Invalid URL.")

const requireIndexWithin = (parent: BookmarkRecord, index: number | undefined) => {
  const resolved = index ?? parent.childIds.length
  return resolved < 0 || resolved > parent.childIds.length
    ? Result.fail("Index out of bounds.")
    : Result.succeed(resolved)
}

const childrenOf = (tree: BookmarkTree, record: BookmarkRecord) =>
  Array.getSomes(record.childIds.map((id) => findRecord(tree, id)))

const indexInParent = (tree: BookmarkTree, record: BookmarkRecord): Option.Option<number> =>
  Option.flatMap(record.parentId, (parentId) =>
    Option.flatMap(findRecord(tree, parentId), (parent) =>
      Array.findFirstIndex(parent.childIds, (id) => id === record.id),
    ),
  )

const replaceRecords = (
  tree: BookmarkTree,
  ...records: ReadonlyArray<BookmarkRecord>
): BookmarkTree => ({
  ...tree,
  nodes: tree.nodes.map((node) => records.find((record) => record.id === node.id) ?? node),
})

export const describeFolder = (
  tree: BookmarkTree,
  record: BookmarkRecord,
  withChildren: boolean,
): BookmarkFolder => ({
  _tag: "BookmarkFolder",
  id: record.id,
  parentId: record.parentId,
  index: indexInParent(tree, record),
  title: record.title,
  dateAdded: Option.some(record.dateAdded),
  folderType: record.folderType,
  children: withChildren
    ? Option.some(childrenOf(tree, record).map((child) => describeNode(tree, child, true)))
    : Option.none(),
})

export const describeNode = (
  tree: BookmarkTree,
  record: BookmarkRecord,
  withChildren: boolean,
): BookmarkNode =>
  Option.match(record.url, {
    onSome: (url): BookmarkNode => ({
      _tag: "Bookmark",
      id: record.id,
      parentId: record.parentId,
      index: indexInParent(tree, record),
      title: record.title,
      dateAdded: Option.some(record.dateAdded),
      url,
    }),
    onNone: () => describeFolder(tree, record, withChildren),
  })

export const rootFolder = (tree: BookmarkTree) =>
  Result.map(requireRecord(tree, ROOT_ID), (root) => describeFolder(tree, root, true))

export const subTree = (tree: BookmarkTree, id: BookmarkId) =>
  Result.map(requireRecord(tree, id), (record) => describeNode(tree, record, true))

export const shallowNode = (tree: BookmarkTree, id: BookmarkId) =>
  Result.map(requireRecord(tree, id), (record) => describeNode(tree, record, false))

export const childNodes = (tree: BookmarkTree, id: BookmarkId) =>
  Result.map(requireRecord(tree, id), (record) =>
    childrenOf(tree, record).map((child) => describeNode(tree, child, false)),
  )

const descendantsAndSelf = (
  tree: BookmarkTree,
  record: BookmarkRecord,
): ReadonlyArray<BookmarkRecord> => [
  record,
  ...childrenOf(tree, record).flatMap((child) => descendantsAndSelf(tree, child)),
]

const containsAllWords = (text: string, words: ReadonlyArray<string>) =>
  words.every((word) => text.toLowerCase().includes(word))

/**
 * 語の検索は、すべての語がタイトルに含まれるか、すべての語が URL に含まれるノードに一致する。
 * 引用符で囲んだフレーズは扱わない。
 */
export const searchNodes = (
  tree: BookmarkTree,
  query: BookmarkSearchQuery,
): ReadonlyArray<BookmarkNode> => {
  const fields = Predicate.isString(query) ? { query } : query
  const words = (fields.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  const matches = (record: BookmarkRecord) =>
    !isPermanent(record) &&
    (fields.query === undefined ||
      (words.length > 0 &&
        (containsAllWords(record.title, words) ||
          Option.exists(record.url, (url) => containsAllWords(url, words))))) &&
    (fields.title === undefined || record.title === fields.title) &&
    (fields.url === undefined || Option.contains(record.url, fields.url))
  return Option.match(findRecord(tree, ROOT_ID), {
    onNone: () => [],
    onSome: (root) =>
      descendantsAndSelf(tree, root)
        .filter(matches)
        .map((record) => describeNode(tree, record, false)),
  })
}

export const createNode = (
  tree: BookmarkTree,
  now: number,
  options: BookmarkCreateOptions,
): Result.Result<BookmarkOutcome<BookmarkNode>, string> =>
  Result.gen(function* () {
    const parent = yield* requireParentFolder(tree, options.parentId ?? OTHER_BOOKMARKS_ID)
    const index = yield* requireIndexWithin(parent, options.index)
    // Not rejected as an invalid URL: Chrome treats an empty URL as a request for a folder
    const url =
      options.url === undefined || options.url === ""
        ? Option.none()
        : Option.some(yield* requireValidUrl(options.url))
    const id = BookmarkId.make(String(tree.lastIssuedId + 1))
    const record: BookmarkRecord = {
      id,
      parentId: Option.some(parent.id),
      title: options.title ?? "",
      url,
      dateAdded: now,
      folderType: Option.none(),
      childIds: [],
    }
    const grown = replaceRecords(
      { nodes: [...tree.nodes, record], lastIssuedId: tree.lastIssuedId + 1 },
      {
        ...parent,
        childIds: [...parent.childIds.slice(0, index), id, ...parent.childIds.slice(index)],
      },
    )
    const node = describeNode(grown, record, false)
    return { tree: grown, events: [{ _tag: "BookmarkCreated", node }], value: node }
  })

export const updateNode = (
  tree: BookmarkTree,
  id: BookmarkId,
  options: BookmarkUpdateOptions,
): Result.Result<BookmarkOutcome<BookmarkNode>, string> =>
  Result.gen(function* () {
    const record = yield* Result.flatMap(requireRecord(tree, id), requireModifiable)
    if (options.url !== undefined && isFolder(record)) {
      return yield* Result.fail("Can't set URL of a bookmark folder.")
    }
    const url =
      options.url === undefined ? record.url : Option.some(yield* requireValidUrl(options.url))
    const title = options.title ?? record.title
    const titleChanged = title !== record.title
    const urlChanged = !sameUrl(url, record.url)
    const retitled = { ...record, title }
    const updated = { ...retitled, url }
    const changed = (changedRecord: BookmarkRecord): BrowserEvent => ({
      _tag: "BookmarkChanged",
      id,
      title: changedRecord.title,
      url: changedRecord.url,
    })
    // Chrome はタイトルと URL を別々に書き換え、それぞれで onChanged を発火する
    const events = [
      ...(titleChanged ? [changed(retitled)] : []),
      ...(urlChanged ? [changed(updated)] : []),
    ]
    const next = replaceRecords(tree, updated)
    return { tree: next, events, value: describeNode(next, updated, false) }
  })

const sameUrl = Option.makeEquivalence(Equivalence.strictEqual<string>())

const isWithin = (tree: BookmarkTree, candidate: BookmarkRecord, ancestorId: BookmarkId): boolean =>
  candidate.id === ancestorId ||
  Option.exists(
    Option.flatMap(candidate.parentId, (parentId) => findRecord(tree, parentId)),
    (parent) => isWithin(tree, parent, ancestorId),
  )

export const moveNode = (
  tree: BookmarkTree,
  id: BookmarkId,
  options: BookmarkMoveOptions,
): Result.Result<BookmarkOutcome<BookmarkNode>, string> =>
  Result.gen(function* () {
    const record = yield* Result.flatMap(requireRecord(tree, id), requireModifiable)
    const oldParent = yield* requireParentFolder(
      tree,
      Option.getOrElse(record.parentId, () => ROOT_ID),
    )
    const newParent = yield* requireParentFolder(tree, options.parentId ?? oldParent.id)
    if (isWithin(tree, newParent, id)) {
      return yield* Result.fail("Can't move a folder to itself or its descendant.")
    }
    const requested = yield* requireIndexWithin(newParent, options.index)
    const oldIndex = oldParent.childIds.indexOf(id)
    const sameParent = newParent.id === oldParent.id
    // Chrome は index を「移動するノード自身も数えた並びでの差し込み位置」と解釈し、
    // 今の位置かその直後を指すと何もしない
    if (sameParent && (requested === oldIndex || requested === oldIndex + 1)) {
      return { tree, events: [], value: describeNode(tree, record, false) }
    }
    const index = sameParent && requested > oldIndex ? requested - 1 : requested
    const withoutNode = (parent: BookmarkRecord) =>
      parent.childIds.filter((childId) => childId !== id)
    const destinationChildren = withoutNode(sameParent ? oldParent : newParent)
    const moved = { ...record, parentId: Option.some(newParent.id) }
    const next = replaceRecords(
      tree,
      ...(sameParent ? [] : [{ ...oldParent, childIds: withoutNode(oldParent) }]),
      {
        ...newParent,
        childIds: [...destinationChildren.slice(0, index), id, ...destinationChildren.slice(index)],
      },
      moved,
    )
    return {
      tree: next,
      events: [
        {
          _tag: "BookmarkMoved",
          id,
          parentId: newParent.id,
          index,
          oldParentId: oldParent.id,
          oldIndex,
        },
      ],
      value: describeNode(next, moved, false),
    }
  })

export const removeNode = (
  tree: BookmarkTree,
  id: BookmarkId,
  recursive: boolean,
): Result.Result<BookmarkOutcome<void>, string> =>
  Result.gen(function* () {
    const record = yield* Result.flatMap(requireRecord(tree, id), requireModifiable)
    if (!recursive && record.childIds.length > 0) {
      return yield* Result.fail("Can't remove non-empty folder (use recursive to remove).")
    }
    const parent = yield* requireParentFolder(
      tree,
      Option.getOrElse(record.parentId, () => ROOT_ID),
    )
    const removedIds = descendantsAndSelf(tree, record).map((removed) => removed.id)
    const next = replaceRecords(
      { ...tree, nodes: tree.nodes.filter((node) => !removedIds.includes(node.id)) },
      { ...parent, childIds: parent.childIds.filter((childId) => childId !== id) },
    )
    return {
      tree: next,
      events: [
        {
          _tag: "BookmarkRemoved",
          id,
          parentId: parent.id,
          index: parent.childIds.indexOf(id),
          // Chrome leaves the parent and index out of the removed node itself (its children keep them)
          node: {
            ...describeNode(tree, record, true),
            parentId: Option.none(),
            index: Option.none(),
          },
        },
      ],
      value: undefined,
    }
  })
