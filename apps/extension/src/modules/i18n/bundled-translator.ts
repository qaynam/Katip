import { catalogs } from "./catalog"
import type { Locale } from "./locale"
import { type Translator, translatorOf } from "./translator"

/**
 * A translator into `locale` whose catalogs, every language's, are built into the script that uses
 * it. Pages load the one language they show from its file instead (see `fetchCatalog`).
 */
export const makeTranslator = (locale: Locale): Translator => translatorOf(locale, catalogs[locale])
