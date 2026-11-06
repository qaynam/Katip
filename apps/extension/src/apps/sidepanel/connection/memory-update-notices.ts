import type { Release } from "#modules/updates"
import type { UpdateNotices } from "./update-notices"

/** A fake that tells about `release`, null for none, and records the versions dismissed. */
export interface MemoryUpdateNotices extends UpdateNotices {
  readonly dismissed: ReadonlyArray<string>
}

export const createMemoryUpdateNotices = (release: Release | null): MemoryUpdateNotices => {
  const dismissed: Array<string> = []
  return {
    pending: () => Promise.resolve(dismissed.includes(release?.version ?? "") ? null : release),
    dismiss: (version) => {
      dismissed.push(version)
    },
    dismissed,
  }
}
