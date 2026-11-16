import { faviconToneOf, type FaviconTone } from "../logic/favicon"

const SAMPLE_SIZE = 24

const tones = new Map<string, Promise<FaviconTone>>()

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

/**
 * The tone of the icon at `url`, which the side panel must be able to read. Mixed when it can't be
 * read. Read once per URL for as long as the side panel stays open.
 */
export const faviconToneAt = (url: string): Promise<FaviconTone> => {
  const known = tones.get(url)
  if (known !== undefined) return known
  const tone = readTone(url).catch((): FaviconTone => "Mixed")
  tones.set(url, tone)
  return tone
}
