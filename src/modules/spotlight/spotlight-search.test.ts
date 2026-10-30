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
        ? `開く ${entry.url}`
        : `検索 ${entry.query}`,
  )

describe("検索語が空のとき", () => {
  it("開いているタブを最近使った順に並べ、続けて Space を並べる", () => {
    const entries = search("", [
      candidate("仕事", { kind: "Space" }),
      candidate("昨日のタブ", { usedMinutesAgo: 24 * 60 }),
      candidate("さっきのタブ", { usedMinutesAgo: 1 }),
      candidate("趣味", { kind: "Space" }),
    ])

    expect(namesOf(entries)).toStrictEqual(["さっきのタブ", "昨日のタブ", "仕事", "趣味"])
  })

  it("使った記録の無いタブは、記録のあるタブの後に並ぶ", () => {
    const entries = search("", [
      candidate("記録なし"),
      candidate("記録あり", { usedMinutesAgo: 600 }),
    ])

    expect(namesOf(entries)).toStrictEqual(["記録あり", "記録なし"])
  })

  it("呼び出し元で今表示しているタブは出さない", () => {
    const entries = search("", [
      candidate("表示中", { usedMinutesAgo: 0, isCurrent: true }),
      candidate("別のタブ", { usedMinutesAgo: 5 }),
    ])

    expect(namesOf(entries)).toStrictEqual(["別のタブ"])
  })

  it("ピンとブックマークは出さない", () => {
    const entries = search("", [
      candidate("ピン", { kind: "Pin" }),
      candidate("ブックマーク", { kind: "Bookmark" }),
    ])

    expect(entries).toStrictEqual([])
  })

  it("URL を開く項目もウェブ検索の項目も出さない", () => {
    expect(search("   ", [])).toStrictEqual([])
  })

  it("上限の件数までしか出さない", () => {
    const entries = search(
      "",
      [1, 2, 3].map((n) => candidate(`タブ${n}`, { usedMinutesAgo: n })),
      2,
    )

    expect(namesOf(entries)).toStrictEqual(["タブ1", "タブ2"])
  })

  it("上限に収まらなければ、Space を残して使ったのが古いタブを省く", () => {
    const entries = search(
      "",
      [
        ...[1, 2, 3].map((n) => candidate(`タブ${n}`, { usedMinutesAgo: n })),
        candidate("仕事", { kind: "Space" }),
      ],
      3,
    )

    expect(namesOf(entries)).toStrictEqual(["タブ1", "タブ2", "仕事"])
  })
})

