import { Array } from "effect"
import { swatchOf } from "./appearance"
import { colorAtPoint } from "./picker"

const WHEEL_STEP_DEGREES = 30

/**
 * CSS background that faintly tints the color field's dot grid with the color picked at each
 * position: each hue at its most vivid in the middle, paling to near-white at the field's sides.
 */
export const hueWheelBackground = (): string => {
  // conic-gradient goes clockwise from where `from` points, the right here, so each stop takes the
  // hue picked in that direction
  const stops = Array.makeBy(360 / WHEEL_STEP_DEGREES + 1, (step) => {
    const angle = step * WHEEL_STEP_DEGREES
    const radians = (angle * Math.PI) / 180
    const { hue } = colorAtPoint({ x: Math.cos(radians), y: -Math.sin(radians) })
    return `${swatchOf({ hue, chroma: 1 })} ${angle}deg`
  })
  const edge = swatchOf({ hue: 0, chroma: 0 })
  return `radial-gradient(closest-side, transparent, ${edge}), conic-gradient(from 90deg, ${stops.join(", ")})`
}
