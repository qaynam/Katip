import { slide, type TransitionConfig } from "svelte/transition"

/** How long a folder takes to slide open or closed. Its icon opens over the same time. */
export const DISCLOSURE_DURATION_MS = 420

// A critically damped spring, the kind Apple's interface animations use: it moves off at once and
// settles without overshooting. The stiffness is the spring's angular frequency times the duration,
// chosen so that the motion is within half a percent of its end when the duration runs out
const SPRING_STIFFNESS = 7.4

const springAt = (t: number) => 1 - (1 + SPRING_STIFFNESS * t) * Math.exp(-SPRING_STIFFNESS * t)

/** Progress along the spring, from 0 at the start of a disclosure to 1 at its end. */
export const springEasing = (t: number): number => springAt(t) / springAt(1)

/** {@link springEasing} as a CSS easing function, for what CSS animates alongside. */
export const SPRING_EASING_CSS = `linear(${Array.from({ length: 25 }, (_, step) =>
  springEasing(step / 24).toFixed(4),
).join(", ")})`

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Slides a folder's contents down from under its header while they fade in, and back up the same
 * way. Instant for people who ask for reduced motion.
 */
export const disclose = (
  node: Element,
  { delay = 0, duration = DISCLOSURE_DURATION_MS }: { delay?: number; duration?: number } = {},
): TransitionConfig => {
  if (prefersReducedMotion()) return { duration: 0 }
  const sliding = slide(node, { delay, duration, easing: springEasing })
  return {
    ...sliding,
    // Not slide's own opacity, which reaches full within the first twentieth: the rows would be
    // seen cut off by the edge as it moves
    css: (t, u) => `${sliding.css?.(t, u) ?? ""} opacity: ${Math.min(1, t * 1.4)};`,
  }
}
