import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { bangDataOf, serializedBangData } from "./bang-data.ts"

// Replaces the bundled bangs with Helium's current list, which Helium builds from Kagi's. Run it
// before a release; Katip never downloads the list itself
const HELIUM_BANGS_URL = "https://services.helium.imput.net/bangs.json"

const dataDirectory = new URL("../src/modules/bangs/data/", import.meta.url)

const response = await fetch(HELIUM_BANGS_URL)
if (!response.ok) throw new Error(`${HELIUM_BANGS_URL} answered ${response.status}`)
const { entries, license } = bangDataOf(await response.text())
writeFileSync(fileURLToPath(new URL("bangs.json", dataDirectory)), serializedBangData(entries))
writeFileSync(fileURLToPath(new URL("LICENSE", dataDirectory)), license)
console.log(`Wrote ${entries.length} bangs`)
