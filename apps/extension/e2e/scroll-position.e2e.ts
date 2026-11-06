import { seedPins } from "./sidebar-actions"
import { expect, test } from "./fixtures"

test("reopening the side panel shows the list where it was scrolled", async ({
  site,
  sidebar,
  background,
}) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  await seedPins(
    background,
    Array.from({ length: 60 }, (_, index) => ({ title: `Pin ${index}`, url: `${site}/${index}` })),
  )
  const pinned = sidebar.getByRole("region", { name: "Pinned" })
  await expect(pinned.getByRole("button", { name: "Pin 59" })).toBeAttached()
  const list = sidebar.locator("[data-space-body]")
  const scrollEnded = list.evaluate(
    (element) => new Promise((resolve) => element.addEventListener("scrollend", resolve)),
  )
  await pinned.getByRole("button", { name: "Pin 0" }).hover()
  await sidebar.mouse.wheel(0, 600)
  await scrollEnded
  const scrolledTo = await list.evaluate((element) => element.scrollTop)
  expect(scrolledTo).toBeGreaterThan(0)

  // Chrome discards the side panel's page when the panel closes, as reloading does
  await sidebar.reload()

  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(scrolledTo)
})
