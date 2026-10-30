import { Layer, ManagedRuntime } from "effect"
import { SettingsRepository } from "#modules/settings"
import { Storage, Tabs } from "#platform/browser"
import { OptionalPermissions } from "./optional-permissions"

export type OptionsRuntime = ManagedRuntime.ManagedRuntime<
  SettingsRepository | Tabs | OptionalPermissions,
  never
>

export const makeOptionsRuntime = (): OptionsRuntime =>
  ManagedRuntime.make(
    Layer.mergeAll(
      SettingsRepository.layer.pipe(Layer.provide(Storage.layer)),
      Tabs.layer,
      OptionalPermissions.layer,
    ),
  )
