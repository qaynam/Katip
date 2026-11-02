/**
 * Shows a short notice at the bottom center of the page for a moment, replacing any notice still
 * on screen. `text` is shown as plain text, never parsed as HTML.
 *
 * @remarks
 * Injected into a tab as the `func` of `chrome.scripting.executeScript`. Chrome sends the function
 * as source text, so it cannot reach outer variables or imports: every value it uses, constants
 * included, is written inside it.
 *
 * Drawn inside a Shadow DOM so that the page's CSS and the notice's CSS cannot affect each other.
 */
export const showPageToast = (text: string): void => {
  const durationMs = 1_500
  const style = `
:host {
  all: initial;
}

.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  z-index: 2147483647;
  box-sizing: border-box;
  max-width: min(420px, calc(100vw - 32px));
  padding: 9px 14px;
  overflow: hidden;
  border-radius: 10px;
  background: rgb(30 30 34 / 0.86);
  box-shadow:
    0 10px 28px rgb(0 0 0 / 0.22),
    inset 0 0 0 0.5px rgb(255 255 255 / 0.12);
  color: rgb(255 255 255 / 0.94);
  font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans",
    "Segoe UI", "Noto Sans JP", system-ui, sans-serif;
  letter-spacing: -0.003em;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
  translate: -50% 0;
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  backdrop-filter: blur(20px) saturate(1.6);
  animation: katip-toast ${durationMs}ms ease both;
}

@keyframes katip-toast {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  12%,
  82% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
  }
}
`

  // Each injection is a fresh copy of this function with no reference to the previous notice,
  // so the previous one is found in the DOM
  document.querySelectorAll("katip-toast").forEach((previous) => previous.remove())

  const host = document.createElement("katip-toast")
  const root = host.attachShadow({ mode: "open" })
  const styleElement = document.createElement("style")
  styleElement.textContent = style
  const toast = document.createElement("div")
  toast.className = "toast"
  toast.setAttribute("role", "status")
  toast.textContent = text
  root.append(styleElement, toast)
  // Not under body: a transform on body would make the fixed position relative to body
  document.documentElement.append(host)

  setTimeout(() => host.remove(), durationMs)
}
