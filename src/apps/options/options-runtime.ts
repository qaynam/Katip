import { Layer, ManagedRuntime } from "effect"
import { SettingsRepository } from "#modules/settings"
import { Storage, Tabs } from "#platform/browser"

export type OptionsRuntime = ManagedRuntime.ManagedRuntime<SettingsRepository | Tabs, never>

export const makeOptionsRuntime = (): OptionsRuntime =>
  ManagedRuntime.make(
    Layer.mergeAll(SettingsRepository.layer.pipe(Layer.provide(Storage.layer)), Tabs.layer),
  )
