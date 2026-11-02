import { Schema } from "effect"
import { CopyRequest } from "#platform/clipboard"

const isCopyRequest = Schema.is(CopyRequest)

// Not navigator.clipboard: an offscreen document can't take focus, so it is refused. Only
// execCommand, which copies the selection, works here
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
