/** What a notice on a page says. */
export interface PageNotice {
  /** `Done` marks it with a check, `Alert` with an exclamation mark, `Opened` with an arrow out. */
  readonly tone: "Done" | "Alert" | "Opened"
  /** Cut short with an ellipsis when too long for one line. */
  readonly title: string
  /** What a click does. A notice with something to click stays longer, to leave time to reach it. */
  readonly action?: PageNoticeAction
}

export type PageNoticeAction =
  /** The notice is a button, which posts `message` on a port of `portName` to the extension. */
  | { readonly _tag: "Post"; readonly portName: string; readonly message: unknown }
  /**
   * The notice has a button named `label` that shares the page at `url` through the system's share
   * menu. Left out on a page where the browser can't share.
   */
  | { readonly _tag: "Share"; readonly label: string; readonly title: string; readonly url: string }

/**
 * Shows a notice that slides in at the top right of the page for a moment, replacing any notice
 * still on screen. Its text is shown as plain text, never parsed as HTML.
 *
 * @remarks
 * Injected into a tab as the `func` of `chrome.scripting.executeScript`. Chrome sends the function
 * as source text, so it cannot reach outer variables or imports: every value it uses, constants
 * included, is written inside it.
 *
 * Drawn inside a Shadow DOM so that the page's CSS and the notice's CSS cannot affect each other.
 */