describe("検索語があるとき", () => {
  describe("絞り込み", () => {
    it("タイトルにも URL にも含まれない候補は出さない", () => {
      const entries = search("katip", [
        candidate("Katip の設計"),
        candidate("Arc", { url: "https://arc.net/" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Katip の設計"])
    })

    it("複数の語は、すべての語がタイトルか URL のどちらかに含まれる候補だけを出す", () => {
      const entries = search("effect schema", [
        candidate("Schema の使い方", { url: "https://effect.website/docs/schema" }),
        candidate("Effect の入門", { url: "https://effect.website/docs" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Schema の使い方"])
    })

    it("大文字小文字と全角半角を区別しない", () => {
      const entries = search("ＧＩＴＨＵＢ", [candidate("GitHub")])

      expect(namesOf(entries)).toStrictEqual(["GitHub"])
    })

    it("URL の scheme と www. を飛ばしてホスト名から一致させる", () => {
      const entries = search("github.com/eff", [
        candidate("リポジトリ", { url: "https://www.github.com/effect-ts" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["リポジトリ"])
    })

    it("scheme から書いた URL でも、同じ URL の候補に一致する", () => {
      const entries = search("https://www.example.com/a", [
        candidate("Example", { url: "https://example.com/a" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Example"])
    })

    it("今表示しているタブも出す", () => {
      const entries = search("katip", [candidate("Katip", { isCurrent: true })])

      expect(namesOf(entries)).toStrictEqual(["Katip"])
    })

    it("一致した候補は上限の件数までしか出さない", () => {
      const entries = search(
        "doc",
        [1, 2, 3].map((n) => candidate(`doc ${n}`)),
        2,
      )

      expect(namesOf(entries)).toStrictEqual(["doc 1", "doc 2"])
    })
  })

  describe("一致の強さによる並び", () => {
    it("完全一致、前方一致、単語の先頭一致、部分一致の順に並ぶ", () => {
      const entries = search("note", [
        candidate("footnotes"),
        candidate("my notes"),
        candidate("notebook"),
        candidate("Note"),
      ])

      expect(namesOf(entries)).toStrictEqual(["Note", "notebook", "my notes", "footnotes"])
    })

    it("タイトルでの一致は、URL での同じ強さの一致より上に来る", () => {
      const entries = search("git", [
        candidate("Pull requests", { url: "https://github.com/pulls" }),
        candidate("Git の本", { url: "https://book.example/" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Git の本", "Pull requests"])
    })

    it("URL の前方一致は、タイトルの部分一致より上に来る", () => {
      const entries = search("git", [
        candidate("digital notes", { url: "https://notes.example/" }),
        candidate("Pull requests", { url: "https://github.com/pulls" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["Pull requests", "digital notes"])
    })

    it("語が入力どおりの順に続くタイトルは、語が散らばったタイトルより上に来る", () => {
      const entries = search("google docs", [
        candidate("Docs about Google"),
        candidate("Google Docs"),
      ])

      expect(namesOf(entries)).toStrictEqual(["Google Docs", "Docs about Google"])
    })
  })

  describe("同じ強さで一致したときの並び", () => {
    it("最近使ったものが上に来る", () => {
      const entries = search("doc", [
        candidate("doc 先週", { usedMinutesAgo: 7 * 24 * 60 }),
        candidate("doc さっき", { usedMinutesAgo: 1 }),
        candidate("doc 昨日", { usedMinutesAgo: 24 * 60 }),
      ])

      expect(namesOf(entries)).toStrictEqual(["doc さっき", "doc 昨日", "doc 先週"])
    })

    it("使った記録も同じなら、開いているタブ、ピンと Space、操作、ブックマーク、履歴の順に並ぶ", () => {
      const entries = search("work", [
        candidate("work 履歴", { kind: "History" }),
        candidate("work ブックマーク", { kind: "Bookmark" }),
        candidate("work 操作", { kind: "Action" }),
        candidate("work ピン", { kind: "Pin" }),
        candidate("work タブ"),
      ])

      expect(namesOf(entries)).toStrictEqual([
        "work タブ",
        "work ピン",
        "work 操作",
        "work ブックマーク",
        "work 履歴",
      ])
    })

    it("種類も同じなら、渡された順を保つ", () => {
      const entries = search("doc", [candidate("doc B"), candidate("doc A")])

      expect(namesOf(entries)).toStrictEqual(["doc B", "doc A"])
    })
  })

  describe("一致の強さと、最近使ったことや種類との兼ね合い", () => {
    it("一段強い一致は、今使ったばかりの開いているタブより上に来る", () => {
      const entries = search("note", [
        candidate("my notes", { usedMinutesAgo: 0 }),
        candidate("notebook", { kind: "Bookmark" }),
      ])

      expect(namesOf(entries)).toStrictEqual(["notebook", "my notes"])
    })
  })

  describe("URL を開く項目とウェブ検索の項目", () => {
    it("最後に、入力そのものでウェブを検索する項目が付く", () => {
      const entries = search("  katip 拡張  ", [candidate("Katip 拡張の設計")])

      expect(actionsOf(entries)).toStrictEqual(["Katip 拡張の設計", "検索 katip 拡張"])
    })

    it("一致する候補が無くても、ウェブを検索する項目は出す", () => {
      expect(actionsOf(search("zzz", []))).toStrictEqual(["検索 zzz"])
    })

    it("scheme を書いた URL なら、開く項目を先頭に置く", () => {
      const entries = search("https://example.com", [
        candidate("Example", { url: "https://example.com/" }),
      ])

      expect(actionsOf(entries)).toStrictEqual([
        "開く https://example.com",
        "Example",
        "検索 https://example.com",
      ])
    })

    it("scheme を省いた URL らしい入力なら、一致した候補の後、ウェブ検索の前に置く", () => {
      const entries = search("example.com", [candidate("Example", { url: "https://example.com/" })])

      expect(actionsOf(entries)).toStrictEqual([
        "Example",
        "開く https://example.com",
        "検索 example.com",
      ])
    })

    it("URL らしくなければ、開く項目を出さない", () => {
      expect(actionsOf(search("katip", []))).toStrictEqual(["検索 katip"])
    })
  })
})

describe("操作の候補", () => {
  const actions = [
    action("URL をコピー", ["Copy URL"]),
    action("タブを複製", ["Duplicate Tab"]),
    action("設定を開く", ["Open Settings"]),
  ]

  describe("操作だけを探すとき", () => {
    it("入力が空なら、渡された操作をすべて渡された順に並べる", () => {
      expect(namesOf(searchActions("", actions))).toStrictEqual([
        "URL をコピー",
        "タブを複製",
        "設定を開く",
      ])
    })

    it("操作でない候補は、一致しても出さない", () => {
      const entries = searchActions("設定", [candidate("設定のタブ"), ...actions])

      expect(namesOf(entries)).toStrictEqual(["設定を開く"])
    })

    it("入力があれば、一致する操作だけを一致の強さの順に並べる", () => {
      const entries = searchActions("タブ", [action("新しいタブ"), action("タブを閉じる")])

      expect(namesOf(entries)).toStrictEqual(["タブを閉じる", "新しいタブ"])
    })

    it("URL を開く項目もウェブ検索の項目も付けない", () => {
      expect(actionsOf(searchActions("https://example.com/", actions))).toStrictEqual([])
    })
  })

  describe("すべてから探すとき", () => {
    it("入力が空なら、操作は出さない", () => {
      expect(
        namesOf(search("", [candidate("タブ", { usedMinutesAgo: 1 }), ...actions])),
      ).toStrictEqual(["タブ"])
    })

    it("一致した操作も、ほかの候補と一緒に一致の強さの順に並ぶ", () => {
      const entries = search("複製", [
        candidate("手順を複製する", { kind: "Bookmark" }),
        ...actions,
        candidate("複製の手順"),
      ])

      expect(namesOf(entries)).toStrictEqual(["複製の手順", "タブを複製", "手順を複製する"])
    })
  })

  it("表示している名前とは別の言語の名前でも引ける", () => {
    expect(namesOf(searchActions("copy", actions))).toStrictEqual(["URL をコピー"])
  })
})
