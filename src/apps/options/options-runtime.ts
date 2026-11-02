import { Layer, ManagedRuntime } from "effect"
import { SettingsRepository } from "#modules/settings"
import { Ports, Storage, Tabs } from "#platform/browser"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { FileDownloads } from "./file-downloads"
import { OptionalPermissions } from "./optional-permissions"

export type OptionsRuntime = ManagedRuntime.ManagedRuntime<
  SettingsRepository | Tabs | Ports | OptionalPermissions | FileDownloads | KeyboardShortcuts,
  never
>

export const makeOptionsRuntime = (): OptionsRuntime =>
  ManagedRuntime.make(
    Layer.mergeAll(
      SettingsRepository.layer.pipe(Layer.provide(Storage.layer)),
      Tabs.layer,
      Ports.layer,
      OptionalPermissions.layer,
      FileDownloads.layer,
      KeyboardShortcuts.layer,
    ),
  )
