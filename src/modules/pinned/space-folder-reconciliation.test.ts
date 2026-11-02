import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId, SpaceName, type Space } from "#modules/space"
import { neutralTheme } from "#modules/theme"
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
  theme: neutralTheme,
})

const rootFolder = (id: string, title: string): KatipRootFolder => ({ id: bookmarkId(id), title })

const spaceFolders = (entries: Record<string, string>): SpaceFolderMap =>
  Object.fromEntries(
    Object.entries(entries).map(([space, folder]) => [spaceId(space), bookmarkId(folder)]),
  )

describe("when a Space and a folder directly inside Katip are mapped to each other", () => {
  it("a folder renamed outside Katip gives its name to the Space", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "Day job")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.AdoptFolderTitle({ spaceId: spaceId("work"), name: spaceName("Day job") }),
    ])
  })

  it("does nothing when the folder and the Space have the same name", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "Work")],
    })

    expect(plan).toStrictEqual([])
  })

  it("a folder name that differs only in surrounding whitespace counts as the same name", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "  Work ")],
    })

    expect(plan).toStrictEqual([])
  })

  it("a folder renamed to only whitespace gets the Space's name back", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({ work: "f1" }),
      rootFolders: [rootFolder("f1", "   ")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.RestoreFolderTitle({
        folderId: bookmarkId("f1"),
        title: spaceName("Work"),
      }),
    ])
  })
})

describe("when a Space's folder isn't found directly inside Katip", () => {
  it("recreates the folder when the mapped folder is gone", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({ work: "gone" }),
      rootFolders: [],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("work"), title: spaceName("Work") }),
    ])
  })

  it("a mapped folder moved out of Katip counts as gone and is recreated", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({ work: "moved-out" }),
      rootFolders: [rootFolder("other", "Hobbies")],
    })

    expect(plan).toContainEqual(
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("work"), title: spaceName("Work") }),
    )
  })

  it("creates a folder for a Space missing from the map too", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({}),
      rootFolders: [],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("work"), title: spaceName("Work") }),
    ])
  })

  it("relinks an unowned folder with the same name instead of creating one", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({ work: "old-id" }),
      rootFolders: [rootFolder("new-id", "Work")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.RelinkFolder({ spaceId: spaceId("work"), folderId: bookmarkId("new-id") }),
    ])
  })

  it("with several same-named candidates, relinks the first one and makes Spaces from the rest", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("work", "Work")],
      spaceFolders: spaceFolders({}),
      rootFolders: [rootFolder("first", "Work"), rootFolder("second", "Work")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.RelinkFolder({ spaceId: spaceId("work"), folderId: bookmarkId("first") }),
      SpaceFolderAction.CreateSpaceFromFolder({
        folderId: bookmarkId("second"),
        name: Option.some(spaceName("Work")),
      }),
    ])
  })

  it("doesn't relink a folder another Space owns, even with the same name", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("a", "Work"), space("b", "Work")],
      spaceFolders: spaceFolders({ a: "f1" }),
      rootFolders: [rootFolder("f1", "Work")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("b"), title: spaceName("Work") }),
    ])
  })
})

describe("when a folder directly inside Katip belongs to no Space", () => {
  it("creates a Space named after the folder", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [],
      spaceFolders: spaceFolders({}),
      rootFolders: [rootFolder("f1", "Reading")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFromFolder({
        folderId: bookmarkId("f1"),
        name: Option.some(spaceName("Reading")),
      }),
    ])
  })

  it("creates a Space with no name decided when the folder name can't be a Space name", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [],
      spaceFolders: spaceFolders({}),
      rootFolders: [rootFolder("f1", "")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFromFolder({ folderId: bookmarkId("f1"), name: Option.none() }),
    ])
  })

  it("creates the Spaces in the folders' order", () => {
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

describe("when the map disagrees with the Space list", () => {
  it("forgets the mapping of a Space not in the list", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [],
      spaceFolders: spaceFolders({ deleted: "gone" }),
      rootFolders: [],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.ForgetSpaceFolder({ spaceId: spaceId("deleted") }),
    ])
  })

  it("when two Spaces point at one folder, the Space first in the list keeps it and the later one gets a new folder", () => {
    const plan = planSpaceFolderReconciliation({
      spaces: [space("a", "Work"), space("b", "Hobbies")],
      spaceFolders: spaceFolders({ a: "f1", b: "f1" }),
      rootFolders: [rootFolder("f1", "Work")],
    })

    expect(plan).toStrictEqual([
      SpaceFolderAction.CreateSpaceFolder({ spaceId: spaceId("b"), title: spaceName("Hobbies") }),
    ])
  })
})

it("does nothing when there are no Spaces, mappings or folders", () => {
  const plan = planSpaceFolderReconciliation({
    spaces: [],
    spaceFolders: spaceFolders({}),
    rootFolders: [],
  })

  expect(plan).toStrictEqual([])
})
