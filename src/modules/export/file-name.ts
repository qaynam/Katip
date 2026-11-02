const twoDigits = (value: number) => String(value).padStart(2, "0")

/** The export file's name. The date in it is `date`'s date in this environment's time zone. */
export const exportFileName = (date: Date): string =>
  `katip-export-${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}.json`
