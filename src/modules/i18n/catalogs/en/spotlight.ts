import type { Message } from "../../message"

export const spotlight = {} as const satisfies Readonly<Record<`spotlight.${string}`, Message>>
