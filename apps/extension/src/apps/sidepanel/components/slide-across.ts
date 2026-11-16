import type { TransitionConfig } from "svelte/transition"
import type { Side } from "../logic/space-slide"
import { prefersReducedMotion, springEasing } from "./disclose"

/** How long a Space's contents, or a panel shown in their place, take to slide across. */
export const SLIDE_ACROSS_DURATION_MS = 380

/**
 * Slides an element in from one side by its own width, or out to that side the same way. Two
 * elements of the same width sliding in and out in the same direction at once move as one strip.
 * Instant for people who ask for reduced motion.
 */
export const slideAcross = (_node: Element, { side }: { side: Side }): TransitionConfig => {
  if (prefersReducedMotion()) return { duration: 0 }
  const sign = side === "left" ? -1 : 1
  return {
    duration: SLIDE_ACROSS_DURATION_MS,
    easing: springEasing,
    css: (t) => `transform: translateX(${(1 - t) * sign * 100}%);`,
  }
}
