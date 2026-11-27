import type { Locale, Translator, TranslatorLoader } from "#modules/i18n"

/**
 * The translator into the language a page shows, following `language` as it changes. Make it while
 * a component initializes.
 */
export class ShownTranslator {
  #current = $state.raw<Translator>() as Translator

  constructor(opened: Translator, load: TranslatorLoader, language: () => Locale) {
    this.#current = opened
    // Not switched before the new language's catalog has been read: until then the page stays in
    // the language it was in
    $effect(() => {
      const locale = language()
      let isCurrent = true
      void load(locale).then((loaded) => {
        if (isCurrent) this.#current = loaded
      })
      return () => {
        isCurrent = false
      }
    })
  }

  get current(): Translator {
    return this.#current
  }
}
