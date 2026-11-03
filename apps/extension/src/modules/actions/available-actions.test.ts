import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { makeTranslator } from "#modules/i18n"
import { SpaceId } from "#modules/space"
import type { Action } from "./action"
import {
  actionTitle,
  availableActions,
  type ActionContext,
  type ActionTarget,
} from "./available-actions"

const home = SpaceId.make("home")
const work = SpaceId.make("work")
const hobby = SpaceId.make("hobby")

const spaces = [
  { id: home, name: "Home" },
  { id: work, name: "Work" },
  { id: hobby, name: "Hobbies" },
]

const tabIn = (
  spaceId: SpaceId,
  state: { readonly isPinned?: boolean; readonly isMuted?: boolean } = {},
): ActionTarget => ({
  isMuted: state.isMuted ?? false,
  membership: Option.some({ spaceId, isPinned: state.isPinned ?? false }),
})

const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  activeTab: Option.some(tabIn(home)),
  activeSpaceId: Option.some(home),
  spaces,
  ...overrides,
})

const en = makeTranslator("en")

const titlesIn = (actionContext: ActionContext, translator = en) =>
  availableActions(actionContext).map((action) => actionTitle(action, actionContext, translator))

describe("available actions", () => {
  it("when the active tab is in a Space, lists every action in a fixed order", () => {
    expect(titlesIn(context())).toStrictEqual([
      "Copy URL",
      "Copy URL as Markdown Link",
      "Pin Tab",
      "Duplicate Tab",
      "Close Tab",
      "Mute Tab",
      "Move Tab to Work",
      "Move Tab to Hobbies",
      "Close All Temporary Tabs",
      "Open Settings",
    ])
  })

  it("lists a move for each Space other than the one the tab is in", () => {
    const moves = availableActions(context({ activeTab: Option.some(tabIn(work)) })).filter(
      (action): action is Extract<Action, { _tag: "MoveTabToSpace" }> =>
        action._tag === "MoveTabToSpace",
    )

    expect(moves.map((action) => action.spaceId)).toStrictEqual([home, hobby])
  })

  it("without an active tab, leaves out the actions on a tab", () => {
    expect(titlesIn(context({ activeTab: Option.none() }))).toStrictEqual([
      "Close All Temporary Tabs",
      "Open Settings",
    ])
  })

  it("for a tab outside every Space, leaves out pinning and moving to a Space", () => {
    const favorite: ActionTarget = { isMuted: false, membership: Option.none() }

    expect(
      availableActions(context({ activeTab: Option.some(favorite) })).map(({ _tag }) => _tag),
    ).toStrictEqual([
      "CopyUrl",
      "CopyMarkdownLink",
      "DuplicateTab",
      "CloseTab",
      "ToggleMute",
      "CloseTemporaryTabs",
      "OpenSettings",
    ])
  })

  it("without a shown Space, leaves out closing the temporary tabs", () => {
    const tags = availableActions(context({ activeSpaceId: Option.none() })).map(({ _tag }) => _tag)

    expect(tags).not.toContain("CloseTemporaryTabs")
  })
})

describe("action names", () => {
  it("for a pinned tab, names the action for unpinning", () => {
    const pinned = context({ activeTab: Option.some(tabIn(home, { isPinned: true })) })

    expect(actionTitle({ _tag: "TogglePin" }, pinned, en)).toBe("Unpin Tab")
  })

  it("for a muted tab, names the action for unmuting", () => {
    const muted = context({ activeTab: Option.some(tabIn(home, { isMuted: true })) })

    expect(actionTitle({ _tag: "ToggleMute" }, muted, en)).toBe("Unmute Tab")
  })

  it("names the action in the translator's language", () => {
    expect(
      actionTitle({ _tag: "MoveTabToSpace", spaceId: work }, context(), makeTranslator("es")),
    ).toBe("Mover pestaña a Work")
  })
})
