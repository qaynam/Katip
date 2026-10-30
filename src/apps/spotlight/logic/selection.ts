/** 選択を `step` 個ずらした位置。端を越えたら反対の端へ回る。候補が無ければ 0。 */
export const stepSelection = (current: number, count: number, step: 1 | -1): number =>
  count === 0 ? 0 : (((current + step) % count) + count) % count
