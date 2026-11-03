/**
 * A message whose wording depends on a count. Keys are the categories `Intl.PluralRules` picks,
 * and the `count` value picks the form. When the language's rules pick a category with no form,
 * `other` is used.
 */
export type PluralForms = { readonly other: string } & {
  readonly [Category in Exclude<Intl.LDMLPluralRule, "other">]?: string
}

/** Values are filled in where `{name}` appears. */
export type Message = string | PluralForms

type PlaceholderNamesIn<Text> = Text extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNamesIn<Rest>
  : never

/** A message with plural forms takes `count` even when none of its forms contains `{count}`. */
export type PlaceholderNames<M extends Message> = M extends string
  ? PlaceholderNamesIn<M>
  : "count" | PlaceholderNamesIn<M[keyof M]>

export type MessageParams<M extends Message> = {
  readonly [Name in PlaceholderNames<M>]: Name extends "count" ? number : string | number
}
