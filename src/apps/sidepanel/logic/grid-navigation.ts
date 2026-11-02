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
 * 左上から行ごとに並べた格子の中で、キーを押した後にフォーカスを置く位置。
 * 左右は行の端を越えて隣の行へ続き、上下は同じ列を動く。格子の外へ出る向きには動かない。
 *
 * @returns フォーカスを動かすキーでなければ none。
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
