export const ONBOARDING_STEPS = [
  "Welcome",
  "SidePanel",
  "Shortcuts",
  "ArcImport",
  "Favorites",
  "Themes",
  "LiveFolders",
  "Bangs",
  "Done",
] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

const OPTIONAL_STEPS: ReadonlySet<OnboardingStep> = new Set([
  "ArcImport",
  "Favorites",
  "Themes",
  "LiveFolders",
  "Bangs",
])

/** Whether the step shows around Katip rather than sets it up, so it can be skipped. */
export const isOptional = (step: OnboardingStep): boolean => OPTIONAL_STEPS.has(step)

const stepAt = (index: number, fallback: OnboardingStep): OnboardingStep =>
  ONBOARDING_STEPS[index] ?? fallback

export const stepAfter = (step: OnboardingStep): OnboardingStep =>
  stepAt(ONBOARDING_STEPS.indexOf(step) + 1, step)

export const stepBefore = (step: OnboardingStep): OnboardingStep =>
  stepAt(ONBOARDING_STEPS.indexOf(step) - 1, step)

/** The step after the optional ones that follow `step`. */
export const stepAfterSkipping = (step: OnboardingStep): OnboardingStep => {
  let next = stepAfter(step)
  while (isOptional(next)) next = stepAfter(next)
  return next
}
