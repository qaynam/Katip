const twoDigits = (value: number) => String(value).padStart(2, "0")

/** 書き出したファイルの名前。日付は `date` の、この環境の時刻帯での日付。 */
export const exportFileName = (date: Date): string =>
  `katip-export-${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}.json`
