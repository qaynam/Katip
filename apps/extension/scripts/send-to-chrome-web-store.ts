import { readFileSync } from "node:fs"
import { setTimeout } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { type ChromeWebStore, publishItem, uploadPackage } from "./chrome-web-store.ts"

// Uploads a package to Katip's Chrome Web Store item, or submits the uploaded one for review. The
// item and the access token come from CHROME_WEB_STORE_PUBLISHER_ID, CHROME_WEB_STORE_ITEM_ID and
// CHROME_WEB_STORE_ACCESS_TOKEN
const USAGE = "Usage: node scripts/send-to-chrome-web-store.ts upload <zip> | publish [--staged]"

const fromEnvironment = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value === "") throw new Error(`${name} isn't set`)
  return value
}

const storeFromEnvironment = (): ChromeWebStore => ({
  publisherId: fromEnvironment("CHROME_WEB_STORE_PUBLISHER_ID"),
  itemId: fromEnvironment("CHROME_WEB_STORE_ITEM_ID"),
  accessToken: fromEnvironment("CHROME_WEB_STORE_ACCESS_TOKEN"),
  fetch,
  sleep: (milliseconds) => setTimeout(milliseconds),
})

const [command, argument, ...rest] = process.argv.slice(2)
if (command === "upload" && argument !== undefined && rest.length === 0) {
  const { version }: { version: string } = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  )
  const store = storeFromEnvironment()
  await uploadPackage(store, readFileSync(argument), version)
  console.log(`Uploaded Katip ${version} to the Chrome Web Store item ${store.itemId}`)
} else if (command === "publish" && (argument ?? "--staged") === "--staged" && rest.length === 0) {
  const { state, warnings } = await publishItem(storeFromEnvironment(), {
    staged: argument === "--staged",
  })
  for (const warning of warnings) console.warn(`The Chrome Web Store warns: ${warning}`)
  console.log(`Submitted to the Chrome Web Store, which has it ${state}`)
} else {
  throw new Error(USAGE)
}
