import { Result } from "effect"
import type { LiveSource } from "#modules/live-folders"

export type LiveFolderDraftError = "InvalidAccountIndex" | "TokenRequired" | "TokenHasWhitespace"

export interface GmailDraft {
  readonly accountIndex: string
  readonly label: string
}

const DIGITS = /^\d+$/

/**
 * An empty account number means 0 (the first signed-in account). Full-width digits are
 * accepted. An empty label becomes null, which stands for the inbox.
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

export const gitHubTokenFrom = (draft: string): Result.Result<string, LiveFolderDraftError> => {
  const token = draft.trim()
  if (token === "") return Result.fail("TokenRequired")
  if (/\s/.test(token)) return Result.fail("TokenHasWhitespace")
  return Result.succeed(token)
}
