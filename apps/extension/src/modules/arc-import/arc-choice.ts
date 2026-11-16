import { Array, Equal, Option } from "effect"
import {
  EXPORT_FORMAT,
  exportedSettingsOf,
  LATEST_EXPORT_VERSION,
  type LatestExport,
} from "#modules/export"
import { defaultSettings } from "#modules/settings"
import type { ArcProfile } from "./arc-sidebar"
import {
  addTallies,
  noTally,
  type ArcConversion,
  type ArcTally,
  type ConvertedArcFavorites,
  type ConvertedArcSpace,
  type ExportedLink,
  type ExportedSpace,
} from "./arc-to-export"

/**
 * `Separate` makes a Space of each Arc Space. `Combined` makes one Space with a folder for each,
 * in the same order, holding that Space's pinned entries.
 */
export type ArcArrangement = "Separate" | "Combined"

/** What of Arc's sidebar to import, and how. */
export interface ArcImportChoice {
  /** IDs of the Arc Spaces to import. */
  readonly spaceIds: ReadonlySet<string>
  readonly arrangement: ArcArrangement
}

/** Every Arc Space, each as a Space of its own. */
export const wholeSidebar = (conversion: ArcConversion): ArcImportChoice => ({
  spaceIds: new Set(conversion.spaces.map(({ space }) => space.id)),
  arrangement: "Separate",
})

/** The name of the Space that Arc's Spaces are combined into. */
export const COMBINED_SPACE_NAME = "Arc"

const COMBINED_SPACE_ID = "arc"

/** What making the import's export document out of Arc's sidebar left out or changed. */
export interface ArcImportReport extends ArcTally {
  /**
   * IDs of the document's Spaces whose theme is only a placeholder, as Katip couldn't read Arc's.
   * Katip picks their theme as it does for a new Space.
   */
  readonly spacesWithoutTheme: ReadonlyArray<string>
  /**
   * IDs of the document's Spaces that the import named rather than Arc's user. Their name gets a
   * number when a Space already has it.
   */
  readonly spacesNamedByImport: ReadonlyArray<string>
}

export interface ArcImport {
  /** The settings are Katip's defaults, as Arc has none to carry over. */
  readonly document: LatestExport
  readonly report: ArcImportReport
}

const belongsTo =
  (profile: ArcProfile) =>
  ({ profile: own }: { readonly profile: ArcProfile }) =>
    Equal.equals(own, profile)

// Favorites a profile with no Space in the file can't follow a choice of Spaces, so they come along
// with any Space rather than never
const favoritesWith = (
  conversion: ArcConversion,
  chosen: ReadonlyArray<ConvertedArcSpace>,
): ReadonlyArray<ConvertedArcFavorites> =>
  chosen.length === 0
    ? []
    : conversion.favorites.filter(
        ({ profile }) =>
          chosen.some(belongsTo(profile)) || !conversion.spaces.some(belongsTo(profile)),
      )

const linksOf = (favorites: ReadonlyArray<ConvertedArcFavorites>) =>
  Array.dedupeWith(
    favorites.flatMap(({ links }) => links),
    (a, b) => a.url === b.url,
  )

interface Arranged {
  readonly spaces: ReadonlyArray<ExportedSpace>
  readonly spacesWithoutTheme: ReadonlyArray<string>
  readonly spacesNamedByImport: ReadonlyArray<string>
}

const separate = (
  chosen: ReadonlyArray<ConvertedArcSpace>,
  favoritesOf: (space: ConvertedArcSpace) => ReadonlyArray<ExportedLink>,
): Arranged => ({
  spaces: chosen.map((converted) => ({ ...converted.space, favorites: favoritesOf(converted) })),
  spacesWithoutTheme: chosen.filter(({ hasTheme }) => !hasTheme).map(({ space }) => space.id),
  spacesNamedByImport: [],
})

const combined = (
  chosen: ReadonlyArray<ConvertedArcSpace>,
  favorites: ReadonlyArray<ExportedLink>,
): Arranged =>
  Option.match(Array.head(chosen), {
    onNone: () => ({ spaces: [], spacesWithoutTheme: [], spacesNamedByImport: [] }),
    onSome: (first) => ({
      spaces: [
        {
          id: COMBINED_SPACE_ID,
          name: COMBINED_SPACE_NAME,
          theme: first.space.theme,
          pinned: chosen.map(({ space }) => ({
            type: "folder",
            title: space.name,
            icon: null,
            children: space.pinned,
          })),
          tabs: chosen.flatMap(({ space }) => space.tabs),
          favorites,
        },
      ],
      spacesWithoutTheme: first.hasTheme ? [] : [COMBINED_SPACE_ID],
      spacesNamedByImport: [COMBINED_SPACE_ID],
    }),
  })

// Arc shows a profile's Favorites in every Space of the profile. Those of a profile with no Space
// in the file have none to follow, so they go with every Space
const favoritesShownIn =
  (conversion: ArcConversion, favorites: ReadonlyArray<ConvertedArcFavorites>) =>
  ({ profile }: ConvertedArcSpace) =>
    linksOf(
      favorites.filter(
        (own) =>
          Equal.equals(own.profile, profile) || !conversion.spaces.some(belongsTo(own.profile)),
      ),
    )

/**
 * The export document for importing the chosen Spaces, arranged as chosen, with what making it
 * left out or changed.
 *
 * @remarks
 * Each chosen Space gets the Favorites of its profile; Favorites of a profile without Spaces in the
 * file go with every Space. The Space that chosen Spaces are combined into gets the Favorites of
 * them all, takes the first one's theme, and the temporary tabs of them all. Each Favorite is
 * listed once in a Space, and once in the document's Favorites, which hold them all.
 */
export const arcImportOf = (conversion: ArcConversion, choice: ArcImportChoice): ArcImport => {
  const chosen = conversion.spaces.filter(({ space }) => choice.spaceIds.has(space.id))
  const favorites = favoritesWith(conversion, chosen)
  const { spaces, ...named } =
    choice.arrangement === "Combined"
      ? combined(chosen, linksOf(favorites))
      : separate(chosen, favoritesShownIn(conversion, favorites))
  return {
    document: {
      format: EXPORT_FORMAT,
      version: LATEST_EXPORT_VERSION,
      exportedAt: conversion.convertedAt,
      generator: conversion.generator,
      spaces,
      favorites: linksOf(favorites),
      settings: exportedSettingsOf(defaultSettings),
    },
    report: {
      ...[...chosen, ...favorites].map(({ tally }) => tally).reduce(addTallies, noTally),
      ...named,
    },
  }
}

export interface ArcProfileGroup {
  readonly profile: ArcProfile
  /** In Arc's order. */
  readonly spaces: ReadonlyArray<ConvertedArcSpace>
}

/** Arc's Spaces by profile, in the order Arc first lists a Space of each. */
export const profileGroupsOf = (
  spaces: ReadonlyArray<ConvertedArcSpace>,
): ReadonlyArray<ArcProfileGroup> =>
  Array.dedupeWith(
    spaces.map(({ profile }) => profile),
    Equal.equals,
  ).map((profile) => ({ profile, spaces: spaces.filter(belongsTo(profile)) }))
