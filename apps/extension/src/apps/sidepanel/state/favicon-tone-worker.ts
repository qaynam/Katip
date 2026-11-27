import { faviconToneOf, type FaviconTone } from "../logic/favicon"

export interface ToneRequest {
  readonly id: number
  readonly url: string
}

export interface ToneAnswer {
  readonly id: number
  readonly tone: FaviconTone
}

const SAMPLE_SIZE = 24

const readTone = async (url: string): Promise<FaviconTone> => {
  const blob = await (await fetch(url)).blob()
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: SAMPLE_SIZE,
    resizeHeight: SAMPLE_SIZE,
  })
  const context = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE).getContext("2d")
  if (context === null) return "Mixed"
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return faviconToneOf(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data)
}

self.addEventListener("message", (event: MessageEvent<ToneRequest>) => {
  const { id, url } = event.data
  void readTone(url)
    .catch((): FaviconTone => "Mixed")
    .then((tone) => self.postMessage({ id, tone } satisfies ToneAnswer))
})
