import { GITHUB_RELEASES_URL } from "../site.ts"
import type { Copy } from "./copy.ts"

export const ja: Copy = {
  meta: {
    title: "Katip – Chrome のサイドパネルで使う縦型タブと Space",
    description:
      "Katip は、Chrome のサイドパネルをタブを整理するサイドバーに変える拡張機能です。Space、ピン留め、フォルダ、分割ビュー、Spotlight 検索に対応。無料のオープンソースで、データはブラウザの外に出ません。",
    imageAlt:
      "Katip: タブを Space ごとに整理。サイドパネルに「仕事」Space のピン留めタブとフォルダが並んでいます。",
  },
  skipToContent: "本文へ移動",
  header: {
    home: "Katip のトップ",
    sections: "セクション",
    features: "機能",
    arc: "Arc から移行",
    privacy: "プライバシー",
    github: "GitHub の Katip",
  },
  hero: {
    title: "Chrome のサイドパネルに、縦型タブと Space を",
    lead: "プロジェクトごとに Space を分け、よく開くページはピン留めし、Spotlight でなんでも探せます。",
    note: "無料・オープンソース · Chrome 120 以降",
    screenshotAlt:
      "ドキュメントの横のサイドパネルに表示した Katip。「仕事」Space に、Favorites の列、ピン留めタブと分割ビューのピンが入った「プロダクト」フォルダ、ほかのフォルダ、その下に開いているタブが並んでいます。",
    details: [
      {
        title: "ピンも同期",
        text: "ピンとフォルダはブックマークとして保存され、Chrome の同期で届きます。",
      },
      {
        title: "Favorites",
        text: "よく使うページを、どの Space でも上にアイコンで並べます。",
      },
    ],
  },
  cta: {
    addToChrome: "Chrome に追加",
    comingSoon: "Chrome ウェブストアで近日公開",
    github: "GitHub で見る",
    fromRelease: [
      "公開までのあいだは、GitHub の",
      { link: "リリース", href: GITHUB_RELEASES_URL },
      "からダウンロードし、chrome://extensions で読み込んで使えます。",
    ],
  },
  spotlight: {
    eyebrow: "Spotlight",
    title: "なんでも検索、すぐに実行",
    lead: "タブ・ピン留め・Space の検索も、コマンドの実行も、キーボードだけで。",
    screenshotAlt:
      "ブラウザのウィンドウの上に開いた Spotlight。「コピー」と入力すると、タイトルが一致するタブ、「URL をコピー」「URL を Markdown のリンクとしてコピー」のコマンド、ウェブ検索が並びます。",
    details: [
      {
        title: "ひとつの検索窓で",
        text: "タブ、ピン、Favorites、ブックマーク、Web に加え、許可すれば履歴も探せます。",
      },
      {
        title: "大きさも位置も好みに",
        text: "設定で、コンパクト・標準・大きめと、開く位置を選べます。",
      },
    ],
  },
  bangs: {
    eyebrow: "bangs",
    title: "どのサイトも、bangs で検索",
    lead: "Spotlight で ! に続けてサイトの短縮名を打つと、そのサイトをすぐに検索できます。",
    screenshotAlt:
      "「!」だけを入力した Spotlight。サイト内検索が 5 つ、短縮名とともに並んでいます: Tracker（!tr）、Docs（!docs）、Recipes（!food）、Maps（!maps）、News（!news）。",
    details: [
      {
        title: "数千のサイトに対応",
        text: [
          { code: "!gh katip" },
          " で GitHub を、",
          { code: "!w" },
          " で Wikipedia を、",
          { code: "!yt" },
          " で YouTube を検索します。",
        ],
      },
      {
        title: "自分の短縮名も",
        text: "設定でコマンドを追加すれば、どのサイトにもキーワードを付けられます。",
      },
    ],
  },
  splitView: {
    eyebrow: "分割ビュー",
    title: "分割ビューを、そのままピン留め",
    lead: "2 つのページを並べたまま残して、ピンひとつで元どおりに開けます。",
    screenshotAlt:
      "分割ビューで左右に並べた画面仕様と試作版。サイドパネルでは、同じ組み合わせが「プロダクト」フォルダの中にひとつのピンとして並んでいます。",
    details: [
      {
        title: "タブをタブに重ねる",
        text: "タブを別のタブか、ページの左右にドラッグします。",
      },
      {
        title: "Chrome 155 以降",
        text: "Chrome の分割ビューを使います。",
      },
    ],
  },
  themes: {
    eyebrow: "テーマ",
    title: "Space ごとに、色とテーマを",
    lead: "Space それぞれに、色やグラデーション、ライトとダークを選べます。",
    screenshotAlt:
      "コーラルとピンクに色づいた「プライベート」Space のサイドパネルで開いたテーマの設定。色を選ぶ面、プリセットの色の列、ライト・ダーク・自動の切り替えが並び、横に旅行記事が開いています。",
    details: [
      {
        title: "グラデーションとテクスチャ",
        text: "プリセットか好きな色を選び、粒子・フィルム・リネン・紙などを重ねられます。",
      },
      {
        title: "ライト、ダーク、自動",
        text: "Space ごとにシステムに合わせられ、Spotlight もそれに従います。",
      },
    ],
  },
  more: {
    eyebrow: "ほかにも",
    title: "毎日使うための、細かな工夫",
    lead: "サイドバーを、じゃまにならない道具にするための機能です。",
    features: {
      liveFolders: {
        title: "ライブフォルダ",
        text: "Gmail の受信トレイや GitHub のレビュー依頼を、ひとりでに新しくなるフォルダに。",
      },
      temporaryTabs: {
        title: "一時タブ",
        text: "ピン留めしていないタブは、ワンクリックで片付けたり、自動でアーカイブしたりできます。",
      },
      shortcuts: {
        title: "キーボードショートカット",
        text: "Spotlight を開くのも、ピン留めやリンクのコピーも、キーでできます。",
      },
      languages: {
        title: "4 つの言語",
        text: "英語、日本語、簡体字中国語、スペイン語に対応しています。",
      },
    },
  },
  arc: {
    eyebrow: "Arc から乗り換えるなら",
    title: "Arc からの乗り換えも 1 分で",
    lead: "Space とその色、ピン、フォルダ、分割ビュー、Favorites を取り込めます。",
    screenshotAlt:
      "Katip の設定の「データ」で、Arc から読み込む内容を確認している画面。Arc のプロファイルごとに読み込む Space、別々の Space にするか 1 つにまとめるか、追加するもの（4 個の Space、9 個のピン留めタブ、3 個のフォルダ、2 個の分割ビュー、3 個の Favorites）が並んでいます。",
    steps: {
      openSettings: [
        "Katip の設定で",
        { strong: "「データ」→「Arc から読み込む」" },
        "を選びます。",
      ],
      chooseFile: ["Arc の ", { code: "StorableSidebar.json" }, " を選びます。"],
      import: ["内容を確かめて、読み込みます。"],
    },
    locationsTitle: "ファイルの場所",
    locations: [
      {
        system: "macOS",
        path: "~/Library/Application Support/Arc/StorableSidebar.json",
        hint: "ファイルを選ぶ画面で ⌘⇧G を押すと、パスを貼り付けられます。",
      },
      {
        system: "Windows",
        path: "%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_…\\LocalCache\\Local\\Arc\\",
        hint: "このフォルダの中にあります。",
      },
    ],
    promises: ["追加するだけで、今あるものは変えません。", "ファイルはブラウザの外に出ません。"],
  },
  privacy: {
    eyebrow: "プライバシー",
    title: "データはブラウザの外に出ません",
    lead: "Katip はサーバーを持たず、データを集めません。",
    points: [
      {
        title: "アカウントもトラッキングもなし",
        text: "登録は不要で、分析、テレメトリ、広告もありません。",
      },
      {
        title: "アップデートの確認は止められます",
        text: "GitHub に最新のリリースを問い合わせるだけで、データは送りません。",
      },
      {
        title: "ライブフォルダは許可したときだけ",
        text: "ブラウザから Gmail や GitHub に直接つなぎます。",
      },
    ],
    policyLink: "プライバシーポリシーを読む",
  },
  openSource: {
    eyebrow: "オープンソース",
    title: "無料の、オープンソース",
    lead: "Katip のコードは、すべて MIT ライセンスで GitHub に公開しています。名前とロゴは対象外なので、手を加えたものには別の名前とアイコンを付けてください。",
  },
  footer: {
    links: "Katip",
    github: "GitHub",
    privacy: "プライバシーポリシー",
    license: "MIT ライセンス",
    language: "言語",
  },
  privacyPage: {
    title: "プライバシーポリシー",
    metaTitle: "プライバシーポリシー – Katip",
    description:
      "Katip が扱うデータと、その行き先。Katip はサーバーを持たず、データを集めず、誰にも何も送りません。",
  },
}
