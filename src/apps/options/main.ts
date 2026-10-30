import { mount } from "svelte"
import App from "./App.svelte"
import { makeOptionsRuntime } from "./options-runtime"

mount(App, {
  target: document.body,
  props: {
    runtime: makeOptionsRuntime(),
    version: chrome.runtime.getManifest().version,
    browserLanguages: navigator.languages,
  },
})
