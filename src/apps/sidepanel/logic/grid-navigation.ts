import { Option } from "effect"

export interface GridShape {
  readonly count: number
  readonly columns: number
}

const destinations: Partial<Record<string, (current: number, shape: GridShape) => number>> = {
  ArrowRight: (current) => current + 1,
  ArrowLeft: (current) => current - 1,
  ArrowDown: (current, { columns }) => current + columns,
  ArrowUp: (current, { columns }) => current - columns,
  Home: () => 0,
  End: (_, { count }) => count - 1,
}

/**
 * Where focus goes after a key press in a grid laid out row by row from the top-left.
 * Left and right wrap past the end of a row into the adjacent row, up and down stay in the
 * same column, and moves that would leave the grid stay put.
 *
 * @returns None for keys that don't move focus.
 */
export const gridIndexAfter = (
  key: string,
  current: number,
  shape: GridShape,
): Option.Option<number> =>
  Option.map(Option.fromNullishOr(destinations[key]), (destination) => {
    const next = destination(current, shape)
    return next >= 0 && next < shape.count ? next : current
  })
