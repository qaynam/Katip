import { Array, Option, Schema } from "effect"
import { SoundRule } from "./sound-rule"
import type { SoundSite } from "./sound-site"

/** The sound settings kept for sites, one per site, in the order they were first saved. */
export const SoundRules = Schema.Array(SoundRule)
export type SoundRules = typeof SoundRules.Type

const decodeRule = Schema.decodeUnknownOption(SoundRule)

/**
 * The saved settings, read one at a time so that a broken one doesn't take the rest with it.
 * Nothing saved, or nothing readable, is no settings.
 */
export const soundRulesOfStored = (stored: unknown): SoundRules =>
  globalThis.Array.isArray(stored) ? Array.getSomes(stored.map((rule) => decodeRule(rule))) : []

export const ruleForSite = (rules: SoundRules, site: SoundSite): Option.Option<SoundRule> =>
  Array.findFirst(rules, (rule) => rule.site === site)

/** Keeps `rule` for its site, in place of the one kept before, if any. */
export const withRule = (rules: SoundRules, rule: SoundRule): SoundRules =>
  Option.isSome(ruleForSite(rules, rule.site))
    ? rules.map((kept) => (kept.site === rule.site ? rule : kept))
    : [...rules, rule]

export const withoutRule = (rules: SoundRules, site: SoundSite): SoundRules =>
  rules.filter((rule) => rule.site !== site)
