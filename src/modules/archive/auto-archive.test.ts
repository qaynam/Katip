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
  it("Space に属し、最後に使ってから閾値を超えた一時タブが対象になる", () => {
    expect(selectLabels([tab("idle")])).toStrictEqual(["idle"])
  })

  it("対象には所属する Space が添えられる", () => {
    const targets = selectAutoArchiveTargets([tab("idle")], { now, idleMinutes })

    expect(targets.map((target) => target.spaceId)).toStrictEqual([work])
  })

  it("最後に使ってからちょうど閾値の時間しか経っていないタブは対象にならない", () => {
    const justAtThreshold = tab("just", { lastActiveAt: now - minutes(idleMinutes) })

    expect(selectLabels([justAtThreshold])).toStrictEqual([])
  })

  it("最後に使った時刻が現在より後のタブは対象にならない", () => {
    expect(selectLabels([tab("future", { lastActiveAt: now + minutes(1) })])).toStrictEqual([])
  })

  it("どの Space にも属さないタブは対象にならない", () => {
    expect(selectLabels([tab("loose", { spaceId: Option.none() })])).toStrictEqual([])
  })

  describe("保護されたタブ", () => {
    it.each([
      ["アクティブなタブ", { isActive: true }],
      ["音声を再生中のタブ", { isAudible: true }],
      ["Chrome で固定したタブ", { isChromePinned: true }],
      ["ピンにバインドされたタブ", { isBoundToPin: true }],
    ] as const)("%s は閾値を超えていても対象にならない", (_, protection) => {
      expect(selectLabels([tab("protected", protection)])).toStrictEqual([])
    })
  })

  it("対象になるタブだけが入力の順序のまま返る", () => {
    const tabs = [
      tab("idle-1"),
      tab("active", { isActive: true }),
      tab("recent", { lastActiveAt: now }),
      tab("idle-2"),
    ]

    expect(selectLabels(tabs)).toStrictEqual(["idle-1", "idle-2"])
  })

  it("タブが無ければ対象も無い", () => {
    expect(selectLabels([])).toStrictEqual([])
  })
})

describe("autoArchiveCheckIntervalMinutes", () => {
  it("閾値の 4 分の 1 の間隔で確認する", () => {
    expect(autoArchiveCheckIntervalMinutes(20)).toBe(5)
  })

  it.each([1, 2, 4])("閾値が %i 分と短くても、1 分より頻繁には確認しない", (threshold) => {
    expect(autoArchiveCheckIntervalMinutes(threshold)).toBe(1)
  })

  it.each([60, 360, 10_080])("閾値が %i 分と長くても、15 分より間隔を空けない", (threshold) => {
    expect(autoArchiveCheckIntervalMinutes(threshold)).toBe(15)
  })
})