export const showPageToast = (notice: PageNotice): void => {
  const { action } = notice
  // Not on a page that isn't served securely, nor in a browser without the share menu
  const canShare =
    action?._tag === "Share" &&
    typeof navigator.share === "function" &&
    (navigator.canShare?.({ title: action.title, url: action.url }) ?? true)
  const hasButton = action?._tag === "Post" || canShare
  const enterMs = 340
  const stayMs = hasButton ? 5_000 : 2_400
  const leaveMs = 260
  const style = `
:host {
  all: initial;
}

.notice {
  --background: rgb(250 250 252 / 0.74);
  --text: rgb(28 28 31 / 0.92);
  --muted: rgb(28 28 31 / 0.52);
  --border: rgb(0 0 0 / 0.1);
  --shadow: 0 14px 36px rgb(0 0 0 / 0.16), 0 2px 6px rgb(0 0 0 / 0.08);
  --badge: rgb(28 28 31 / 0.88);
  --badge-mark: rgb(255 255 255);
  --alert: #d0362c;

  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 11px;
  box-sizing: border-box;
  min-width: 220px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 11px 16px 11px 12px;
  border: 0.5px solid var(--border);
  border-radius: 14px;
  background: var(--background);
  box-shadow: var(--shadow);
  color: var(--text);
  font: 500 13px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans",
    "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif;
  letter-spacing: -0.003em;
  -webkit-font-smoothing: antialiased;
  pointer-events: none;
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  backdrop-filter: blur(28px) saturate(1.6);
  animation:
    katip-notice-in ${enterMs}ms cubic-bezier(0.2, 0.9, 0.25, 1) both,
    katip-notice-out ${leaveMs}ms cubic-bezier(0.4, 0, 1, 1) ${enterMs + stayMs}ms forwards;
}

@media (prefers-color-scheme: dark) {
  .notice {
    --background: rgb(34 34 40 / 0.7);
    --text: rgb(255 255 255 / 0.92);
    --muted: rgb(255 255 255 / 0.5);
    --border: rgb(255 255 255 / 0.12);
    --shadow: 0 16px 40px rgb(0 0 0 / 0.42), 0 2px 6px rgb(0 0 0 / 0.24);
    --badge: rgb(255 255 255 / 0.92);
    --badge-mark: rgb(28 28 31);
    --alert: #ff7a70;
  }
}

.badge {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--badge);
  color: var(--badge-mark);
}

.alert .badge {
  background: var(--alert);
  color: rgb(255 255 255);
}

button.notice {
  margin: 0;
  text-align: start;
  cursor: pointer;
  pointer-events: auto;
}

button.notice:hover {
  --background: rgb(250 250 252 / 0.9);
}

button.notice:focus-visible {
  outline: 2px solid var(--muted);
  outline-offset: 2px;
}

@media (prefers-color-scheme: dark) {
  button.notice:hover {
    --background: rgb(44 44 52 / 0.86);
  }
}

.go {
  flex: none;
  margin-inline-start: auto;
  color: var(--muted);
}

.share {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: -4px -6px -4px auto;
  padding: 0;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  pointer-events: auto;
}

.share svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.5;
}

.share:hover {
  background: rgb(0 0 0 / 0.06);
}

.share:focus-visible {
  outline: 2px solid var(--muted);
  outline-offset: 2px;
}

@media (prefers-color-scheme: dark) {
  .share:hover {
    background: rgb(255 255 255 / 0.1);
  }
}

svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.title {
  overflow: hidden;
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@keyframes katip-notice-in {
  from {
    opacity: 0;
    transform: translateX(calc(100% + 24px));
  }
}

@keyframes katip-notice-out {
  to {
    opacity: 0;
    transform: translateX(calc(100% + 24px));
  }
}

@keyframes katip-notice-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes katip-notice-fade-out {
  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice {
    animation:
      katip-notice-fade-in 160ms ease both,
      katip-notice-fade-out ${leaveMs}ms ease ${enterMs + stayMs}ms forwards;
  }
}
`

  const svgNamespace = "http://www.w3.org/2000/svg"
  const isAlert = notice.tone === "Alert"
  const iconOf = (strokes: ReadonlyArray<string>) => {
    const icon = document.createElementNS(svgNamespace, "svg")
    icon.setAttribute("viewBox", "0 0 16 16")
    icon.setAttribute("aria-hidden", "true")
    strokes.forEach((d) => {
      const stroke = document.createElementNS(svgNamespace, "path")
      stroke.setAttribute("d", d)
      icon.append(stroke)
    })
    return icon
  }

  // Each injection is a fresh copy of this function with no reference to the previous notice,
  // so the previous one is found in the DOM
  document.querySelectorAll("katip-toast").forEach((previous) => previous.remove())

  const host = document.createElement("katip-toast")
  const root = host.attachShadow({ mode: "open" })
  const styleElement = document.createElement("style")
  styleElement.textContent = style

  // Not markup through innerHTML: pages that enforce Trusted Types refuse it
  const badgeStrokes = {
    Done: ["M4.25 8.4l2.5 2.5 5-5.4"],
    Alert: ["M8 4.25v4.5", "M8 11.5v.25"],
    Opened: ["M5.25 10.75l5.5-5.5", "M6.25 5.25h4.5v4.5"],
  }[notice.tone]
  const badge = document.createElement("span")
  badge.className = "badge"
  badge.append(iconOf(badgeStrokes))

  const title = document.createElement("span")
  title.className = "title"
  title.textContent = notice.title

  const card = document.createElement(action?._tag === "Post" ? "button" : "div")
  card.className = isAlert ? "notice alert" : "notice"
  card.append(badge, title)
  if (action?._tag === "Post") {
    card.setAttribute("type", "button")
    const go = iconOf(["M6.5 4.5 10 8l-3.5 3.5"])
    go.setAttribute("class", "go")
    card.append(go)
    card.addEventListener("click", () => {
      chrome.runtime.connect({ name: action.portName }).postMessage(action.message)
      host.remove()
    })
  } else {
    card.setAttribute("role", isAlert ? "alert" : "status")
  }
  if (action?._tag === "Share" && canShare) {
    const share = document.createElement("button")
    share.className = "share"
    share.type = "button"
    share.setAttribute("aria-label", action.label)
    share.title = action.label
    share.append(
      iconOf(["M8 1.75v8", "M5.25 4.5 8 1.75l2.75 2.75", "M5.75 6.75h-2v7.5h8.5v-7.5h-2"]),
    )
    share.addEventListener("click", () => {
      // Closing the share menu without choosing anything rejects, which is nothing to report
      navigator.share({ title: action.title, url: action.url }).catch(() => undefined)
      host.remove()
    })
    card.append(share)
  }
  root.append(styleElement, card)
  // Not under body: a transform on body would make the fixed position relative to body
  document.documentElement.append(host)

  setTimeout(() => host.remove(), enterMs + stayMs + leaveMs)
}
