import { mount } from "svelte"
import App from "./App.svelte"
import { makeOptionsRuntime } from "./options-runtime"

const version = chrome.runtime.getManifest().version

const faviconUrl = (pageUrl: string) => {
  const url = new URL(chrome.runtime.getURL("/_favicon/"))
  url.searchParams.set("pageUrl", pageUrl)
  url.searchParams.set("size", "32")
  return url.toString()
}

mount(App, {
  target: document.body,
  props: {
    runtime: makeOptionsRuntime(version),
    version,
    releasedAt:
      import.meta.env.KATIP_COMMITTED_AT === "" ? null : import.meta.env.KATIP_COMMITTED_AT,
    repositoryUrl: chrome.runtime.getManifest().homepage_url ?? null,
    browserLanguages: navigator.languages,
    faviconUrl,
  },
})
