import { Effect } from "effect"
import { Tabs } from "#platform/browser"
import { onboardingPageUrl } from "#protocol"
import { ExtensionInfo } from "./extension-info"

/** Opens the page that walks through setting Katip up, in a new tab of the last focused window. */
export const openOnboarding = Effect.gen(function* () {
  const { origin } = yield* ExtensionInfo
  yield* (yield* Tabs).create({ url: onboardingPageUrl(origin) })
})
