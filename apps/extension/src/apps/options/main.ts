import { mount } from "svelte"
import App from "./App.svelte"
import { makeOptionsRuntime } from "./options-runtime"

const version = chrome.runtime.getManifest().version

mount(App, {
  target: document.body,
  props: {
    runtime: makeOptionsRuntime(version),
    version,
    releasedAt:
      import.meta.env.KATIP_COMMITTED_AT === "" ? null : import.meta.env.KATIP_COMMITTED_AT,
    repositoryUrl: chrome.runtime.getManifest().homepage_url ?? null,
    browserLanguages: navigator.languages,
  },
})
