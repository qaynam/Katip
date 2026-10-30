import type { OriginAccess } from "./origin-access"

/** 尋ねずに答える偽物。求められたオリジンを記録する */
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
