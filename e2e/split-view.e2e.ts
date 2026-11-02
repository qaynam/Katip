import { dragOnto } from "./sidebar-actions"
import { expect, test } from "./fixtures"

test("一時タブを別の一時タブに重ねると、ブラウザの画面が分割され、重ねたタブが前に出る", async ({
  site,
  sidebar,
  background,
}) => {
  const supportsSplitView = await background.evaluate(
    () => typeof chrome.tabs.createSplit === "function",
  )
  test.skip(!supportsSplitView, "分割ビューの API が無い Chrome（154 以前）")
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  await background.evaluate(async (site) => {
    await chrome.tabs.create({ url: `${site}/a`, active: false })
    await chrome.tabs.create({ url: `${site}/b`, active: false })
  }, site)
  const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
  await expect(temporary.getByRole("button", { name: "Page /b" })).toBeVisible()

  await dragOnto(
    temporary.getByRole("button", { name: "Page /b" }),
    temporary.getByRole("button", { name: "Page /a" }),
    0.5,
  )

  await expect
    .poll(() =>
      background.evaluate(
        async (site) =>
          (await chrome.tabs.query({}))
            .filter((tab) => tab.url?.startsWith(site))
            .map((tab) => ({
              url: tab.url,
              split: (tab as { splitViewId?: number }).splitViewId !== -1,
              active: tab.active,
            })),
        site,
      ),
    )
    .toStrictEqual([
      { url: `${site}/a`, split: true, active: false },
      { url: `${site}/b`, split: true, active: true },
    ])
})
