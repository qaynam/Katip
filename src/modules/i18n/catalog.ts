import { en } from "./catalogs/en"
import { es } from "./catalogs/es"
import { ja } from "./catalogs/ja"
import { zh } from "./catalogs/zh"
import type { Locale } from "./locale"
import type { PluralForms } from "./message"

type EnglishCatalog = typeof en

export type MessageKey = keyof EnglishCatalog

export type EnglishMessage<K extends MessageKey> = EnglishCatalog[K]

/**
 * 英語のカタログと同じキーをすべて持ち、英語で件数により語形が変わる文言は訳でも語形を持つ。
 * キーが欠けても余分にあっても型検査で落ちる。
 */
export type Catalog = {
  readonly [K in MessageKey]: EnglishMessage<K> extends string ? string : PluralForms
}

/**
 * カタログのうち、キーが `namespace.` で始まる部分。画面ごとにファイルを分けても、
 * 英語のカタログと比べたキーの過不足は、その画面のファイルで型検査に落ちる。
 */
export type CatalogSection<Namespace extends string> = {
  readonly [
    K in MessageKey as K extends `${Namespace}.${string}` ? K : never
  ]: EnglishMessage<K> extends string ? string : PluralForms
}

export const catalogs: { readonly [L in Locale]: Catalog } = { en, ja, zh, es }
