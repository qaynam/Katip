/**
 * ページの下中央に、短い知らせをしばらく出す。前の知らせが残っていれば置き換える。
 *
 * @remarks
 * ページのスクリプトから呼ぶほか、background から `chrome.scripting.executeScript` の `func` として
 * 注入する。注入する関数は文字列にして送られ、外の変数や import を参照できないので、使う値は
 * 定数も含めてすべてこの関数の中に書く。
 *
 * ページの CSS に崩されず、ページの要素の CSS も崩さないよう、Shadow DOM の中に描く。
 * 文字は `textContent` で入れ、HTML として解釈しない。
 */
export const showPageToast = (text: string, target: Document = document): void => {
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

  // ページのスクリプトと background の注入は別々に動くので、残っている知らせは DOM から探して消す
  target.querySelectorAll("katip-toast").forEach((previous) => previous.remove())

  const host = target.createElement("katip-toast")
  const root = host.attachShadow({ mode: "open" })
  const styleElement = target.createElement("style")
  styleElement.textContent = style
  const toast = target.createElement("div")
  toast.className = "toast"
  toast.setAttribute("role", "status")
  toast.textContent = text
  root.append(styleElement, toast)
  // body に transform が掛かったページでも、fixed の位置が画面を基準にするよう html の直下に置く
  target.documentElement.append(host)

  setTimeout(() => host.remove(), durationMs)
}
