import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { BookmarkId } from "#platform/browser"
import {
  planSpaceFolderReconciliation,
  SpaceFolderAction,
  type KatipRootFolder,
  type SpaceFolderMap,
} from "./space-folder-reconciliation"

const spaceId = (value: string) => SpaceId.make(value)
const spaceName = (value: string) => SpaceName.make(value)
const bookmarkId = (value: string) => BookmarkId.make(value)

const space = (id: string, name: string = id): Space => ({
  id: spaceId(id),
  name: spaceName(name),
  color: "grey",
})

const rootFolder = (id: string, title: string): KatipRootFolder => ({ id: bookmarkId(id), title })

const spaceFolders = (entries: Record<string, string>): SpaceFolderMap =>
  Object.fromEntries(
    Object.entries(entries).map(([space, folder]) => [spaceId(space), bookmarkId(folder)]),
  )

describe("Space と Katip 直下のフォルダが対応しているとき", () => {
  it("フォルダ名が外部で変わっていたら、Space 名をフォルダ名に合わせる", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "本業")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.AdoptFolderTitle({ spaceId: spaceId("work"), name: spaceName("本業") }),
    ])
  })

  it("フォルダ名と Space 名が同じなら何もしない", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "仕事")],
    })

    expect(plan).toStrictEqual([])
  })

  it("前後の空白だけが違うフォルダ名は同じ名前とみなす", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "  仕事 ")],
    })

    expect(plan).toStrictEqual([])
  })

  it("フォルダ名が空白だけにされていたら、フォルダ名を Space 名に戻す", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "   ")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.RestoreFolderTitle({
        folderId: bookmarkId("f1"),
        title: spaceName("仕事"),
      }),
    ])
  })
})

describe("Space のフォルダが Katip 直下に見つからないとき", () => {
  it("対応表のフォルダが消えていたら、フォルダを作り直す", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({ work: "gone" }),
      rootFolders: [],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("work"), title: spaceName("仕事") }),
    ])
  })

  it("対応表のフォルダが Katip の外へ移されていたら、消えたものとして作り直す", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({ work: "moved-out" }),
      rootFolders: [rootFolder("other", "趣味")],
    })

    expect(plan).toContainEqual(
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("work"), title: spaceName("仕事") }),
    )
  })

  it("対応表に載っていない Space にもフォルダを作る", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({}),
      rootFolders: [],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("work"), title: spaceName("仕事") }),
    ])
  })

  it("同じ名前の、どの Space にも対応していないフォルダがあれば、作らずにそのフォルダと結び直す", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({ work: "old-id" }),
      rootFolders: [rootFolder("new-id", "仕事")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.RelinkFolder({ spaceId: spaceId("work"), folderId: bookmarkId("new-id") }),
    ])
  })

  it("同じ名前の候補が複数あれば先に並んでいるフォルダと結び直し、残りのフォルダからは Space を作る", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "仕事")],
      spaceFolders: spaceFolders({}),
      rootFolders: [rootFolder("first", "仕事"), rootFolder("second", "仕事")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.RelinkFolder({ spaceId: spaceId("work"), folderId: bookmarkId("first") }),
      SpaceFolderAction.CreateSpaceFromFolder({
        folderId: bookmarkId("second"),
        name: Option.some(spaceName("仕事")),
      }),
    ])
  })

  it("ほかの Space に対応しているフォルダとは、同じ名前でも結び直さない", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("a", "仕事"), space("b", "仕事")],
      spaceFolders: spaceFolders({ a: "f1" }),
      rootFolders: [rootFolder("f1", "仕事")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("b"), title: spaceName("仕事") }),
    ])
  })
})

describe("どの Space にも対応していないフォルダが Katip 直下にあるとき", () => {
  it("フォルダの名前で Space を作る", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [],
      spaceFolders: spaceFolders({}),
      rootFolders: [rootFolder("f1", "読書")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFromFolder({
        folderId: bookmarkId("f1"),
        name: Option.some(spaceName("読書")),
      }),
    ])
  })

  it("フォルダ名が Space 名として使えなければ、名前を決めずに Space を作る", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [],
      spaceFolders: spaceFolders({}),
      rootFolders: [rootFolder("f1", "")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFromFolder({ folderId: bookmarkId("f1"), name: Option.none() }),
    ])
  })

  it("Space はフォルダの並び順に作る", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [],
      spaceFolders: spaceFolders({}),
      rootFolders: [rootFolder("f2", "B"), rootFolder("f1", "A")],
    })

    expect(
      plan.map((action) => action._tag === "CreateSpaceFromFolder" && action.folderId),
    ).toStrictEqual(["f2", "f1"])
  })
})

describe("対応表が Space 一覧と食い違っているとき", () => {
  it("一覧に無い Space の対応は忘れる", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [],
      spaceFolders: spaceFolders({ deleted: "gone" }),
      rootFolders: [],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.ForgetSpaceFolder({ spaceId: spaceId("deleted") }),
    ])
  })

  it("2 つの Space が同じフォルダを指していたら、一覧で先の Space がフォルダを持ち、後の Space にはフォルダを作る", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("a", "仕事"), space("b", "趣味")],
      spaceFolders: spaceFolders({ a: "f1", b: "f1" }),
      rootFolders: [rootFolder("f1", "仕事")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("b"), title: spaceName("趣味") }),
    ])
  })
})

it("Space も対応表もフォルダも空なら何もしない", () => {
  const plan = planSpaceFolderReconciliation({
    spaces: [],
    spaceFolders: spaceFolders({}),
    rootFolders: [],
  })

  expect(plan).toStrictEqual([])
})
