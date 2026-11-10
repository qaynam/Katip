import { Layer, ManagedRuntime } from "effect"
import { SettingsRepository } from "#modules/settings"
import { Storage, Tabs } from "#platform/browser"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"

export type OnboardingRuntime = ManagedRuntime.ManagedRuntime<
  SettingsRepository | KeyboardShortcuts | Tabs,
  never
>

export const makeOnboardingRuntime = (): OnboardingRuntime =>
  ManagedRuntime.make(
    Layer.mergeAll(
      SettingsRepository.layer.pipe(Layer.provide(Storage.layer)),
      KeyboardShortcuts.layer,
      Tabs.layer,
    ),
  )
