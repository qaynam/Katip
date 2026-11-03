/**
 * A run of text with the little inline markup the copy needs, kept as data so that a translation
 * can't break the page's HTML.
 */
export type Inline =
  | string
  | { readonly strong: string }
  | { readonly code: string }
  | { readonly link: string; readonly href: string }

export type RichText = ReadonlyArray<Inline>

export interface Detail {
  readonly title: string
  readonly text: string
}

export interface SectionIntro {
  /** A word or two above the title, naming the section. */
  readonly eyebrow: string
  readonly title: string
  readonly lead: string
}

export interface Feature extends SectionIntro {
  readonly screenshotAlt: string
  readonly details: ReadonlyArray<Detail>
}

export type MoreFeature = "liveFolders" | "archive" | "shortcuts" | "data" | "languages"

/** Where Arc keeps its sidebar file on one operating system. */
export interface ArcFileLocation {
  readonly system: string
  readonly path: string
  readonly hint: string
}

/** Every piece of text on the site, in one language. */
export interface Copy {
  readonly meta: {
    readonly title: string
    readonly description: string
    /** Describes the Open Graph image, the store's marquee tile. */
    readonly imageAlt: string
  }
  readonly skipToContent: string
  readonly header: {
    readonly home: string
    readonly sections: string
    readonly features: string
    readonly arc: string
    readonly privacy: string
    readonly github: string
  }
  readonly hero: {
    readonly title: string
    readonly lead: string
    readonly note: string
    readonly screenshotAlt: string
  }
  readonly cta: {
    readonly addToChrome: string
    readonly comingSoon: string
    readonly github: string
    /** How to install Katip before the store listing exists. */
    readonly fromRelease: RichText
  }
  readonly spaces: SectionIntro & { readonly details: ReadonlyArray<Detail> }
  readonly spotlight: Feature
  readonly splitView: Feature
  readonly themes: Feature
  readonly more: {
    readonly title: string
    readonly lead: string
    readonly features: Readonly<Record<MoreFeature, Detail>>
  }
  readonly arc: SectionIntro & {
    readonly screenshotAlt: string
    readonly stepsTitle: string
    readonly steps: {
      readonly openSettings: RichText
      readonly chooseFile: RichText
      readonly import: RichText
    }
    readonly locations: ReadonlyArray<ArcFileLocation>
    readonly promises: ReadonlyArray<string>
  }
  readonly privacy: SectionIntro & {
    readonly points: ReadonlyArray<Detail>
    readonly policyLink: string
  }
  readonly openSource: SectionIntro
  readonly footer: {
    readonly links: string
    readonly github: string
    readonly privacy: string
    readonly license: string
    readonly language: string
  }
  readonly privacyPage: {
    readonly title: string
    readonly metaTitle: string
    readonly description: string
  }
}
