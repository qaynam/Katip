import { Context, Option } from "effect"
import type { PortSender } from "#platform/browser"

/**
 * Whether to accept a connection from outside the extension (another extension or a web page).
 *
 * @remarks
 * Refuses all by default. Without `externally_connectable` in the manifest, Chrome lets any other
 * extension connect, and unless refused it could read the tab list and live folder contents, and
 * operate on tabs.
 */
export const AcceptsExternalConnection = Context.Reference<(sender: PortSender) => boolean>(
  "katip/background/AcceptsExternalConnection",
  { defaultValue: () => () => false },
)

/**
 * Whether the connection comes from the development page served on localhost. Only development
 * builds accept it.
 */
export const isLocalDevelopmentPage = (sender: PortSender): boolean =>
  Option.exists(
    sender.origin,
    (origin) => URL.canParse(origin) && new URL(origin).hostname === "localhost",
  )
