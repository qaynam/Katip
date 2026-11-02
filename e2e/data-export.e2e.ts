import { readFile } from "node:fs/promises"
import { seedPins } from "./sidebar-actions"
import { expect, test } from "./fixtures"

test("設定画面で書き出すと、Space のピンと一時タブを書いた JSON ファイルがダウンロードされる", async ({
  context,
  site,
  sidebar,
  background,
}) => {
  await expect(sidebar.getByRole("heading", { name: "Home" })).toBeVisible()
  await seedPins(background, [{ title: "Docs", url: `${site}/docs` }])
  await background.evaluate((url) => chrome.tabs.create({ url, active: false }), `${site}/a`)
  const temporary = sidebar.getByRole("region", { name: "Temporary tabs" })
  await expect(temporary.getByRole("button", { name: "Page /a" })).toBeVisible()
  const options = await context.newPage()
  await options.goto(new URL("options/index.html", background.url()).href)

  const downloading = options.waitForEvent("download")
  await options.getByRole("button", { name: "Export" }).click()
  const download = await downloading
  const exported = JSON.parse(await readFile(await download.path(), "utf8")) as {
    readonly format: unknown
    readonly version: unknown
    readonly spaces: ReadonlyArray<{
      readonly name: unknown
      readonly pinned: unknown
      readonly tabs: unknown
    }>
  }

  expect({
    fileName: download.suggestedFilename(),
    format: exported.format,
    version: exported.version,
    spaces: exported.spaces.map(({ name, pinned, tabs }) => ({ name, pinned, tabs })),
  }).toStrictEqual({
    fileName: expect.stringMatching(/^katip-export-\d{4}-\d{2}-\d{2}\.json$/),
    format: "katip.export",
    version: 1,
    spaces: [
      {
        name: "Home",
        pinned: [{ type: "pin", title: "Docs", url: `${site}/docs` }],
        tabs: [{ title: "Page /a", url: `${site}/a` }],
      },
    ],
  })
})
