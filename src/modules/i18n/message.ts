/**
 * 件数で語形が変わる文言。キーは `Intl.PluralRules` が選ぶ区分で、`count` の値で語形を選ぶ。
 * その言語の規則が選んだ区分の語形が無ければ `other` を使う。
 */
export type PluralForms = { readonly other: string } & {
  readonly [Category in Exclude<Intl.LDMLPluralRule, "other">]?: string
}

/** `{name}` の箇所に値を差し込む。 */
export type Message = string | PluralForms

type PlaceholderNamesIn<Text> = Text extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNamesIn<Rest>
  : never

/** 件数で語形が変わる文言は、どの語形にも `{count}` が無くても `count` を受け取る。 */
export type PlaceholderNames<M extends Message> = M extends string
  ? PlaceholderNamesIn<M>
  : "count" | PlaceholderNamesIn<M[keyof M]>

export type MessageParams<M extends Message> = {
  readonly [Name in PlaceholderNames<M>]: Name extends "count" ? number : string | number
}
