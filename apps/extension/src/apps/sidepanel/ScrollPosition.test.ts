import { fireEvent, screen } from "@testing-library/svelte"
import { describe, expect, it } from "vitest"
import { createMemoryScrollPositions } from "./connection/memory-scroll-positions"
import { renderSidebar } from "./testing/render-sidebar"
import { sidebarView, spaceView, tabView } from "./testing/view-builders"

const work = spaceView("work", { temporaryTabs: [tabView(1)] })
const hobby = spaceView("hobby", { temporaryTabs: [tabView(2)] })
const view = sidebarView({ spaces: [work, hobby] })

const spaceList = (container: HTMLElement) => {
  const list = container.querySelector<HTMLElement>("[data-space-body]")
  if (list === null) throw new Error("no Space list is shown")
  return list
}

// The saved position is read asynchronously, after the list first shows
const restored = () => new Promise((resolve) => setTimeout(resolve, 0))

const scrollTo = async (list: HTMLElement, top: number) => {
  list.scrollTop = top
  await fireEvent(list, new Event("scrollend"))
}

describe("Scroll position", () => {
  it("opens the list where it was scrolled when the side panel was closed", async () => {
    const scrollPositions = createMemoryScrollPositions()
    const closed = await renderSidebar(view, { scrollPositions })
    await restored()
    await scrollTo(spaceList(closed.container), 240)
    closed.unmount()

    const { container } = await renderSidebar(view, { scrollPositions })
    await restored()

    expect(spaceList(container).scrollTop).toBe(240)
  })

  it("returns a Space's list to where it was when switching back to that Space", async () => {
    const { container, pushView } = await renderSidebar(view)
    await restored()
    await scrollTo(spaceList(container), 240)

    await pushView({ ...view, activeSpaceId: hobby.id })
    await restored()
    expect(spaceList(container).scrollTop).toBe(0)

    await pushView(view)
    await restored()
    expect(spaceList(container).scrollTop).toBe(240)
  })

  it("doesn't take where the archive was scrolled for where the list was", async () => {
    const scrollPositions = createMemoryScrollPositions()
    const closed = await renderSidebar(view, { scrollPositions })
    await restored()
    await scrollTo(spaceList(closed.container), 240)
    await fireEvent.click(screen.getByRole("button", { name: "Archive" }))
    await scrollTo(spaceList(closed.container), 900)
    closed.unmount()

    const { container } = await renderSidebar(view, { scrollPositions })
    await restored()

    expect(spaceList(container).scrollTop).toBe(240)
  })
})
