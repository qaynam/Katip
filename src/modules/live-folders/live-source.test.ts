import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import {
  defaultLiveFolderTitle,
  originPatternOf,
  signInUrlOf,
  type LiveSource,
} from "./live-source"

const en = makeTranslator("en")
const ja = makeTranslator("ja")

const gmail = (accountIndex: number, label: string | null): LiveSource => ({
  _tag: "Gmail",
  accountIndex,
  label,
})

describe("host permission a source needs", () => {
  it("Gmail needs mail.google.com, and GitHub needs github.com, read with the signed-in session", () => {
    expect([
      originPatternOf(gmail(1, "Work")),
      originPatternOf({ _tag: "GitHub", query: "mentioned" }),
    ]).toStrictEqual(["https://mail.google.com/*", "https://github.com/*"])
  })
})

describe("page opened to sign in", () => {
  it("is the account's inbox for Gmail and the sign-in page for GitHub", () => {
    expect([
      signInUrlOf(gmail(1, "Work")),
      signInUrlOf({ _tag: "GitHub", query: "mentioned" }),
    ]).toStrictEqual(["https://mail.google.com/mail/u/1/", "https://github.com/login"])
  })
})

describe("name given on creation", () => {
  it("names a Gmail folder after the inbox or the label", () => {
    expect([
      defaultLiveFolderTitle(gmail(0, null), en),
      defaultLiveFolderTitle(gmail(0, "Invoices"), en),
    ]).toStrictEqual(["Gmail Inbox", "Gmail: Invoices"])
  })

  it("tells the second and later Google accounts apart by adding the account's index", () => {
    expect(defaultLiveFolderTitle(gmail(1, null), en)).toBe("Gmail Inbox (u/1)")
  })

  it("names a GitHub folder after what it lists", () => {
    expect(defaultLiveFolderTitle({ _tag: "GitHub", query: "review-requested" }, en)).toBe(
      "GitHub Review Requests",
    )
  })
})

describe("language of the name given on creation", () => {
  it("names the folder in the translator's language", () => {
    expect([
      defaultLiveFolderTitle(gmail(1, null), ja),
      defaultLiveFolderTitle({ _tag: "GitHub", query: "mentioned" }, ja),
    ]).toStrictEqual(["Gmail の受信トレイ（u/1）", "GitHub のメンション"])
  })
})
