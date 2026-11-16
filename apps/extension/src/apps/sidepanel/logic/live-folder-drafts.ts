import { Result } from "effect"
import { GMAIL_PRIMARY_LABEL, type LiveSource } from "#modules/live-folders"

export type LiveFolderDraftError =
  "InvalidAccountIndex" | "LabelRequired" | "TokenRequired" | "TokenHasWhitespace"

/** Which mail a Gmail live folder lists: the Primary tab, the whole inbox, or a label. */
export const GMAIL_MAILBOXES = ["Primary", "Inbox", "Label"] as const
export type GmailMailbox = (typeof GMAIL_MAILBOXES)[number]

export interface GmailDraft {
  readonly accountIndex: string
  readonly mailbox: GmailMailbox
  /** The label's name, used only when `mailbox` is `Label`. */
  readonly label: string
}

const DIGITS = /^\d+$/

const gmailLabelFrom = ({
  mailbox,
  label,
}: GmailDraft): Result.Result<string | null, LiveFolderDraftError> => {
  if (mailbox === "Primary") return Result.succeed(GMAIL_PRIMARY_LABEL)
  if (mailbox === "Inbox") return Result.succeed(null)
  const name = label.trim()
  return name === "" ? Result.fail("LabelRequired") : Result.succeed(name)
}

/**
 * An empty account number means 0 (the first signed-in account). Full-width digits are
 * accepted.
 */
export const gmailSourceFrom = (
  draft: GmailDraft,
): Result.Result<LiveSource, LiveFolderDraftError> => {
  const indexText = draft.accountIndex.normalize("NFKC").trim()
  const accountIndex = indexText === "" ? 0 : Number(indexText)
  const isValidIndex =
    (indexText === "" || DIGITS.test(indexText)) && Number.isSafeInteger(accountIndex)
  if (!isValidIndex) return Result.fail("InvalidAccountIndex")
  return Result.map(gmailLabelFrom(draft), (label) => ({ _tag: "Gmail", accountIndex, label }))
}

export const gitHubTokenFrom = (draft: string): Result.Result<string, LiveFolderDraftError> => {
  const token = draft.trim()
  if (token === "") return Result.fail("TokenRequired")
  if (/\s/.test(token)) return Result.fail("TokenHasWhitespace")
  return Result.succeed(token)
}
