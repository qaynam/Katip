/** The SVG of Katip's icon: a sidebar with tab rows on a blue squircle. */

// A superellipse approximates the continuous-corner squircle of macOS icons; a rect with rx
// corners has a visible kink where the arc meets the edge
const squircle = (x: number, y: number, size: number, exponent = 5, steps = 180): string => {
  const half = size / 2
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const px = x + half + half * Math.sign(cos) * Math.abs(cos) ** (2 / exponent)
    const py = y + half + half * Math.sign(sin) * Math.abs(sin) ** (2 / exponent)
    return `${index === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`
  })
  return `${points.join("")}Z`
}

const BLUE_TOP = "#68C6FF"
/** The brand blue, at the bottom of the squircle's gradient. */
export const BLUE_BOTTOM = "#1F74F0"

export interface IconOptions {
  /**
   * `"grid"` follows the macOS icon grid: an 824-unit squircle with a drop shadow, inset in a
   * 1024-unit canvas. `"bleed"` fills the canvas and drops the shadow and the tab rows, for 16 and
   * 32 px, where the margin and the thin rows would leave a blurred speck.
   */
  readonly layout: "grid" | "bleed"
}

export const iconSvg = ({ layout }: IconOptions): string => {
  const isGrid = layout === "grid"
  const origin = isGrid ? 100 : 0
  const size = isGrid ? 824 : 1024
  const scale = size / 824
  const ground = squircle(origin, origin, size)
  const panel = {
    x: origin + 62 * scale,
    y: origin + 62 * scale,
    width: 340 * scale,
    height: size - 124 * scale,
    radius: 62 * scale,
  }
  const rows = isGrid
    ? [0, 1, 2]
        .map((index) => {
          const height = 46 * scale
          const y = panel.y + 70 * scale + index * (height + 26 * scale)
          const fill = index === 1 ? "#2B7DF3" : "rgba(31,116,240,0.16)"
          return `<rect x="${panel.x + 40 * scale}" y="${y}" width="${panel.width - 80 * scale}" height="${height}" rx="${height / 2}" fill="${fill}"/>`
        })
        .join("")
    : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BLUE_TOP}"/><stop offset="1" stop-color="${BLUE_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EAF2FD"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.22"/>
    </filter>
    <filter id="panel-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${10 * scale}" stdDeviation="${16 * scale}" flood-color="#0b1d4d" flood-opacity="0.22"/>
    </filter>
    <clipPath id="clip"><path d="${ground}"/></clipPath>
  </defs>
  <path d="${ground}" fill="url(#ground)"${isGrid ? ' filter="url(#shadow)"' : ""}/>
  <g clip-path="url(#clip)">
    <rect x="${origin}" y="${origin}" width="${size}" height="${size}" fill="url(#sheen)"/>
    <rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="${panel.radius}" fill="url(#panel)" filter="url(#panel-shadow)"/>
    ${rows}
  </g>
  <path d="${ground}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="3"/>
</svg>
`
}
