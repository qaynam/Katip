import { Array } from "effect"

/**
 * The names of the outputs pages have seen, so that a site's output can be chosen where no page
 * can name them, as in Katip's settings. In the order first seen.
 */
export type KnownOutputs = ReadonlyArray<string>

/** The saved names; anything else saved, or nothing, is none known. */
export const knownOutputsOfStored = (stored: unknown): KnownOutputs =>
  globalThis.Array.isArray(stored)
    ? Array.dedupe(stored.filter((name): name is string => typeof name === "string" && name !== ""))
    : []

/**
 * Adds the names `seen` that weren't known, after those that were. Names no longer seen are kept:
 * an output that's disconnected now can still be chosen for when it's back.
 */
export const withOutputsNoted = (known: KnownOutputs, seen: ReadonlyArray<string>): KnownOutputs =>
  Array.dedupe([...known, ...seen.filter((name) => name !== "")])
