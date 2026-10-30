import type { GitHubQuery, LiveSort, LiveSource } from "#modules/live-folders"

type LiveSourceKind = LiveSource["_tag"]

const sourceNames: Record<LiveSourceKind, string> = { Gmail: "Gmail", GitHub: "GitHub" }

export const messages = {
  common: {
    cancel: "キャンセル",
    rename: "名前を変更",
    delete: "削除",
  },
  spotlight: {
    button: "検索",
    shortcut: "Alt+T",
  },
  split: {
    unsupported: "このブラウザは分割ビューに対応していません（Chrome 155 以降で使えます）",
  },
  liveFolder: {
    addMenu: "ライブフォルダを追加",
    sourceNames,
    gitHubQueries: {
      "review-requested": "レビュー依頼",
      "authored-pull-requests": "自分の PR",
      "assigned-issues": "担当の Issue",
      mentioned: "メンション",
    } satisfies Record<GitHubQuery, string>,
    menuLabel: "ライブフォルダのメニュー",
    titleLabel: "ライブフォルダの名前",
    untitled: "名前のないライブフォルダ",
    refreshNow: "今すぐ更新",
    markAllSeen: "すべて既読にする",
    remove: "ライブフォルダを削除",
    removeTitle: "ライブフォルダを削除しますか？",
    removeMessage: (title: string) =>
      `「${title}」を削除します。取得元のメールや Issue はそのまま残ります。`,
    unseenCount: (count: number) => `未読 ${count} 件`,
    unseen: "未読",
    refreshing: "更新中",
    failed: "更新に失敗しました",
    grantAccess: "アクセスを許可",
    signIn: "ログインする",
    setToken: "トークンを設定",
    retry: "再試行",
    accessDenied: (kind: LiveSourceKind) =>
      `${sourceNames[kind]} へのアクセスが許可されなかったため、更新できません`,
    empty: "新しい項目はありません",
    loading: "読み込んでいます…",
    sortMenu: "並べ替え",
    sorts: {
      newest: "新しい順",
      oldest: "古い順",
      title: "タイトル順",
    } satisfies Record<Exclude<LiveSort, "source">, string>,
    /** "source" の並べ方。まとめる単位（差出人・リポジトリ）が取得元で違うので、呼び名も分ける */
    sortsBySource: { Gmail: "差出人順", GitHub: "リポジトリ順" } satisfies Record<
      LiveSourceKind,
      string
    >,
  },
  liveFolderDialog: {
    gmailTitle: "Gmail のライブフォルダ",
    gmailDescription: "未読のメールを並べます。",
    accountIndex: "アカウント番号",
    accountIndexHint:
      "mail.google.com/mail/u/番号/ の番号です。最初にログインしたアカウントが 0 になります。",
    label: "ラベル",
    labelPlaceholder: "受信トレイ",
    labelHint: "空のままなら受信トレイを並べます。",
    gitHubTitle: "GitHub のライブフォルダ",
    gitHubDescription: "ブラウザで GitHub にログインしていれば使えます。",
    queryLegend: "並べる項目",
    tokenTitle: "GitHub のトークンを設定",
    token: "アクセストークン",
    tokenHowTo:
      "github.com で Personal access token (classic) を発行して貼り付けてください。非公開のリポジトリも並べるなら repo にチェックを入れます。トークンは GitHub への問い合わせにだけ使います。",
    tokenLink: "github.com でトークンを発行する",
    create: "作成",
    save: "保存",
    accessDenied: (kind: LiveSourceKind) =>
      `${sourceNames[kind]} へのアクセスが許可されなかったため、作成しませんでした。もう一度押すと、改めて許可を求めます。`,
    errors: {
      InvalidAccountIndex: "アカウント番号は 0 以上の整数で入力してください",
      TokenRequired: "トークンを入力してください",
      TokenHasWhitespace: "トークンに空白は含められません",
    },
  },
  folderSearch: {
    open: "フォルダ内を検索",
    placeholder: "フォルダ内を検索…",
    results: "検索結果",
    noMatch: "一致する項目はありません",
    empty: "このフォルダは空です",
  },
} as const
