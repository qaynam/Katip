/** 選択を `step` 個ずらした位置。端を越えたら反対の端へ回る。候補が無ければ 0。 */
export const stepSelection = (current: number, count: number, step: 1 | -1): number =>
  count === 0 ? 0 : (((current + step) % count) + count) % count

type PressedKey = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">

const isOnlyCtrl = (key: PressedKey) => key.ctrlKey && !key.metaKey && !key.altKey && !key.shiftKey

/**
 * 選択を動かすキーなら、動かす向き。矢印キーのほか、Ctrl+N と Ctrl+P でも動かす。
 *
 * @remarks
 * Windows や Linux の Ctrl+N は新しいウィンドウを開く Chrome のショートカットで、ページからは止められない。
 */
export const selectionStepOf = (key: PressedKey): 1 | -1 | null => {
  if (key.key === "ArrowDown") return 1
  if (key.key === "ArrowUp") return -1
  if (!isOnlyCtrl(key)) return null
  if (key.key === "n") return 1
  if (key.key === "p") return -1
  return null
}
