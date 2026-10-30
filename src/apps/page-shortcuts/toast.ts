const TOAST_DURATION_MS = 1_500

const STYLE = `
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
  animation: katip-toast ${TOAST_DURATION_MS}ms ease both;
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

const shown = new WeakMap<Document, { readonly host: Element; readonly timer: number }>()

/**
 * ページの下中央に、短い知らせをしばらく出す。前の知らせが残っていれば置き換える。
 *
 * @remarks
 * ページの CSS に崩されず、ページの要素の CSS も崩さないよう、Shadow DOM の中に描く。
 * 文字は `textContent` で入れ、HTML として解釈しない。
 */
export const showToast = (document: Document, text: string) => {
  const previous = shown.get(document)
  if (previous !== undefined) {
    clearTimeout(previous.timer)
    previous.host.remove()
  }

  const host = document.createElement("katip-toast")
  const root = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = STYLE
  const toast = document.createElement("div")
  toast.className = "toast"
  toast.setAttribute("role", "status")
  toast.textContent = text
  root.append(style, toast)
  // body に transform が掛かったページでも、fixed の位置が画面を基準にするよう html の直下に置く
  document.documentElement.append(host)

  const timer = window.setTimeout(() => {
    host.remove()
    shown.delete(document)
  }, TOAST_DURATION_MS)
  shown.set(document, { host, timer })
}
