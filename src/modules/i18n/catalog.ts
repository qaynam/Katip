import { en } from "./catalogs/en"
import { es } from "./catalogs/es"
import { ja } from "./catalogs/ja"
import { zh } from "./catalogs/zh"
import type { Locale } from "./locale"
import type { PluralForms } from "./message"

type EnglishCatalog = typeof en

export type MessageKey = keyof EnglishCatalog

export type EnglishMessage<K extends MessageKey> = EnglishCatalog[K]

/**
 * Has every key of the English catalog, and gives plural forms wherever the English message has
 * them. A missing or extra key fails the type check.
 */
export type Catalog = {
  readonly [K in MessageKey]: EnglishMessage<K> extends string ? string : PluralForms
}

/**
 * The part of a catalog whose keys start with `namespace.`. With a catalog split into one file per
 * screen, a key missing from or extra to the English catalog fails the type check in that screen's
 * file.
 */
export type CatalogSection<Namespace extends string> = {
  readonly [
    K in MessageKey as K extends `${Namespace}.${string}` ? K : never
  ]: EnglishMessage<K> extends string ? string : PluralForms
}

export const catalogs: { readonly [L in Locale]: Catalog } = { en, ja, zh, es }
