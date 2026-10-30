import type { WindowBounds } from "#platform/browser"

const PREFERRED = { width: 640, height: 440 }
const MINIMUM = { width: 360, height: 240 }
const MARGIN = 24
// 空いた高さのうち上に回す割合。中央よりやや上に置き、視線を動かさずに入力欄へ目が行くようにする
const SPACE_ABOVE_RATIO = 0.3

const fit = (available: number, preferred: number, minimum: number) =>
  Math.max(Math.min(preferred, available - MARGIN * 2), minimum)

/** `caller` のウィンドウの左右中央、上下は中央より上に重ねる、Spotlight のウィンドウの位置と大きさ。 */
export const spotlightBoundsOver = (caller: WindowBounds): WindowBounds => {
  const width = fit(caller.width, PREFERRED.width, MINIMUM.width)
  const height = fit(caller.height, PREFERRED.height, MINIMUM.height)
  return {
    left: caller.left + Math.round((caller.width - width) / 2),
    top: caller.top + Math.max(Math.round((caller.height - height) * SPACE_ABOVE_RATIO), 0),
    width,
    height,
  }
}
