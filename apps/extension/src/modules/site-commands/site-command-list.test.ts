import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { DEFAULT_BANG_FORMAT } from "#modules/bangs"
import { makeTranslator } from "#modules/i18n"
import { DEFAULT_SITE_COMMANDS } from "./default-site-commands"
import {
  CommandKeyword,
  CommandTitle,
  CommandUrl,
  type SiteCommand,
  SiteCommandId,
} from "./site-command"
import {
  bangsOfSiteCommands,
  emptySiteCommandList,
  keywordsExcept,
  listedSiteCommands,
  type SiteCommandList,
  siteCommandListOfStored,
  withCommandAdded,
  withCommandEdited,
  withCommandRemoved,
  withDefaultsRestored,
} from "./site-command-list"

const english = makeTranslator("en")

const added = (
  id: string,
  title: string,
  url: string,
  keyword: string | null = null,
): SiteCommand => ({
  id: SiteCommandId.make(id),
  title: CommandTitle.make(title),
  url: CommandUrl.make(url),
  keyword: keyword === null ? null : CommandKeyword.make(keyword),
})

const searchLinear = added("a1", "Search Linear", "https://linear.app/search?q=%s", "lin")
const intranet = added("a2", "Intranet", "https://intranet.example/home")

const titles = (list: SiteCommandList) =>
  listedSiteCommands(list, english).map((command) => command.title)

describe("the commands offered", () => {
  it("start with every command Katip comes with, titled in the display language", () => {
    expect(titles(emptySiteCommandList)).toStrictEqual(
      DEFAULT_SITE_COMMANDS.map((command) => english.t(command.title)),
    )
    expect(listedSiteCommands(emptySiteCommandList, makeTranslator("ja"))[0]?.title).toBe(
      "新しい Google ドキュメント",
    )
  })

  it("follow those Katip comes with by the added ones, in the order added", () => {
    const list = withCommandAdded(withCommandAdded(emptySiteCommandList, searchLinear), intranet)

    expect(titles(list).slice(-2)).toStrictEqual(["Search Linear", "Intranet"])
  })

  it("show an added command with the top page of its site as the page of its favicon", () => {
    const [listed] = listedSiteCommands(
      {
        added: [searchLinear],
        removedDefaults: DEFAULT_SITE_COMMANDS.map((command) => command.id),
      },
      english,
    )

    expect(listed).toStrictEqual({
      ref: { _tag: "Added", id: "a1" },
      title: "Search Linear",
      url: "https://linear.app/search?q=%s",
      keyword: "lin",
      iconPageUrl: "https://linear.app/",
    })
  })
})

describe("removing a command", () => {
  it("leaves out a command Katip comes with until the defaults are restored", () => {
    const removed = withCommandRemoved(emptySiteCommandList, { _tag: "Default", id: "google-doc" })

    expect(titles(removed)).not.toContain("New Google Doc")
    expect(titles(withDefaultsRestored(removed))).toContain("New Google Doc")
  })

  it("deletes an added command", () => {
    const list = withCommandAdded(emptySiteCommandList, searchLinear)

    expect(withCommandRemoved(list, { _tag: "Added", id: searchLinear.id }).added).toStrictEqual([])
  })
})

describe("editing a command", () => {
  it("replaces an added command in its place", () => {
    const list = withCommandAdded(withCommandAdded(emptySiteCommandList, searchLinear), intranet)
    const renamed = { ...searchLinear, title: CommandTitle.make("Linear") }

    expect(
      withCommandEdited(list, { _tag: "Added", id: searchLinear.id }, renamed).added,
    ).toStrictEqual([renamed, intranet])
  })

  it("turns a command Katip comes with into an added one", () => {
    const edited = added("a3", "Doc", "https://docs.new", "doc")

    const list = withCommandEdited(
      emptySiteCommandList,
      { _tag: "Default", id: "google-doc" },
      edited,
    )

    expect([list.removedDefaults, list.added]).toStrictEqual([["google-doc"], [edited]])
  })
})

describe("the saved commands", () => {
  it("are the list Katip starts with when nothing is saved", () => {
    expect(siteCommandListOfStored(undefined)).toStrictEqual(emptySiteCommandList)
  })

  it("keep the readable commands when some are broken", () => {
    const stored = {
      added: [
        { id: "a1", title: "Search Linear", url: "https://linear.app/search?q=%s", keyword: "lin" },
        { id: "a2", title: "Broken", url: "javascript:alert(1)", keyword: null },
      ],
      removedDefaults: ["google-doc", "no-longer-a-default"],
    }

    expect(siteCommandListOfStored(stored)).toStrictEqual({
      added: [searchLinear],
      removedDefaults: ["google-doc"],
    })
  })
})

describe("the keywords in use", () => {
  it("are those of every command but the one being edited", () => {
    const commands = listedSiteCommands(
      withCommandAdded(
        withCommandAdded(emptySiteCommandList, searchLinear),
        added("a2", "Wiki", "https://wiki.example/?q=%s", "wiki"),
      ),
      english,
    )

    expect([
      keywordsExcept(commands, Option.none()),
      keywordsExcept(commands, Option.some({ _tag: "Added", id: searchLinear.id })),
    ]).toStrictEqual([new Set(["lin", "wiki"]), new Set(["wiki"])])
  })
})

describe("the commands as bangs", () => {
  it("are the commands with a keyword, each triggered by its keyword", () => {
    const commands = listedSiteCommands(
      withCommandAdded(withCommandAdded(emptySiteCommandList, searchLinear), intranet),
      english,
    )

    expect(bangsOfSiteCommands(commands)).toStrictEqual([
      {
        name: "Search Linear",
        triggers: ["lin"],
        template: "https://linear.app/search?q=%s",
        format: DEFAULT_BANG_FORMAT,
      },
    ])
  })
})
