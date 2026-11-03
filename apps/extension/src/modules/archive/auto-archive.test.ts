import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { SpaceId } from "#modules/space"
import {
  autoArchiveCheckIntervalMinutes,
  selectAutoArchiveTargets,
  type AutoArchiveTab,
} from "./auto-archive"

const minutes = (n: number) => n * 60_000

const now = minutes(10_000)
const idleMinutes = 60
const work = SpaceId.make("work")

interface LabeledTab extends AutoArchiveTab {
  readonly label: string
}

const tab = (label: string, overrides: Partial<AutoArchiveTab> = {}): LabeledTab => ({
  label,
  spaceId: Option.some(work),
  isActive: false,
  isAudible: false,
  isChromePinned: false,
  isBoundToPin: false,
  lastActiveAt: now - minutes(idleMinutes + 1),
  ...overrides,
})

const selectLabels = (tabs: ReadonlyArray<LabeledTab>) =>
  selectAutoArchiveTargets(tabs, { now, idleMinutes }).map((target) => target.tab.label)

describe("selectAutoArchiveTargets", () => {
  it("selects a temporary tab in a Space last used longer ago than the threshold", () => {
    expect(selectLabels([tab("idle")])).toStrictEqual(["idle"])
  })

  it("gives each target the Space it belongs to", () => {
    const targets = selectAutoArchiveTargets([tab("idle")], { now, idleMinutes })

    expect(targets.map((target) => target.spaceId)).toStrictEqual([work])
  })

  it("doesn't select a tab last used exactly the threshold ago", () => {
    const justAtThreshold = tab("just", { lastActiveAt: now - minutes(idleMinutes) })

    expect(selectLabels([justAtThreshold])).toStrictEqual([])
  })

  it("doesn't select a tab last used later than now", () => {
    expect(selectLabels([tab("future", { lastActiveAt: now + minutes(1) })])).toStrictEqual([])
  })

  it("doesn't select a tab that belongs to no Space", () => {
    expect(selectLabels([tab("loose", { spaceId: Option.none() })])).toStrictEqual([])
  })

  describe("protected tabs", () => {
    it.each([
      ["an active tab", { isActive: true }],
      ["a tab playing audio", { isAudible: true }],
      ["a tab pinned in Chrome", { isChromePinned: true }],
      ["a tab bound to a pin", { isBoundToPin: true }],
    ] as const)("%s isn't selected even past the threshold", (_, protection) => {
      expect(selectLabels([tab("protected", protection)])).toStrictEqual([])
    })
  })

  it("returns only the selected tabs, in input order", () => {
    const tabs = [
      tab("idle-1"),
      tab("active", { isActive: true }),
      tab("recent", { lastActiveAt: now }),
      tab("idle-2"),
    ]

    expect(selectLabels(tabs)).toStrictEqual(["idle-1", "idle-2"])
  })

  it("selects nothing when there are no tabs", () => {
    expect(selectLabels([])).toStrictEqual([])
  })
})

describe("autoArchiveCheckIntervalMinutes", () => {
  it("checks every quarter of the threshold", () => {
    expect(autoArchiveCheckIntervalMinutes(20)).toBe(5)
  })

  it.each([1, 2, 4])(
    "doesn't check more often than every minute, even for a threshold as short as %i minutes",
    (threshold) => {
      expect(autoArchiveCheckIntervalMinutes(threshold)).toBe(1)
    },
  )

  it.each([60, 360, 10_080])(
    "checks at least every 15 minutes, even for a threshold as long as %i minutes",
    (threshold) => {
      expect(autoArchiveCheckIntervalMinutes(threshold)).toBe(15)
    },
  )
})
