import { Array, Option, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { groupColorOf, neutralTheme, presetPages, themeOf } from "#modules/theme"
import { Space, SpaceId, SpaceName } from "./space"
import {
  addSpace,
  moveSpace,
  nextSpaceName,
  removeSpace,
  renameSpace,
  setSpaceTheme,
  type SpaceList,
  unusedSpaceName,
} from "./space-list"

const spaceId = (value: string) => SpaceId.make(value)
const spaceName = (value: string) => SpaceName.make(value)

const space = (id: string, overrides: Partial<Omit<Space, "id">> = {}): Space => ({
  id: spaceId(id),
  name: spaceName(id),
  theme: neutralTheme,
  ...overrides,
})

const idsOf = (spaces: SpaceList) => spaces.map((s) => s.id)

describe("SpaceName", () => {
  const decode = Schema.decodeUnknownOption(SpaceName)

  it("accepts a name with the surrounding whitespace trimmed", () => {
    expect(decode("  Work  ")).toStrictEqual(decode("Work"))
  })

  it("rejects a name that is only whitespace", () => {
    expect(decode("   ")._tag).toBe("None")
  })
})

describe("the name of a Space created without one", () => {
  const numbered = (number: number) => `Space ${number}`

  it("is numbered one past the count of Spaces", () => {
    expect(nextSpaceName([space("a"), space("b")], numbered)).toBe("Space 3")
  })

  it("when that numbered name is taken, takes the next number that is free", () => {
    const spaces = [space("a", { name: spaceName("Space 2") })]

    expect(nextSpaceName(spaces, numbered)).toBe("Space 3")
  })

  it("starts at 1 when there are no Spaces", () => {
    expect(nextSpaceName([], numbered)).toBe("Space 1")
  })
})

describe("a suggested name kept apart from the existing Spaces' names", () => {
  const arc = spaceName("Arc")

  it("is the name itself when no Space has it", () => {
    expect(unusedSpaceName([space("Work"), space("Arcade")], arc)).toBe("Arc")
  })

  it("gets the number 2 when a Space has the name", () => {
    expect(unusedSpaceName([space("Arc")], arc)).toBe("Arc 2")
  })

  it("gets the lowest number from 2 that no Space has", () => {
    const spaces = [space("Arc"), space("Arc 2"), space("Arc 4")]

    expect(unusedSpaceName(spaces, arc)).toBe("Arc 3")
  })

  it("finds a free number however many numbered names are taken", () => {
    const spaces = [space("Arc"), ...Array.makeBy(5, (index) => space(`Arc ${index + 2}`))]

    expect(unusedSpaceName(spaces, arc)).toBe("Arc 7")
  })
})

describe("addSpace", () => {
  it("appends the Space to the end of the list", () => {
    const spaces = [space("a"), space("b")]

    const added = addSpace(spaces, { id: spaceId("c"), name: spaceName("c") })

    expect(idsOf(added)).toStrictEqual(["a", "b", "c"])
  })

  it("without a theme, gives a preset whose color family no existing Space uses", () => {
    const redPreset = Option.getOrThrow(
      Array.findFirst(
        (presetPages[0] ?? []).flatMap((preset) =>
          preset._tag === "Colors" ? [preset.colors] : [],
        ),
        (colors) => groupColorOf(themeOf(colors)) === "red",
      ),
    )
    const spaces = [space("a", { theme: themeOf(redPreset) })]

    const added = addSpace(spaces, { id: spaceId("b"), name: spaceName("b") })

    expect(added.map((s) => groupColorOf(s.theme))).not.toContain("grey")
    expect(new Set(added.map((s) => groupColorOf(s.theme))).size).toBe(2)
  })

  it("with a name and a theme, creates the Space with them", () => {
    const theme = themeOf([{ hue: 350, chroma: 0.6 }])

    const added = addSpace([], { id: spaceId("a"), name: spaceName("Hobbies"), theme })

    expect(added).toStrictEqual([{ id: "a", name: "Hobbies", theme }])
  })
})

describe("renameSpace", () => {
  it("changes only the named Space's name", () => {
    const spaces = [space("a"), space("b")]

    const renamed = renameSpace(spaces, spaceId("b"), spaceName("Reading"))

    expect(Result.getOrThrow(renamed).map((s) => s.name)).toStrictEqual(["a", "Reading"])
  })

  it("fails with SpaceNotFound for a Space that doesn't exist", () => {
    const renamed = renameSpace([space("a")], spaceId("missing"), spaceName("x"))

    expect(Result.isFailure(renamed) && renamed.failure._tag).toBe("SpaceNotFound")
  })
})

describe("setSpaceTheme", () => {
  const green = themeOf([{ hue: 145, chroma: 0.7 }])

  it("changes only the named Space's theme", () => {
    const spaces = [space("a"), space("b")]

    const updated = setSpaceTheme(spaces, spaceId("a"), green)

    expect(Result.getOrThrow(updated).map((s) => s.theme)).toStrictEqual([green, neutralTheme])
  })

  it("fails with SpaceNotFound for a Space that doesn't exist", () => {
    const updated = setSpaceTheme([space("a")], spaceId("missing"), green)

    expect(Result.isFailure(updated) && updated.failure._tag).toBe("SpaceNotFound")
  })
})

describe("stored Space", () => {
  it("a Space saved before themes existed reads as having the neutral theme", () => {
    const decoded = Schema.decodeUnknownSync(Space)({ id: "a", name: "Work", color: "blue" })

    expect(decoded).toStrictEqual({ id: "a", name: "Work", theme: neutralTheme })
  })
})

describe("removeSpace", () => {
  it("removes the named Space and keeps the rest in order", () => {
    const spaces = [space("a"), space("b"), space("c")]

    const removed = removeSpace(spaces, spaceId("b"))

    expect(idsOf(Result.getOrThrow(removed))).toStrictEqual(["a", "c"])
  })

  it("refuses to remove the last Space", () => {
    const removed = removeSpace([space("a")], spaceId("a"))

    expect(Result.isFailure(removed) && removed.failure._tag).toBe("LastSpaceRemoval")
  })

  it("fails with SpaceNotFound for a Space that doesn't exist", () => {
    const removed = removeSpace([space("a"), space("b")], spaceId("missing"))

    expect(Result.isFailure(removed) && removed.failure._tag).toBe("SpaceNotFound")
  })
})

describe("moveSpace", () => {
  it("moves the Space to the given position, keeping the others in their relative order", () => {
    const spaces = [space("a"), space("b"), space("c"), space("d")]

    const moved = moveSpace(spaces, spaceId("a"), 2)

    expect(idsOf(Result.getOrThrow(moved))).toStrictEqual(["b", "c", "a", "d"])
  })

  it("moves the Space to the end when the position is past the end", () => {
    const spaces = [space("a"), space("b"), space("c")]

    const moved = moveSpace(spaces, spaceId("a"), 99)

    expect(idsOf(Result.getOrThrow(moved))).toStrictEqual(["b", "c", "a"])
  })

  it("moves the Space to the start when the position is negative", () => {
    const spaces = [space("a"), space("b"), space("c")]

    const moved = moveSpace(spaces, spaceId("c"), -1)

    expect(idsOf(Result.getOrThrow(moved))).toStrictEqual(["c", "a", "b"])
  })

  it("fails with SpaceNotFound for a Space that doesn't exist", () => {
    const moved = moveSpace([space("a")], spaceId("missing"), 0)

    expect(Result.isFailure(moved) && moved.failure._tag).toBe("SpaceNotFound")
  })
})
