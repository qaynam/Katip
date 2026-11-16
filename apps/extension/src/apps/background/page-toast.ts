/** What a notice on a page says. */
export interface PageNotice {
  /** `Done` marks it with a check, `Alert` with an exclamation mark. */
  readonly tone: "Done" | "Alert"
  readonly title: string
  /** Shown muted on one line under the title, cut short with an ellipsis when too long. */
  readonly detail?: string
}

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
  const enterMs = 340
  const stayMs = 2_400
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

svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.text {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.title,
.detail {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  font-weight: 600;
}

.detail {
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
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
  const textElement = (className: string, text: string) => {
    const element = document.createElement("span")
    element.className = className
    element.textContent = text
    return element
  }

  // Each injection is a fresh copy of this function with no reference to the previous notice,
  // so the previous one is found in the DOM
  document.querySelectorAll("katip-toast").forEach((previous) => previous.remove())

  const host = document.createElement("katip-toast")
  const root = host.attachShadow({ mode: "open" })
  const styleElement = document.createElement("style")
  styleElement.textContent = style

  // Not markup through innerHTML: pages that enforce Trusted Types refuse it
  const icon = document.createElementNS(svgNamespace, "svg")
  icon.setAttribute("viewBox", "0 0 16 16")
  icon.setAttribute("aria-hidden", "true")
  const strokes = isAlert ? ["M8 4.25v4.5", "M8 11.5v.25"] : ["M4.25 8.4l2.5 2.5 5-5.4"]
  strokes.forEach((d) => {
    const stroke = document.createElementNS(svgNamespace, "path")
    stroke.setAttribute("d", d)
    icon.append(stroke)
  })
  const badge = document.createElement("span")
  badge.className = "badge"
  badge.append(icon)

  const text = document.createElement("span")
  text.className = "text"
  text.append(textElement("title", notice.title))
  if (notice.detail !== undefined) text.append(textElement("detail", notice.detail))

  const card = document.createElement("div")
  card.className = isAlert ? "notice alert" : "notice"
  card.setAttribute("role", isAlert ? "alert" : "status")
  card.append(badge, text)
  root.append(styleElement, card)
  // Not under body: a transform on body would make the fixed position relative to body
  document.documentElement.append(host)

  setTimeout(() => host.remove(), enterMs + stayMs + leaveMs)
}
