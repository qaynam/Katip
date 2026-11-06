import type { ScrollPositions } from "./scroll-positions"

/** A fake that keeps the positions for as long as it lives, across side panels mounted with it. */
export const createMemoryScrollPositions = (): ScrollPositions => {
  const positions = new Map<string, number>()
  return {
    read: async (windowId, spaceId) => positions.get(`${windowId}/${spaceId}`) ?? null,
    save: (windowId, spaceId, top) => void positions.set(`${windowId}/${spaceId}`, top),
  }
}
