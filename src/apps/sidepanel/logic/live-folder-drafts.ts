import { Option, Result } from "effect"
import type { LiveSource } from "#modules/live-folders"

export type LiveFolderDraftError = "InvalidAccountIndex" | "TokenRequired" | "TokenHasWhitespace"

export interface GmailDraft {
  readonly accountIndex: string
  readonly label: string
}

const DIGITS = /^\d+$/

/**
 * アカウント番号が空なら 0（最初にログインしたアカウント）とみなす。全角の数字も受け付ける。
 * ラベルが空なら、受信トレイを表す null にする。
 */
export const gmailSourceFrom = (
  draft: GmailDraft,
): Result.Result<LiveSource, LiveFolderDraftError> => {
  const indexText = draft.accountIndex.normalize("NFKC").trim()
  const accountIndex = indexText === "" ? 0 : Number(indexText)
  const isValidIndex =
    (indexText === "" || DIGITS.test(indexText)) && Number.isSafeInteger(accountIndex)
  if (!isValidIndex) return Result.fail("InvalidAccountIndex")
  const label = draft.label.trim()
  return Result.succeed({ _tag: "Gmail", accountIndex, label: label === "" ? null : label })
}

export type TokenRequirement = "required" | "optional"

/** 任意の欄が空なら、トークンを送らない（設定済みのトークンを変えない）ことを表す None を返す */
export const gitHubTokenFrom = (
  draft: string,
  requirement: TokenRequirement,
): Result.Result<Option.Option<string>, LiveFolderDraftError> => {
  const token = draft.trim()
  if (token === "") {
    return requirement === "required" ? Result.fail("TokenRequired") : Result.succeed(Option.none())
  }
  if (/\s/.test(token)) return Result.fail("TokenHasWhitespace")
  return Result.succeed(Option.some(token))
}
