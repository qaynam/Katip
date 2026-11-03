import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { LANGUAGES } from "../src/languages.ts"
import { CROPPED_SHOTS_DIR, SHOTS } from "../src/shots.ts"

const SOURCE_DIR = new URL("../../extension/store/screenshots/", import.meta.url)
const OUTPUT_DIR = new URL(`../${CROPPED_SHOTS_DIR}/`, import.meta.url)

// The browser window on every store screenshot, as apps/extension/scripts/store/canvas.ts lays it
// out (STAGE). The caption above it stays out: the page sets its own headings as text, which
// reads better, translates with the page, and is what search engines and screen readers see
const WINDOW = { left: 96, top: 184, width: 1088, height: 576 }

await Promise.all(
  LANGUAGES.flatMap((language) => {
    mkdirSync(new URL(`${language}/`, OUTPUT_DIR), { recursive: true })
    return SHOTS.map((shot) =>
      sharp(fileURLToPath(new URL(`${language}/${shot}.png`, SOURCE_DIR)))
        .extract(WINDOW)
        .toFile(fileURLToPath(new URL(`${language}/${shot}.png`, OUTPUT_DIR))),
    )
  }),
)
