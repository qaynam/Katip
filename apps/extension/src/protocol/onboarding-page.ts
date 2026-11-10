/** The page that walks through setting Katip up. It opens on first install and from the settings. */
export const ONBOARDING_PAGE_PATH = "onboarding/index.html"

export const onboardingPageUrl = (extensionOrigin: string): string =>
  new URL(ONBOARDING_PAGE_PATH, extensionOrigin).href
