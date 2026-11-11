/** The made-up Spaces, tabs and pages the store screenshots show, in each language. */

import type { ExportV1, PinnedNodeV1 } from "../../src/modules/export/v1.ts"
import type { SamplePage } from "./sites.ts"

/** The sample pages by role. The same URLs serve every language; only their text differs. */
export const URLS = {
  roadmap: "http://docs.example.com/product/roadmap-q4",
  launch: "http://docs.example.com/product/launch-checklist",
  spec: "http://design.example.com/files/onboarding-spec",
  prototype: "http://preview.example.com/onboarding",
  standup: "http://docs.example.com/team/standup",
  onCall: "http://calendar.example.com/team/on-call",
  board: "http://tracker.example.com/boards/sprint-24",
  interviews: "http://docs.example.com/research/interviews",
  survey: "http://analytics.example.com/surveys/onboarding",
  homepageCopy: "http://docs.example.com/marketing/homepage-copy",
  pricing: "http://preview.example.com/pricing",
  styleGuide: "http://wiki.example.com/writing-style-guide",
  releaseNotes: "http://docs.example.com/releases/4-2",
  kyoto: "http://travel.example.com/guides/kyoto-autumn",
  packing: "http://notes.example.com/packing-list",
  kyotoMap: "http://maps.example.com/lists/kyoto",
  recipes: "http://recipes.example.com/collections/weeknight",
  photography: "http://learn.example.com/photography-basics",
  shoes: "http://shop.example.com/trail-running",
  ramen: "http://recipes.example.com/ramen-at-home",
  longRead: "http://news.example.com/features/slow-web",
  bookClub: "http://notes.example.com/book-club",
  moodboard: "http://photos.example.com/albums/moodboard",
  brand: "http://design.example.com/files/brand-guidelines",
  playlist: "http://music.example.com/playlists/studio",
  mail: "http://mail.example.com/inbox",
  calendar: "http://calendar.example.com/",
  chat: "http://chat.example.com/",
} as const

export type PageKey = keyof typeof URLS

type FolderKey = "product" | "team" | "research" | "trips" | "inspiration"
export type SpaceKey = "work" | "personal" | "reading" | "studio"

type SampleNode =
  | { readonly pin: PageKey }
  | { readonly split: readonly [PageKey, PageKey] }
  | {
      readonly folder: FolderKey
      readonly icon: string
      readonly children: ReadonlyArray<SampleNode>
    }

interface SampleSpace {
  readonly key: SpaceKey
  readonly theme: ExportV1["spaces"][number]["theme"]
  readonly pinned: ReadonlyArray<SampleNode>
  /** Opened as tabs after the import, as the file format leaves temporary tabs out. */
  readonly tabs: ReadonlyArray<PageKey>
}

const SPACES: ReadonlyArray<SampleSpace> = [
  {
    key: "work",
    theme: {
      mode: "light",
      colors: [
        { hue: 250, chroma: 0.4 },
        { hue: 285, chroma: 0.3 },
      ],
      intensity: 0.5,
      grain: 0.1,
    },
    pinned: [
      {
        folder: "product",
        icon: "bolt",
        children: [{ pin: "roadmap" }, { pin: "launch" }, { split: ["spec", "prototype"] }],
      },
      { folder: "team", icon: "people", children: [{ pin: "standup" }, { pin: "onCall" }] },
      { pin: "board" },
      {
        folder: "research",
        icon: "bookmark",
        children: [{ pin: "interviews" }, { pin: "survey" }],
      },
    ],
    tabs: ["homepageCopy", "pricing", "styleGuide", "releaseNotes"],
  },
  {
    key: "personal",
    theme: {
      mode: "light",
      colors: [
        { hue: 40, chroma: 0.75 },
        { hue: 355, chroma: 0.6 },
      ],
      intensity: 0.65,
      grain: 0.25,
    },
    pinned: [
      {
        folder: "trips",
        icon: "airplane",
        children: [{ pin: "kyoto" }, { pin: "packing" }, { pin: "kyotoMap" }],
      },
      { pin: "recipes" },
      { pin: "photography" },
    ],
    tabs: ["shoes", "ramen"],
  },
  {
    key: "reading",
    theme: { mode: "light", colors: [{ hue: 350, chroma: 0.5 }], intensity: 0.6, grain: 0.2 },
    pinned: [{ pin: "longRead" }, { pin: "bookClub" }],
    tabs: [],
  },
  {
    key: "studio",
    theme: {
      mode: "dark",
      colors: [
        { hue: 170, chroma: 0.6 },
        { hue: 230, chroma: 0.55 },
      ],
      intensity: 0.7,
      grain: 0.15,
    },
    pinned: [
      { folder: "inspiration", icon: "star", children: [{ pin: "moodboard" }, { pin: "brand" }] },
      { pin: "playlist" },
    ],
    tabs: [],
  },
]

