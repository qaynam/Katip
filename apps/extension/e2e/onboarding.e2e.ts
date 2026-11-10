import { launchWithExtension, onboardingPageOf } from "./browser-launch"
import { EXTENSION_DIR } from "./extension-dir"
import { expect, test } from "./fixtures"

test("a fresh install opens the onboarding, which finds every key Katip suggests assigned to it", async () => {
  const { context, close } = await launchWithExtension(EXTENSION_DIR)
  try {
    const onboarding = await onboardingPageOf(context)
    await expect(onboarding.getByRole("heading", { name: "Welcome to Katip" })).toBeVisible()

    await onboarding.getByRole("button", { name: "Get Started" }).click()
    await onboarding.getByRole("button", { name: "Continue" }).click()

    await expect(onboarding.getByRole("heading", { name: "Check your shortcuts" })).toBeVisible()
    const shortcuts = onboarding.getByRole("listitem")
    await expect(shortcuts).toHaveCount(4)
    await expect(shortcuts.locator("kbd.keys")).toHaveCount(4)
    await expect(onboarding.getByText(/Chrome didn’t give Katip/)).toHaveCount(0)
  } finally {
    await close()
  }
})
