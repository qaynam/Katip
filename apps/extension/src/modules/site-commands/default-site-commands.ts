import { Schema } from "effect"
import type { MessageKey } from "#modules/i18n"
import { CommandUrl } from "./site-command"

export const DefaultSiteCommandId = Schema.Literals([
  "google-doc",
  "google-sheet",
  "google-slide",
  "google-form",
  "google-meet",
  "calendar-event",
  "notion-page",
  "linear-issue",
  "github-repository",
  "github-gist",
  "figma-file",
])
export type DefaultSiteCommandId = typeof DefaultSiteCommandId.Type

type TitleKey = Extract<MessageKey, `actions.site.${string}`>

export interface DefaultSiteCommand {
  readonly id: DefaultSiteCommandId
  readonly title: TitleKey
  readonly url: CommandUrl
  /**
   * A page of the site the command creates something on, for its favicon. The .new addresses the
   * commands open only redirect there, so the browser keeps no favicon for them.
   */
  readonly iconPageUrl: string
}

const command = (
  id: DefaultSiteCommandId,
  title: TitleKey,
  url: string,
  iconPageUrl: string,
): DefaultSiteCommand => ({ id, title, url: CommandUrl.make(url), iconPageUrl })

/** The commands Katip comes with for creating things on popular sites, in the order listed. */
export const DEFAULT_SITE_COMMANDS: ReadonlyArray<DefaultSiteCommand> = [
  command(
    "google-doc",
    "actions.site.googleDoc",
    "https://docs.new",
    "https://docs.google.com/document/",
  ),
  command(
    "google-sheet",
    "actions.site.googleSheet",
    "https://sheets.new",
    "https://docs.google.com/spreadsheets/",
  ),
  command(
    "google-slide",
    "actions.site.googleSlide",
    "https://slides.new",
    "https://docs.google.com/presentation/",
  ),
  command(
    "google-form",
    "actions.site.googleForm",
    "https://forms.new",
    "https://docs.google.com/forms/",
  ),
  command("google-meet", "actions.site.googleMeet", "https://meet.new", "https://meet.google.com/"),
  command(
    "calendar-event",
    "actions.site.calendarEvent",
    "https://cal.new",
    "https://calendar.google.com/",
  ),
  command("notion-page", "actions.site.notionPage", "https://notion.new", "https://www.notion.so/"),
  command("linear-issue", "actions.site.linearIssue", "https://linear.new", "https://linear.app/"),
  command(
    "github-repository",
    "actions.site.githubRepository",
    "https://repo.new",
    "https://github.com/",
  ),
  command("github-gist", "actions.site.githubGist", "https://gist.new", "https://gist.github.com/"),
  command("figma-file", "actions.site.figmaFile", "https://figma.new", "https://www.figma.com/"),
]