const FAVORITES: ReadonlyArray<PageKey> = ["mail", "calendar", "chat"]

export interface Caption {
  /** A word or two above the title, naming the feature. */
  readonly eyebrow: string
  readonly title: string
  readonly subtitle: string
}

export type Shot = "spaces" | "spotlight" | "split" | "arc" | "themes" | "bangs"

export interface LocaleSamples {
  readonly lang: "en" | "ja"
  readonly captions: Readonly<Record<Shot, Caption>>
  readonly spaceNames: Readonly<Record<SpaceKey, string>>
  readonly folderNames: Readonly<Record<FolderKey, string>>
  readonly pages: Readonly<Record<PageKey, SamplePage>>
  /** Typed into Spotlight; matches a tab and the copy commands. */
  readonly spotlightQuery: string
}

const plain = (title: string): SamplePage => ({ kind: "plain", title })

const en: LocaleSamples = {
  lang: "en",
  captions: {
    spaces: {
      eyebrow: "Spaces",
      title: "Your tabs, organized into Spaces",
      subtitle: "Pin the tabs you keep, file them in folders, and switch Spaces with a click.",
    },
    spotlight: {
      eyebrow: "Spotlight",
      title: "Find anything. Run any command.",
      subtitle: "Search your tabs, pins and Spaces, or run a command, right from the keyboard.",
    },
    split: {
      eyebrow: "Split view",
      title: "Split view, pinned for later",
      subtitle: "Keep two pages side by side, and reopen the pair from a single pin.",
    },
    arc: {
      eyebrow: "Import",
      title: "Move over from Arc in a minute",
      subtitle: "Bring your Spaces, pins, folders and Favorites over from Arc’s sidebar file.",
    },
    themes: {
      eyebrow: "Themes",
      title: "Colors and themes for every Space",
      subtitle: "Give each Space its own colors, a gradient, and a light or dark look.",
    },
    bangs: {
      eyebrow: "Bangs",
      title: "Search any site with a bang",
      subtitle: "Type ! and a site’s shortcut in Spotlight to search that site straight away.",
    },
  },
  spaceNames: { work: "Work", personal: "Personal", reading: "Reading", studio: "Studio" },
  folderNames: {
    product: "Product",
    team: "Team",
    research: "Research",
    trips: "Trips",
    inspiration: "Inspiration",
  },
  spotlightQuery: "copy",
  pages: {
    roadmap: {
      kind: "doc",
      title: "Q4 roadmap",
      folder: "Product",
      meta: "Product team · Updated 2 days ago",
      blocks: [
        {
          text: "Three themes guide this quarter: a faster first run, sharing that just works, and no surprises in billing.",
        },
        { heading: "Goals" },
        {
          table: [
            ["Goal", "Owner", "Status"],
            ["New onboarding flow", "Maya", "In progress"],
            ["Shared workspaces", "Leo", "Design review"],
            ["Usage-based billing", "Priya", "Planned"],
            ["Offline mode beta", "Sam", "Planned"],
          ],
        },
        { heading: "Milestones" },
        {
          checklist: [
            ["Kickoff and scope", true],
            ["Design review for onboarding", true],
            ["Beta for shared workspaces", false],
            ["Public launch", false],
          ],
        },
        { heading: "Open questions" },
        {
          list: [
            "Do shared workspaces need their own billing?",
            "Which templates should the first run offer?",
          ],
        },
      ],
    },
    spec: {
      kind: "doc",
      title: "UI spec",
      folder: "Onboarding",
      meta: "Design · Version 3 · Edited yesterday",
      blocks: [
        {
          text: "A new account should reach a useful screen in under a minute. This spec covers the three steps between sign-up and the first project.",
        },
        { heading: "Steps" },
        {
          list: [
            "Welcome: one question about what you want to do first",
            "Import: bring in existing files, or skip",
            "First project: a template picked from the answer",
          ],
        },
        { heading: "Success metrics" },
        {
          table: [
            ["Metric", "Today", "Target"],
            ["Time to first project", "3 min 40 s", "Under 1 min"],
            ["Finished onboarding", "62%", "80%"],
          ],
        },
        { heading: "Notes" },
        {
          text: "Skipping the import must never block the first project. Files can come in later from the project menu.",
        },
      ],
    },
    prototype: {
      kind: "landing",
      title: "Prototype",
      brand: "Acme",
      nav: ["Product", "Pricing", "Docs", "Sign in"],
      headline: "Start your first project in under a minute",
      lead: "Answer one question, bring in your files, and pick up right where you left off.",
      actions: ["Get started", "See how it works"],
      features: [
        { title: "One question", text: "Tell us what you want to do first." },
        { title: "Bring your files", text: "Import from anywhere, or skip for now." },
        { title: "Ready-made templates", text: "Start from a project that fits." },
      ],
    },
    kyoto: {
      kind: "article",
      title: "Kyoto in autumn: a three-day walk",
      section: "Guides · Japan",
      byline: "Travel desk · 8 min read",
      lead: "The maples turn in mid-November. Start early, walk the quieter northern temples, and save the famous views for the last light of the day.",
      paragraphs: [
        "Day one follows the Philosopher’s Path from Ginkaku-ji down to Nanzen-ji. Set out before nine and you will share it with joggers rather than tour groups.",
        "On day two, take the train north to Ohara. The valley is cooler, the temples are smaller, and lunch comes with a view of the hills.",
      ],
    },
    launch: plain("Launch checklist"),
    standup: plain("Standup notes"),
    onCall: plain("On-call schedule"),
    board: plain("Sprint 24 board"),
    interviews: plain("Customer interviews"),
    survey: plain("Onboarding survey results"),
    homepageCopy: plain("Homepage copy review"),
    pricing: plain("Pricing page draft"),
    styleGuide: plain("Writing style guide"),
    releaseNotes: plain("Release notes 4.2"),
    packing: plain("Packing list"),
    kyotoMap: plain("Kyoto places"),
    recipes: plain("Weeknight dinners"),
    photography: plain("Photography basics"),
    shoes: plain("Trail running shoes"),
    ramen: plain("Ramen at home"),
    longRead: plain("In praise of the slow web"),
    bookClub: plain("Book club picks"),
    moodboard: plain("Moodboard"),
    brand: plain("Brand guidelines"),
    playlist: plain("Studio playlist"),
    mail: plain("Inbox (3) – Mail"),
    calendar: plain("Calendar"),
    chat: plain("Chat"),
  },
}

