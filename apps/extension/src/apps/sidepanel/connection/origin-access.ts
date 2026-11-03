/** Permission to access live folder sources. Tests and the dev harness swap in a fake. */
export interface OriginAccess {
  /**
   * Asks for permission and resolves with whether it was granted. Resolves true without
   * asking when already granted. Never rejects.
   * Chrome only prompts while it is handling a user gesture such as a click, so call this from
   * the gesture's handler before any await.
   */
  readonly request: (origins: ReadonlyArray<string>) => Promise<boolean>
}

export const chromeOriginAccess: OriginAccess = {
  request: (origins) => chrome.permissions.request({ origins: [...origins] }).catch(() => false),
}
