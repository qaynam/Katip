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
  const minutesInput = () =>
    screen.getByRole<HTMLInputElement>("textbox", { name: "自動でアーカイブするまでの時間（分）" })

  it("オンにすると、今の時間設定のまま有効にする", async () => {
    const { connection } = await renderArchive({
      autoArchive: { enabled: false, idleMinutes: IdleMinutes.make(90) },
    })

    await fireEvent.click(
      screen.getByRole("checkbox", { name: "使っていないタブを自動でアーカイブ" }),
    )

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "UpdateAutoArchive", enabled: true, idleMinutes: 90 },
    ])
  })

  it("分数を書き換えて確定すると、その分数に変える", async () => {
    const { connection } = await renderArchive({
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) },
    })

    await fireEvent.input(minutesInput(), { target: { value: "30" } })
    await fireEvent.change(minutesInput())

    expect(connection.sentCommands).toStrictEqual([
      { _tag: "UpdateAutoArchive", enabled: true, idleMinutes: 30 },
    ])
  })

  it("不正な分数はコマンドを送らず、その場で理由を示す", async () => {
    const { connection } = await renderArchive({
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) },
    })

    await fireEvent.input(minutesInput(), { target: { value: "0" } })
    await fireEvent.change(minutesInput())

    expect(connection.sentCommands).toStrictEqual([])
    expect(screen.getByRole("alert").textContent).toBe("1 分以上にしてください")
    expect(minutesInput().getAttribute("aria-invalid")).toBe("true")
  })

  it("理由を示したあとで書き直し始めると、理由を消す", async () => {
    await renderArchive({ autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) } })
    await fireEvent.input(minutesInput(), { target: { value: "1.5" } })
    await fireEvent.change(minutesInput())

    await fireEvent.input(minutesInput(), { target: { value: "15" } })

    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("入力中に新しいビューが届いても、入力中の分数は消えない", async () => {
    const { pushView } = await renderArchive({
      autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(90) },
    })
    await fireEvent.input(minutesInput(), { target: { value: "4" } })

    await pushView(
      sidebarView({
        spaces: [work, hobby],
        archive: archived,
        autoArchive: { enabled: true, idleMinutes: IdleMinutes.make(120) },
      }),
    )

    expect(minutesInput().value).toBe("4")
  })

  it("オフの間は時間を変えられない", async () => {
    await renderArchive({ autoArchive: { enabled: false, idleMinutes: IdleMinutes.make(90) } })

    expect(minutesInput().disabled).toBe(true)
  })
})