const ja: LocaleSamples = {
  lang: "ja",
  captions: {
    spaces: {
      eyebrow: "Space",
      title: "タブを Space ごとに整理",
      subtitle: "よく使うタブはピン留めしてフォルダに。Space はワンクリックで切り替え。",
    },
    spotlight: {
      eyebrow: "Spotlight",
      title: "なんでも検索、すぐに実行",
      subtitle: "タブ・ピン留め・Space の検索も、コマンドの実行も、キーボードだけで。",
    },
    split: {
      eyebrow: "分割ビュー",
      title: "分割ビューを、そのままピン留め",
      subtitle: "2 つのページを並べたまま残して、ピンひとつで元どおりに開けます。",
    },
    arc: {
      eyebrow: "インポート",
      title: "Arc からの乗り換えも 1 分で",
      subtitle:
        "Arc のサイドバーのファイルから、Space・ピン留め・フォルダ・Favorites を取り込めます。",
    },
    themes: {
      eyebrow: "テーマ",
      title: "Space ごとに、色とテーマを",
      subtitle: "Space それぞれに、色やグラデーション、ライトとダークを選べます。",
    },
    bangs: {
      eyebrow: "bangs",
      title: "どのサイトも、bangs で検索",
      subtitle: "Spotlight で ! に続けてサイトの短縮名を打てば、そのサイトをすぐに検索。",
    },
  },
  spaceNames: { work: "仕事", personal: "プライベート", reading: "読書", studio: "制作" },
  folderNames: {
    product: "プロダクト",
    team: "チーム",
    research: "リサーチ",
    trips: "旅行",
    inspiration: "インスピレーション",
  },
  spotlightQuery: "コピー",
  pages: {
    roadmap: {
      kind: "doc",
      title: "第4四半期ロードマップ",
      folder: "プロダクト",
      meta: "プロダクトチーム · 2日前に更新",
      blocks: [
        {
          text: "今期は「はじめての体験を速く」「共有をもっと簡単に」「請求で驚かせない」の3つを軸に進めます。",
        },
        { heading: "目標" },
        {
          table: [
            ["目標", "担当", "状況"],
            ["新しいオンボーディング", "佐藤", "進行中"],
            ["共有ワークスペース", "田中", "デザインレビュー"],
            ["従量課金", "鈴木", "予定"],
            ["オフラインモードのベータ版", "高橋", "予定"],
          ],
        },
        { heading: "マイルストーン" },
        {
          checklist: [
            ["キックオフと範囲の決定", true],
            ["オンボーディングのデザインレビュー", true],
            ["共有ワークスペースのベータ版", false],
            ["一般公開", false],
          ],
        },
        { heading: "未解決の論点" },
        {
          list: [
            "共有ワークスペースに専用の請求は必要か",
            "はじめての体験でどのテンプレートを出すか",
          ],
        },
      ],
    },
    spec: {
      kind: "doc",
      title: "画面仕様",
      folder: "オンボーディング",
      meta: "デザイン · 第3版 · 昨日編集",
      blocks: [
        {
          text: "新しいアカウントが1分以内に役立つ画面へたどり着くことを目指します。登録から最初のプロジェクトまでの3つのステップを扱います。",
        },
        { heading: "ステップ" },
        {
          list: [
            "ようこそ：最初にやりたいことを1つだけ質問",
            "取り込み：既存のファイルを取り込む（スキップ可）",
            "最初のプロジェクト：回答に合わせたテンプレート",
          ],
        },
        { heading: "成功の指標" },
        {
          table: [
            ["指標", "現在", "目標"],
            ["最初のプロジェクトまで", "3分40秒", "1分以内"],
            ["オンボーディング完了率", "62%", "80%"],
          ],
        },
        { heading: "メモ" },
        {
          text: "取り込みをスキップしても、最初のプロジェクトは必ず作れること。ファイルはあとからプロジェクトのメニューで取り込めます。",
        },
      ],
    },
    prototype: {
      kind: "landing",
      title: "試作版",
      brand: "Acme",
      nav: ["製品", "料金", "ドキュメント", "ログイン"],
      headline: "1分で、最初のプロジェクトを",
      lead: "質問に1つ答えてファイルを取り込めば、すぐに続きから始められます。",
      actions: ["はじめる", "しくみを見る"],
      features: [
        { title: "質問はひとつだけ", text: "最初にやりたいことを教えてください。" },
        { title: "ファイルを取り込む", text: "どこからでも。あとからでも大丈夫。" },
        { title: "すぐ使えるテンプレート", text: "目的に合ったプロジェクトから。" },
      ],
    },
    kyoto: {
      kind: "article",
      title: "秋の京都、3日間の散歩旅",
      section: "ガイド · 日本",
      byline: "トラベル編集部 · 8分で読めます",
      lead: "紅葉の見頃は11月中旬。朝早く出て北の静かなお寺を歩き、有名な景色は夕方の光にとっておきましょう。",
      paragraphs: [
        "1日目は銀閣寺から南禅寺まで、哲学の道を歩きます。9時前に出れば、すれ違うのは観光客よりもジョギングをする人たちです。",
        "2日目は電車で北の大原へ。谷は少し涼しく、お寺はこぢんまりとしていて、山を眺めながらお昼を食べられます。",
      ],
    },
    launch: plain("リリース前チェックリスト"),
    standup: plain("朝会メモ"),
    onCall: plain("当番表"),
    board: plain("スプリント 24 のボード"),
    interviews: plain("顧客インタビュー"),
    survey: plain("オンボーディング調査の結果"),
    homepageCopy: plain("トップページのキャッチコピー案"),
    pricing: plain("料金ページの下書き"),
    styleGuide: plain("文章スタイルガイド"),
    releaseNotes: plain("リリースノート 4.2"),
    packing: plain("持ち物リスト"),
    kyotoMap: plain("京都で行きたい場所"),
    recipes: plain("平日の晩ごはん"),
    photography: plain("写真の基本"),
    shoes: plain("トレイルランニングシューズ"),
    ramen: plain("家で作るラーメン"),
    longRead: plain("ゆっくりしたウェブのすすめ"),
    bookClub: plain("読書会の課題本"),
    moodboard: plain("ムードボード"),
    brand: plain("ブランドガイドライン"),
    playlist: plain("作業用プレイリスト"),
    mail: plain("受信トレイ (3) – Mail"),
    calendar: plain("カレンダー"),
    chat: plain("チャット"),
  },
}

