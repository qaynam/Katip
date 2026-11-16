import type { TransitionConfig } from "svelte/transition"
import type { Side } from "../logic/space-slide"
import { prefersReducedMotion, SPRING_EASING_CSS, springEasing } from "./disclose"

/** How long a Space's contents, or a panel shown in their place, take to slide across. */
export const SLIDE_ACROSS_DURATION_MS = 380

const NUDGE_DISTANCE_PX = 18

/**
 * Slides an element in from one side by its own width, or out to that side the same way. Two
 * elements of the same width sliding in and out in the same direction at once move as one strip.
 * Doesn't move without a side, and is instant for people who ask for reduced motion.
 */
export const slideAcross = (_node: Element, { side }: { side: Side | null }): TransitionConfig => {
  if (side === null || prefersReducedMotion()) return { duration: 0 }
  const sign = side === "left" ? -1 : 1
  return {
    duration: SLIDE_ACROSS_DURATION_MS,
    easing: springEasing,
    css: (t) => `transform: translateX(${(1 - t) * sign * 100}%);`,
  }
}

/**
 * Pushes an element a little toward a side and lets it spring back, for a swipe past the last page
 * on that side. Still for people who ask for reduced motion.
 */
export const nudgeToward = (element: HTMLElement, side: Side) => {
  if (prefersReducedMotion() || typeof element.animate !== "function") return
  const offset = side === "left" ? -NUDGE_DISTANCE_PX : NUDGE_DISTANCE_PX
  element.animate(
    [
      { transform: "none" },
      { transform: `translateX(${offset}px)`, offset: 0.3 },
      { transform: "none" },
    ],
    { duration: SLIDE_ACROSS_DURATION_MS, easing: SPRING_EASING_CSS },
  )
}
