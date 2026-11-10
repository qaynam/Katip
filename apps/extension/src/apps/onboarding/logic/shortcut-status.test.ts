import { describe, expect, it } from "vitest"
import { shortcutStatusOf } from "./shortcut-status"

const assigned = new Map([["_execute_action", "⌃⌘S"]])
const suggested = new Map([
  ["_execute_action", "⌃⌘S"],
  ["copy-current-url-as-markdown", "⌃⇧M"],
])

describe("the status of a command's shortcut", () => {
  it("is the key Chrome assigned, when it assigned one", () => {
    expect(shortcutStatusOf("_execute_action", assigned, suggested)).toStrictEqual({
      _tag: "Assigned",
      key: "⌃⌘S",
    })
  })

  it("is refused when Katip suggests a key Chrome didn't assign", () => {
    expect(shortcutStatusOf("copy-current-url-as-markdown", assigned, suggested)).toStrictEqual({
      _tag: "Refused",
      suggested: "⌃⇧M",
    })
  })

  it("is not set when Katip suggests no key and none is assigned", () => {
    expect(shortcutStatusOf("quick-pin-toggle", assigned, suggested)).toStrictEqual({
      _tag: "NotSet",
    })
  })
})
