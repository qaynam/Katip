import type { Language } from "../languages.ts"
import type { Copy } from "./copy.ts"
import { en } from "./en.ts"
import { ja } from "./ja.ts"

export type { Copy, Detail, Inline, MoreFeature, RichText, SectionIntro } from "./copy.ts"

export const COPY: Readonly<Record<Language, Copy>> = { en, ja }
