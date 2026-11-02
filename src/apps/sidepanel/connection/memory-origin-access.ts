import type { OriginAccess } from "./origin-access"

/** A fake that answers without prompting and records the requested origins. */
export interface MemoryOriginAccess extends OriginAccess {
  readonly requestedOrigins: ReadonlyArray<ReadonlyArray<string>>
}

export const createMemoryOriginAccess = (
  options: { readonly decide?: (origins: ReadonlyArray<string>) => boolean } = {},
): MemoryOriginAccess => {
  const decide = options.decide ?? (() => true)
  const requestedOrigins: Array<ReadonlyArray<string>> = []
  return {
    requestedOrigins,
    request: async (origins) => {
      requestedOrigins.push(origins)
      return decide(origins)
    },
  }
}
