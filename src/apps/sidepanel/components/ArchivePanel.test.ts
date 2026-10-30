import { fireEvent, screen, within } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { IdleMinutes } from "#modules/settings"
import { SpaceId } from "#modules/space"
import { renderSidebar } from "../testing/render-sidebar"
import { archiveEntry, sidebarView, spaceView } from "../testing/view-builders"

const work = spaceView("work")
const hobby = spaceView("hobby")
const archived = [
  archiveEntry("older", { title: "古い記事", spaceId: work.id, archivedAt: 1_000 }),
  archiveEntry("newer", { title: "新しい記事", spaceId: work.id, archivedAt: 2_000 }),
  archiveEntry("hobby", { title: "趣味の記事", spaceId: SpaceId.make("hobby"), archivedAt: 3_000 }),
]

const renderArchive = async (overrides: Parameters<typeof sidebarView>[0] = {}) => {
  const rendered = await renderSidebar(
    sidebarView({ spaces: [work, hobby], archive: archived, ...overrides }),
  )
  await fireEvent.click(screen.getByRole("button", { name: "アーカイブ" }))
  return rendered
}

const archiveRegion = () => screen.getByRole("region", { name: "アーカイブ" })
const entryTitles = () =>
  within(archiveRegion())
    .getAllByRole("listitem")
    .map((item) => within(item).getAllByRole("button")[0]?.textContent ?? "")

describe("アーカイブパネル", () => {
  it("開くと、表示中の Space のアーカイブを新しい順に並べる", async () => {
    await renderArchive()

    const titles = entryTitles()

    expect(titles).toHaveLength(2)
    expect(titles[0]).toContain("新しい記事")
    expect(titles[1]).toContain("古い記事")
  })

  it("「すべての Space」を選ぶと、他の Space のアーカイブも並べる", async () => {
    await renderArchive()

    await fireEvent.click(screen.getByRole("radio", { name: "すべての Space" }))

    expect(entryTitles()[0]).toContain("趣味の記事")
  })

  it("項目を押すとこのウィンドウに復元する", async () => {
    const { connection } = await renderArchive()

    await fireEvent.click(within(archiveRegion()).getByRole("button", { name: /新しい記事/ }))

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RestoreArchiveEntry", windowId: 1, entryId: "newer" },
    ])
  })

  it("× を押すとアーカイブから消す", async () => {
    const { connection } = await renderArchive()
    const [newest] = within(archiveRegion()).getAllByRole("listitem")

    await fireEvent.click(
      within(newest as HTMLElement).getByRole("button", { name: "アーカイブから削除" }),
    )

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "RemoveArchiveEntry", entryId: "newer" },
    ])
  })

  it("アーカイブが無ければそう示す", async () => {
    await renderArchive({ archive: [] })

    expect(within(archiveRegion()).getByText("アーカイブしたタブはありません")).toBeTruthy()
  })
})

describe("自動アーカイブの設定", () => {
  const durationSelect = () =>
    screen.getByRole<HTMLSelectElement>("combobox", { name: "自動でアーカイブするまでの時間" })
  const optionTexts = () =>
    [...durationSelect().options].map((option) => option.textContent?.trim())
  const selectedText = () => durationSelect().selectedOptions[0]?.textContent?.trim()

  it("オンにすると、今の時間設定のまま有効にする", async () => {
    const { connection } = await renderArchive({
      autoArchive: { enabled: false, idleMinutes: IdleMinutes.make(360) },
    })

    await fireEvent.click(
      screen.getByRole("checkbox", { name: "使っていないタブを自動でアーカイブ" }),
    )

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "UpdateAutoArchive", enabled: true, idleMinutes: 360 },
    ])
  })

  it("時間は、割り切れる最も大きい単位で選択肢に並べる", async () => {
    await renderArchive({ autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(360) } })

    expect(optionTexts()).toStrictEqual([
      "30 分",
      "1 時間",
      "3 時間",
      "6 時間",
      "12 時間",
      "1 日",
      "3 日",
      "1 週間",
    ])
  })

  it("今の設定の時間が選択中になる", async () => {
    await renderArchive({ autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(3 * 1440) } })

    expect(selectedText()).toBe("3 日")
  })

  it("時間を選ぶと、選んだ分数に変える", async () => {
    const { connection } = await renderArchive({
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(360) },
    })

    await fireEvent.change(durationSelect(), { target: { value: "1440" } })

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "UpdateAutoArchive", enabled: true, idleMinutes: 1440 },
    ])
  })

  it("選択肢に無い保存値も、選択中として表示する", async () => {
    await renderArchive({ autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) } })

    expect(selectedText()).toBe("90 分")
    expect(optionTexts().slice(0, 3)).toStrictEqual(["30 分", "1 時間", "90 分"])
  })

  it("オフの間は時間を変えられない", async () => {
    await renderArchive({ autoArchive: { enabled: false, idleMinutes: IdleMinutes.make(360) } })

    expect(durationSelect().disabled).toBe(true)
  })
})
