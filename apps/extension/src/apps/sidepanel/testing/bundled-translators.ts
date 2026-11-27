import { catalogs, makeTranslator, makeTranslatorLoader, resolveLocale } from "#modules/i18n"

/**
 * The translators of a side panel outside the extension, which has no catalog files to read: from
 * the catalogs built into the script instead.
 */
export const bundledTranslators = (browserLanguages: ReadonlyArray<string>) => ({
  loadTranslator: makeTranslatorLoader((locale) => Promise.resolve(catalogs[locale])),
  initialTranslator: makeTranslator(resolveLocale("auto", browserLanguages)),
})
