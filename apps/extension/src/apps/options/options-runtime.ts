import { Layer, ManagedRuntime } from "effect"
import { BangCatalog } from "#modules/bangs"
import { SettingsRepository } from "#modules/settings"
import { SiteCommands } from "#modules/site-commands"
import { Updates } from "#modules/updates"
import { Ports, Storage, Tabs } from "#platform/browser"
import { Http } from "#platform/http"
import { KeyboardShortcuts } from "#platform/keyboard-shortcuts"
import { CurrentWindow } from "./current-window"
import { FileDownloads } from "./file-downloads"
import { OptionalPermissions } from "./optional-permissions"

export type OptionsRuntime = ManagedRuntime.ManagedRuntime<
  | SettingsRepository
  | SiteCommands
  | BangCatalog
  | Tabs
  | Ports
  | OptionalPermissions
  | FileDownloads
  | KeyboardShortcuts
  | Updates
  | CurrentWindow,
  never
>

/** @param installedVersion - The version of the running Katip, as its manifest gives it. */
export const makeOptionsRuntime = (installedVersion: string): OptionsRuntime =>
  ManagedRuntime.make(
    Layer.mergeAll(
      SettingsRepository.layer.pipe(Layer.provide(Storage.layer)),
      SiteCommands.layer.pipe(Layer.provide(Storage.layer)),
      BangCatalog.layer.pipe(Layer.provide(Http.layer)),
      Updates.layer(installedVersion).pipe(
        Layer.provide(Layer.mergeAll(Http.layer, Storage.layer)),
      ),
      Tabs.layer,
      Ports.layer,
      OptionalPermissions.layer,
      FileDownloads.layer,
      KeyboardShortcuts.layer,
      CurrentWindow.layer,
    ),
  )
