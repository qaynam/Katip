interface ImportMetaEnv {
  /** When the commit the build was made from was committed, in ISO 8601. Empty when unknown. */
  readonly KATIP_COMMITTED_AT: string
  /**
   * Whether this build is updated by hand from Katip's GitHub releases, so Katip tells about newer
   * ones. False in the Chrome Web Store's package, which the store updates.
   */
  readonly KATIP_UPDATED_FROM_GITHUB: boolean
}
