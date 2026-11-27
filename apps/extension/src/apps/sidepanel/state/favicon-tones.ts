import type { FaviconTone } from "../logic/favicon"
import type { ToneAnswer, ToneRequest } from "./favicon-tone-worker"

const tones = new Map<string, Promise<FaviconTone>>()
const waiting = new Map<number, (tone: FaviconTone) => void>()
let nextRequestId = 0

const settleAll = (tone: FaviconTone) => {
  for (const settle of waiting.values()) settle(tone)
  waiting.clear()
}

// Not read on the page: drawing each icon and reading its pixels back takes about half a
// millisecond, and a side panel opening over a few hundred tabs would stall for a tenth of a second
const startWorker = (): Worker | null => {
  try {
    const worker = new Worker(new URL("./favicon-tone-worker.ts", import.meta.url), {
      type: "module",
    })
    worker.addEventListener("message", (event: MessageEvent<ToneAnswer>) => {
      waiting.get(event.data.id)?.(event.data.tone)
      waiting.delete(event.data.id)
    })
    worker.addEventListener("error", () => settleAll("Mixed"))
    return worker
  } catch {
    return null
  }
}

let worker: Worker | null | undefined

const readTone = (url: string): Promise<FaviconTone> => {
  worker ??= startWorker()
  const reader = worker
  if (reader === null) return Promise.resolve("Mixed")
  return new Promise((resolve) => {
    const id = nextRequestId++
    waiting.set(id, resolve)
    reader.postMessage({ id, url } satisfies ToneRequest)
  })
}

/**
 * The tone of the icon at `url`, which the side panel must be able to read. Mixed when it can't be
 * read. Read once per URL for as long as the side panel stays open.
 */
export const faviconToneAt = (url: string): Promise<FaviconTone> => {
  const known = tones.get(url)
  if (known !== undefined) return known
  const tone = readTone(url)
  tones.set(url, tone)
  return tone
}
