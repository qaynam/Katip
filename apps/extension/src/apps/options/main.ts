import { mount } from "svelte"
import { fetchCatalog, makeTranslatorLoader, resolveLocale } from "#modules/i18n"
import App from "./App.svelte"
import { makeOptionsRuntime } from "./options-runtime"

const version = chrome.runtime.getManifest().version

const faviconUrl = (pageUrl: string) => {
  const url = new URL(chrome.runtime.getURL("/_favicon/"))
  url.searchParams.set("pageUrl", pageUrl)
  url.searchParams.set("size", "32")
  return url.toString()
}

const loadTranslator = makeTranslatorLoader(fetchCatalog)
const initialTranslator = await loadTranslator(resolveLocale("auto", navigator.languages))

mount(App, {
  target: document.body,
  props: {
    runtime: makeOptionsRuntime(version),
    version,
    releasedAt:
      import.meta.env.KATIP_COMMITTED_AT === "" ? null : import.meta.env.KATIP_COMMITTED_AT,
    updatedFromGitHub: import.meta.env.KATIP_UPDATED_FROM_GITHUB,
    repositoryUrl: chrome.runtime.getManifest().homepage_url ?? null,
    browserLanguages: navigator.languages,
    loadTranslator,
    initialTranslator,
    faviconUrl,
  },
})
