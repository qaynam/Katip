import type { Catalog } from "./catalog"
import type { Locale } from "./locale"
import { type Translator, translatorOf } from "./translator"

/** Where the build puts the catalog of `locale`, as JSON, from the extension's root. */
export const catalogFilePath = (locale: Locale): string => `i18n/${locale}.json`

/** Reads the catalog of `locale` from the file the build put it in, for a page of the extension. */
export const fetchCatalog = async (locale: Locale): Promise<Catalog> => {
  const response = await fetch(`/${catalogFilePath(locale)}`)
  if (!response.ok) throw new Error(`Couldn't read ${catalogFilePath(locale)}: ${response.status}`)
  return (await response.json()) as Catalog
}

/**
 * Makes translators from the catalogs `load` reads, reading each language's once. A read that
 * fails is tried again the next time that language is asked for.
 */
export const makeTranslatorLoader = (load: (locale: Locale) => Promise<Catalog>) => {
  const loaded = new Map<Locale, Promise<Translator>>()
  return (locale: Locale): Promise<Translator> => {
    const known = loaded.get(locale)
    if (known !== undefined) return known
    const translator = load(locale).then((catalog) => translatorOf(locale, catalog))
    loaded.set(locale, translator)
    translator.catch(() => loaded.delete(locale))
    return translator
  }
}

/** Gives the translator into a language, reading its catalog first when it hasn't been yet. */
export type TranslatorLoader = ReturnType<typeof makeTranslatorLoader>
