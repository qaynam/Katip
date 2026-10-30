import type { Message } from "../../message"

export const sidepanel = {} as const satisfies Readonly<Record<`sidepanel.${string}`, Message>>
