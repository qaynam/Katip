import { describe, expect, it } from "vitest"
import { Option } from "effect"
import { type SearchCandidate, searchSpotlight, type SpotlightEntry } from "./spotlight-search"

const NOW = 1_800_000_000_000
const MINUTE = 60_000

interface TestCandidate extends SearchCandidate {
  readonly name: string
}

const candidate = (
  name: string,
  overrides: Partial<Omit<TestCandidate, "name" | "lastUsedAt">> & {
    readonly usedMinutesAgo?: number
  } = {},
): TestCandidate => {
  const { usedMinutesAgo, ...rest } = overrides
  return {
    name,
    kind: "OpenTab",
    title: name,
    url: "",
    lastUsedAt:
      usedMinutesAgo === undefined ? Option.none() : Option.some(NOW - usedMinutesAgo * MINUTE),
    isCurrent: false,
    ...rest,
  }
}

const search = (input: string, candidates: ReadonlyArray<TestCandidate>, limit = 50) =>
  searchSpotlight(input, candidates, { mode: "All", now: NOW, limit })

const searchActions = (input: string, candidates: ReadonlyArray<TestCandidate>) =>
  searchSpotlight(input, candidates, { mode: "Actions", now: NOW, limit: 50 })

const action = (name: string, keywords: ReadonlyArray<string> = []) =>
  candidate(name, { kind: "Action", keywords })

const namesOf = (entries: ReadonlyArray<SpotlightEntry<TestCandidate>>) =>
  entries.flatMap((entry) => (entry._tag === "Candidate" ? [entry.candidate.name] : []))

const actionsOf = (entries: ReadonlyArray<SpotlightEntry<TestCandidate>>) =>
  entries.map((entry) =>
    entry._tag === "Candidate"
      ? entry.candidate.name
      : entry._tag === "OpenUrl"
        ? `open ${entry.url}`
        : `search ${entry.query}`,
  )

describe("with an empty input", () => {
  it("lists the open tabs by most recent use, followed by the Spaces", () => {
    const entries = search("", [
      candidate("Work", { kind: "Space" }),
      candidate("tab used yesterday", { usedMinutesAgo: 24 * 60 }),
      candidate("tab used just now", { usedMinutesAgo: 1 }),
      candidate("Hobbies", { kind: "Space" }),
    ])

    expect(namesOf(entries)).toStrictEqual([
      "tab used just now",
      "tab used yesterday",
      "Work",
      "Hobbies",
    ])
  })

  it("lists tabs with no record of use after the tabs with one", () => {
    const entries = search("", [
      candidate("never used"),
      candidate("used", { usedMinutesAgo: 600 }),
    ])

    expect(namesOf(entries)).toStrictEqual(["used", "never used"])
  })

  it("leaves out the tab currently shown in the window Spotlight was opened from", () => {
    const entries = search("", [
      candidate("shown", { usedMinutesAgo: 0, isCurrent: true }),
      candidate("another tab", { usedMinutesAgo: 5 }),
    ])

    expect(namesOf(entries)).toStrictEqual(["another tab"])
  })

  it("leaves out pins and bookmarks", () => {
    const entries = search("", [
      candidate("pin", { kind: "Pin" }),
      candidate("bookmark", { kind: "Bookmark" }),
    ])

    expect(entries).toStrictEqual([])
  })

  it("adds neither an open-URL entry nor a web search entry", () => {
    expect(search("   ", [])).toStrictEqual([])
  })

  it("lists no more than the limit", () => {
    const entries = search(
      "",
      [1, 2, 3].map((n) => candidate(`tab ${n}`, { usedMinutesAgo: n })),
      2,
    )

    expect(namesOf(entries)).toStrictEqual(["tab 1", "tab 2"])
  })

  it("over the limit, keeps the Spaces and drops the least recently used tabs", () => {
    const entries = search(
      "",
      [
        ...[1, 2, 3].map((n) => candidate(`tab ${n}`, { usedMinutesAgo: n })),
        candidate("Work", { kind: "Space" }),
      ],
      3,
    )

    expect(namesOf(entries)).toStrictEqual(["tab 1", "tab 2", "Work"])
  })
})