export const LOCALES: ReadonlyArray<LocaleSamples> = [en, ja]

/** The pages opened as temporary tabs in each Space, in the order they should end up listed. */
export const temporaryTabsOf = (key: SpaceKey): ReadonlyArray<PageKey> =>
  SPACES.find((space) => space.key === key)?.tabs ?? []

/** Every sample URL, so their icons can be cached before anything shows them. */
/**
 * Commands with a keyword, added for the bangs screenshot, where a ! typed alone lists them. Each
 * searches its sample site, whose name it takes.
 */
export const BANG_COMMANDS = [
  { host: "docs.example.com", keyword: "docs" },
  { host: "tracker.example.com", keyword: "tr" },
  { host: "maps.example.com", keyword: "maps" },
  { host: "news.example.com", keyword: "news" },
  { host: "recipes.example.com", keyword: "food" },
] as const

/** The page a command of {@link BANG_COMMANDS} shows the icon of: its site's top page. */
export const bangSiteUrlOf = (command: (typeof BANG_COMMANDS)[number]) => `http://${command.host}/`

export const ALL_URLS: ReadonlyArray<string> = [
  ...Object.values(URLS),
  ...BANG_COMMANDS.map(bangSiteUrlOf),
]

/** A Katip export file holding the sample Spaces and Favorites, in `samples`' language. */
export const sampleExport = (samples: LocaleSamples): ExportV1 => {
  const link = (key: PageKey) => ({ title: samples.pages[key].title, url: URLS[key] })
  const node = (sample: SampleNode): PinnedNodeV1 => {
    if ("pin" in sample) return { type: "pin", ...link(sample.pin) }
    if ("split" in sample) {
      const [left, right] = sample.split
      return {
        type: "split",
        items: [
          { type: "pin", ...link(left) },
          { type: "pin", ...link(right) },
        ],
      }
    }
    return {
      type: "folder",
      title: samples.folderNames[sample.folder],
      icon: sample.icon,
      children: sample.children.map(node),
    }
  }
  return {
    format: "katip.export",
    version: 1,
    exportedAt: "2026-11-01T09:00:00.000Z",
    generator: { name: "Katip", version: "1.0.0" },
    spaces: SPACES.map((space) => ({
      id: space.key,
      name: samples.spaceNames[space.key],
      theme: space.theme,
      pinned: space.pinned.map(node),
      tabs: [],
    })),
    favorites: FAVORITES.map(link),
    settings: {
      newTabsOnTop: true,
      showAllOpenTabsInCollapsedFolders: false,
      syncTabGroups: false,
      autoArchive: { enabled: false, idleMinutes: 720 },
      defaultSpaceId: null,
      locale: samples.lang,
      pageShortcuts: { copyUrl: false, copyMarkdownLink: false },
    },
  }
}
