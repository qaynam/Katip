import { Layer, ManagedRuntime } from "effect"
import { SettingsRepository } from "#modules/settings"
import { Storage } from "#platform/browser"

export type OptionsRuntime = ManagedRuntime.ManagedRuntime<SettingsRepository, never>

export const makeOptionsRuntime = (): OptionsRuntime =>
  ManagedRuntime.make(SettingsRepository.layer.pipe(Layer.provide(Storage.layer)))
