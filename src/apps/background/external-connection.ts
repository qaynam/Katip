import { Context, Option } from "effect"
import type { PortSender } from "#platform/browser"

/**
 * 拡張の外（他の拡張機能や Web ページ）から接続されたとき、受け付けるかどうか。
 *
 * @remarks
 * 既定ではすべて断る。マニフェストに `externally_connectable` が無いと、Chrome はほかのどの
 * 拡張機能からの接続も通すので、断らなければタブの一覧やライブフォルダの中身を読まれ、
 * タブを操作されてしまう。
 */
export const AcceptsExternalConnection = Context.Reference<(sender: PortSender) => boolean>(
  "katip/background/AcceptsExternalConnection",
  { defaultValue: () => () => false },
)

/** localhost で動かす検証用ページからの接続か。開発ビルドでだけ受け付ける。 */
export const isLocalDevelopmentPage = (sender: PortSender): boolean =>
  Option.exists(
    sender.origin,
    (origin) => URL.canParse(origin) && new URL(origin).hostname === "localhost",
  )
