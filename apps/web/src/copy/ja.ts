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
    lead: "Katip は、サイドパネルをタブを整理するサイドバーに変えます。プロジェクトごとに Space を分け、よく開くページはピン留めし、Spotlight でなんでも探せます。",
    note: "無料・オープンソース · Chrome 120 以降",
    screenshotAlt:
      "ドキュメントの横のサイドパネルに表示した Katip。「仕事」Space に、Favorites の列、ピン留めタブと分割ビューのピンが入った「プロダクト」フォルダ、ほかのフォルダ、その下に開いているタブが並んでいます。",
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
  spaces: {
    eyebrow: "Space",
    title: "タブを Space ごとに整理",
    lead: "よく使うタブはピン留めしてフォルダに。Space はワンクリックで切り替え。",
    details: [
      {
        title: "プロジェクトごとに Space",
        text: "仕事、個人の開発、趣味など、タブのまとまりを分けて持てます。Space ごとに、ピン、開いているタブ、色を持ちます。",
      },
      {
        title: "ピンとフォルダ",
        text: "ピンはブックマークとして保存されるので、Chrome の同期でほかのパソコンにも届きます。フォルダは入れ子にでき、アイコンも付けられます。どれもドラッグで自由に動かせます。",
      },
      {
        title: "Favorites",
        text: "どのウィンドウでも、よく使うページをサイドパネルの上にアイコンで並べます。タブを閉じても Favorites に残り、クリックするとまた開きます。",
      },
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
        text: "開いているタブ、ピン、Space、履歴、Web を、ひとつの検索窓で探せます。",
      },
      {
        title: "コマンドもすぐに",
        text: "URL のコピー、Markdown のリンクとしてコピー、ピン留め、別の Space への移動などを実行できます。空欄で Tab を押すと、コマンドだけを探せます。",
      },
      {
        title: "履歴の検索は任意",
        text: "履歴を検索するのは、許可したときだけです。検索は端末の中で行います。",
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
        text: "タブを別のタブにドラッグすると、2 つのページを並べて表示できます。",
      },
      {
        title: "組み合わせごとピン留め",
        text: "分割ビューをピン留めすれば、同じ 2 つのページを並べた状態で開き直せます。",
      },
      {
        title: "Chrome 155 以降",
        text: "Chrome の分割ビューを使うため、Chrome 155 以降で使えます。",
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
        title: "今いる Space がひと目で",
        text: "Space の色がサイドパネルに広がるので、どの Space にいるかがひと目でわかります。",
      },
      {
        title: "グラデーションも単色も",
        text: "プリセットから選ぶことも、好きな色を選ぶこともできます。色の強さやグレインも調整できます。",
      },
      {
        title: "ライト、ダーク、自動",
        text: "Space ごとに、システムの設定に合わせるか、ライトやダークに固定できます。Spotlight もそれに合わせます。",
      },
    ],
  },
  more: {
    title: "ほかにも",
    lead: "サイドバーを、じゃまにならない道具にするための機能です。",
    features: {
      liveFolders: {
        title: "ライブフォルダ",
        text: "Gmail の受信トレイやラベル、GitHub のレビュー依頼・プルリクエスト・Issue・メンションを一覧にするフォルダです。ログイン済みのアカウントをそのまま使います。",
      },
      archive: {
        title: "アーカイブ",
        text: "しばらく使っていない一時タブを閉じてアーカイブに残し、あとから開き直せます。",
      },
      shortcuts: {
        title: "キーボードショートカット",
        text: "サイドパネルや Spotlight を開いたり、表示中のページの URL や Markdown のリンクをコピーしたりできます。キーは Chrome のショートカット設定で割り当てます。",
      },
      data: {
        title: "書き出しと読み込み",
        text: "すべてをファイルに書き出して、いつでも読み込み直せます。",
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
    lead: "Arc のサイドバーのファイルから、Space とその色、ピン留め、フォルダ、分割ビュー、Favorites を取り込めます。",
    screenshotAlt:
      "Katip の設定の「データ」で、Arc から読み込む内容を確認している画面。Arc のプロファイルごとに読み込む Space、別々の Space にするか 1 つにまとめるか、追加するもの（4 個の Space、9 個のピン留めタブ、3 個のフォルダ、2 個の分割ビュー、3 個の Favorites）が並んでいます。",
    stepsTitle: "移行の手順",
    steps: {
      openSettings: [
        "Katip の設定を開き、",
        { strong: "「データ」→「Arc から読み込む」" },
        "を選びます。",
      ],
      chooseFile: [
        "Arc のサイドバーのファイル（",
        { code: "StorableSidebar.json" },
        "）を選びます。",
      ],
      import: ["読み込む内容を確かめて、読み込みます。"],
    },
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
    promises: [
      "追加するだけです。Katip に今あるものは、変更も削除もしません。",
      "ファイルはブラウザの中で読み、どこにも送りません。",
    ],
  },
  privacy: {
    eyebrow: "プライバシー",
    title: "データはブラウザの外に出ません",
    lead: "Katip はサーバーを持たず、データを集めません。Space、ピン、設定は、Chrome のストレージとブックマークに保存されます。",
    points: [
      {
        title: "サーバーもアカウントもなし",
        text: "登録は不要です。Katip は、開発者を含む誰にも何も送りません。",
      },
      {
        title: "トラッキングなし",
        text: "分析、テレメトリ、広告はなく、外部からコードを読み込むこともありません。",
      },
      {
        title: "ライブフォルダは許可したときだけ",
        text: "ライブフォルダは、そのサイトへのアクセスを許可したときにだけ、ログイン済みのセッションを使ってブラウザから Gmail や GitHub に直接つなぎます。",
      },
    ],
    policyLink: "プライバシーポリシーを読む",
  },
  openSource: {
    eyebrow: "オープンソース",
    title: "無料の、オープンソース",
    lead: "Katip のコードは、すべて MIT ライセンスで GitHub に公開しています。読むことも、Issue を送ることも、手を加えることもできます。名前とロゴはライセンスの対象外なので、手を加えたものには別の名前とアイコンを付けてください。",
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
