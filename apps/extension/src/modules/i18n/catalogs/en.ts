import type { Message } from "../message"
import { common } from "./en/common"
import { options } from "./en/options"
import { actions } from "./en/actions"
import { sidepanel } from "./en/sidepanel"
import { spotlight } from "./en/spotlight"
import { background } from "./en/background"
import { manifest } from "./en/manifest"
import { onboarding } from "./en/onboarding"

export const en = {
  ...common,
  ...options,
  ...actions,
  ...sidepanel,
  ...spotlight,
  ...background,
  ...manifest,
  ...onboarding,
} as const satisfies Readonly<Record<string, Message>>
