import { Schema } from "effect"
import { CopyRequest } from "#platform/clipboard"

const isCopyRequest = Schema.is(CopyRequest)

// offscreen ドキュメントはフォーカスを持てないため navigator.clipboard は拒否される。
// 選択範囲をコピーする execCommand だけがここで使える
const copy = (text: string) => {
  const field = document.createElement("textarea")
  field.value = text
  document.body.append(field)
  field.select()
  const copied = document.execCommand("copy")
  field.remove()
  return copied
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isCopyRequest(message)) return undefined
  sendResponse({ copied: copy(message.text) })
  return undefined
})
