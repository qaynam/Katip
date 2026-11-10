import { Layer, ManagedRuntime } from "effect"
import { BangCatalog } from "#modules/bangs"
import { SettingsRepository } from "#modules/settings"
import { SiteCommands } from "#modules/site-commands"
import { Storage, Tabs } from "#platform/browser"
import { Http } from "#platform/http"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"

export type OnboardingRuntime = ManagedRuntime.ManagedRuntime<
  SettingsRepository | SiteCommands | BangCatalog | KeyboardShortcuts | Tabs,
  never
>

export const makeOnboardingRuntime = (): OnboardingRuntime =>
  ManagedRuntime.make(
    Layer.mergeAll(
      SettingsRepository.layer.pipe(Layer.provide(Storage.layer)),
      SiteCommands.layer.pipe(Layer.provide(Storage.layer)),
      BangCatalog.layer.pipe(Layer.provide(Http.layer)),
      KeyboardShortcuts.layer,
      Tabs.layer,
    ),
  )
