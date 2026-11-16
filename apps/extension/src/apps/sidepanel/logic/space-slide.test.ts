import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import { switchDirection } from "./space-slide"
import { newSpacePage, spacePage, type SidebarPage } from "./swipe"

const order = (...ids: ReadonlyArray<string>) => ids.map((id) => ({ id: SpaceId.make(id) }))
const space = (id: string) => spacePage(SpaceId.make(id))
const direction = (
  previousIds: ReadonlyArray<string>,
  ids: ReadonlyArray<string>,
  from: SidebarPage,
  to: SidebarPage,
) => Option.getOrNull(switchDirection(order(...previousIds), order(...ids), from, to))

describe("switchDirection", () => {
  it("goes toward the next pages when switching to a Space further along the bar", () => {
    expect(direction(["a", "b", "c"], ["a", "b", "c"], space("a"), space("c"))).toBe("next")
  })

  it("goes toward the previous pages when switching to a Space earlier in the bar", () => {
    expect(direction(["a", "b", "c"], ["a", "b", "c"], space("c"), space("b"))).toBe("previous")
  })

  it("follows the order before the switch when the Space left behind was deleted", () => {
    expect(direction(["a", "b", "c"], ["a", "c"], space("b"), space("a"))).toBe("previous")
  })

  it("goes toward the next pages for a Space created at the end from elsewhere", () => {
    expect(direction(["a", "b"], ["a", "b", "c"], space("a"), space("c"))).toBe("next")
  })

  it("puts the new Space being named after the last Space", () => {
    expect([
      direction(["a", "b"], ["a", "b"], space("b"), newSpacePage),
      direction(["a", "b"], ["a", "b"], newSpacePage, space("b")),
    ]).toStrictEqual(["next", "previous"])
  })

  it("doesn't move when the Space just created takes the place of the new Space being named", () => {
    expect(direction(["a", "b"], ["a", "b", "c"], newSpacePage, space("c"))).toBeNull()
  })
})