describe("with an input", () => {
  describe("filtering", () => {
    it("leaves out candidates whose title and URL both lack the input", () => {
      const entries = search("katip", [
        candidate("Katip design"),
        candidate("Weather", { url: "https://weather.example/" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Katip design"])
    })

    it("with several terms, lists only the candidates whose title or URL contains every term", () => {
      const entries = search("effect schema", [
        candidate("Using Schema", { url: "https://effect.website/docs/schema" }),
        candidate("Getting started with Effect", { url: "https://effect.website/docs" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Using Schema"])
    })

    it("ignores case, and full-width versus half-width forms", () => {
      const entries = search("ＧＩＴＨＵＢ", [candidate("GitHub")])

      expect(namesOf(entries)).toStrictEqual(["GitHub"])
    })

    it("matches a URL from its host name, skipping the scheme and www.", () => {
      const entries = search("github.com/eff", [
        candidate("Repository", { url: "https://www.github.com/effect-ts" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Repository"])
    })

    it("a URL typed with its scheme still matches a candidate with the same URL", () => {
      const entries = search("https://www.example.com/a", [
        candidate("Example", { url: "https://example.com/a" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Example"])
    })

    it("includes the tab currently shown", () => {
      const entries = search("katip", [candidate("Katip", { isCurrent: true })])

      expect(namesOf(entries)).toStrictEqual(["Katip"])
    })

    it("lists no more matches than the limit", () => {
      const entries = search(
        "doc",
        [1, 2, 3].map((n) => candidate(`doc ${n}`)),
        2,
      )

      expect(namesOf(entries)).toStrictEqual(["doc 1", "doc 2"])
    })
  })

  describe("ordering by match strength", () => {
    it("lists exact, then prefix, then word-start, then substring matches", () => {
      const entries = search("note", [
        candidate("footnotes"),
        candidate("my notes"),
        candidate("notebook"),
        candidate("Note"),
      ])

      expect(namesOf(entries)).toStrictEqual(["Note", "notebook", "my notes", "footnotes"])
    })

    it("a title match ranks above a URL match of the same strength", () => {
      const entries = search("git", [
        candidate("Pull requests", { url: "https://github.com/pulls" }),
        candidate("Git book", { url: "https://book.example/" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Git book", "Pull requests"])
    })

    it("a URL prefix match ranks above a title substring match", () => {
      const entries = search("git", [
        candidate("digital notes", { url: "https://notes.example/" }),
        candidate("Pull requests", { url: "https://github.com/pulls" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Pull requests", "digital notes"])
    })

    it("a title with the terms in the typed order ranks above one with them scattered", () => {
      const entries = search("google docs", [
        candidate("Docs about Google"),
        candidate("Google Docs"),
      ])

      expect(namesOf(entries)).toStrictEqual(["Google Docs", "Docs about Google"])
    })
  })

  describe("ordering among equally strong matches", () => {
    it("the most recently used comes first", () => {
      const entries = search("doc", [
        candidate("doc last week", { usedMinutesAgo: 7 * 24 * 60 }),
        candidate("doc just now", { usedMinutesAgo: 1 }),
        candidate("doc yesterday", { usedMinutesAgo: 24 * 60 }),
      ])

      expect(namesOf(entries)).toStrictEqual(["doc just now", "doc yesterday", "doc last week"])
    })

    it("lists commands, then open tabs, then pins and Spaces, bookmarks and history", () => {
      const entries = search("work", [
        candidate("work history", { kind: "History" }),
        candidate("work bookmark", { kind: "Bookmark" }),
        candidate("work pin", { kind: "Pin" }),
        candidate("work tab"),
        candidate("work action", { kind: "Action" }),
      ])

      expect(namesOf(entries)).toStrictEqual([
        "work action",
        "work tab",
        "work pin",
        "work bookmark",
        "work history",
      ])
    })

    it("a page visited just now still comes after a command, and after a tab not used for days", () => {
      const entries = search("chatgpt", [
        candidate("ChatGPT", { kind: "History", usedMinutesAgo: 0 }),
        candidate("ChatGPT", { usedMinutesAgo: 3 * 24 * 60 }),
        candidate("ChatGPT", { kind: "Action" }),
      ])

      expect(
        entries.flatMap((entry) => (entry._tag === "Candidate" ? [entry.candidate.kind] : [])),
      ).toStrictEqual(["Action", "OpenTab", "History"])
    })

    it("with the same kind too, keeps the given order", () => {
      const entries = search("doc", [candidate("doc B"), candidate("doc A")])

      expect(namesOf(entries)).toStrictEqual(["doc B", "doc A"])
    })
  })

  describe("match strength against recent use and kind", () => {
    it("a match one step stronger ranks above an open tab used just now", () => {
      const entries = search("note", [
        candidate("my notes", { usedMinutesAgo: 0 }),
        candidate("notebook", { kind: "Bookmark" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["notebook", "my notes"])
    })

    it("a page that matches one step stronger ranks above a command", () => {
      const entries = search("chatgpt", [
        candidate("Ask ChatGPT", { kind: "Action" }),
        candidate("ChatGPT", { kind: "History" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["ChatGPT", "Ask ChatGPT"])
    })
  })

  describe("open-URL and web search entries", () => {
    it("ends with an entry that searches the web for the input itself", () => {
      const entries = search("  katip extension  ", [candidate("Katip extension design")])

      expect(actionsOf(entries)).toStrictEqual(["Katip extension design", "search katip extension"])
    })

    it("adds the web search entry even with no matches", () => {
      expect(actionsOf(search("zzz", []))).toStrictEqual(["search zzz"])
    })

    it("for a URL with a scheme, puts the open entry first", () => {
      const entries = search("https://example.com", [
        candidate("Example", { url: "https://example.com/" }),
      ])

      expect(actionsOf(entries)).toStrictEqual([
        "open https://example.com",
        "Example",
        "search https://example.com",
      ])
    })

    it("for URL-like input without a scheme, puts the open entry after the matches and before the web search", () => {
      const entries = search("example.com", [candidate("Example", { url: "https://example.com/" })])

      expect(actionsOf(entries)).toStrictEqual([
        "Example",
        "open https://example.com",
        "search example.com",
      ])
    })

    it("adds no open entry when the input doesn't look like a URL", () => {
      expect(actionsOf(search("katip", []))).toStrictEqual(["search katip"])
    })
  })
})

describe("action candidates", () => {
  const actions = [
    action("Copy URL", ["Copiar URL"]),
    action("Duplicate Tab", ["Duplicar pestaña"]),
    action("Open Settings", ["Abrir ajustes"]),
  ]

  describe("when searching only actions", () => {
    it("with an empty input, lists every given action in the given order", () => {
      expect(namesOf(searchActions("", actions))).toStrictEqual([
        "Copy URL",
        "Duplicate Tab",
        "Open Settings",
      ])
    })

    it("leaves out candidates that aren't actions, even when they match", () => {
      const entries = searchActions("settings", [candidate("Settings tab"), ...actions])

      expect(namesOf(entries)).toStrictEqual(["Open Settings"])
    })

    it("with an input, lists only the matching actions, strongest match first", () => {
      const entries = searchActions("mute", [action("Unmute Tab"), action("Mute Tab")])

      expect(namesOf(entries)).toStrictEqual(["Mute Tab", "Unmute Tab"])
    })

    it("adds neither an open-URL entry nor a web search entry", () => {
      expect(actionsOf(searchActions("https://example.com/", actions))).toStrictEqual([])
    })
  })

  describe("when searching everything", () => {
    it("with an empty input, lists no actions", () => {
      expect(
        namesOf(search("", [candidate("Tab", { usedMinutesAgo: 1 }), ...actions])),
      ).toStrictEqual(["Tab"])
    })

    it("ranks matching actions together with the other candidates by match strength", () => {
      const entries = search("tab", [
        candidate("Timetable", { kind: "Bookmark" }),
        ...actions,
        candidate("Tab groups"),
      ])

      expect(namesOf(entries)).toStrictEqual(["Tab groups", "Duplicate Tab", "Timetable"])
    })
  })

  it("finds an action by its name in a language other than the one shown", () => {
    expect(namesOf(searchActions("copiar", actions))).toStrictEqual(["Copy URL"])
  })
})
