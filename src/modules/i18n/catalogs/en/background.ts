import type { Message } from "../../message"

export const background = {} as const satisfies Readonly<Record<`background.${string}`, Message>>
