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
  { id: home, name: "ホーム" },
  { id: work, name: "仕事" },
  { id: hobby, name: "趣味" },
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

const ja = makeTranslator("ja")
const en = makeTranslator("en")

const titlesIn = (actionContext: ActionContext, translator = ja) =>
  availableActions(actionContext).map((action) => actionTitle(action, actionContext, translator))

describe("実行できる操作", () => {
  it("アクティブなタブが Space にあれば、すべての操作を決まった順に並べる", () => {
    expect(titlesIn(context())).toStrictEqual([
      "URL をコピー",
      "URL を Markdown のリンクとしてコピー",
      "タブをピン留め",
      "タブを複製",
      "タブを閉じる",
      "タブをミュート",
      "タブを「仕事」へ移動",
      "タブを「趣味」へ移動",
      "一時タブをすべて閉じる",
      "設定を開く",
    ])
  })

  it("Space の移動は、タブが今いる Space 以外の Space の分だけ並ぶ", () => {
    const moves = availableActions(context({ activeTab: Option.some(tabIn(work)) })).filter(
      (action): action is Extract<Action, { _tag: "MoveTabToSpace" }> =>
        action._tag === "MoveTabToSpace",
    )

    expect(moves.map((action) => action.spaceId)).toStrictEqual([home, hobby])
  })

  it("アクティブなタブが無ければ、タブを対象にする操作は並べない", () => {
    expect(titlesIn(context({ activeTab: Option.none() }))).toStrictEqual([
      "一時タブをすべて閉じる",
      "設定を開く",
    ])
  })

  it("どの Space にも属さないタブには、ピン留めと Space の移動を並べない", () => {
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

  it("表示している Space が決まっていなければ、一時タブを閉じる操作は並べない", () => {
    const tags = availableActions(context({ activeSpaceId: Option.none() })).map(({ _tag }) => _tag)

    expect(tags).not.toContain("CloseTemporaryTabs")
  })
})

describe("操作の名前", () => {
  it("ピン留めしたタブでは、ピン留めを外す名前になる", () => {
    const pinned = context({ activeTab: Option.some(tabIn(home, { isPinned: true })) })

    expect(actionTitle({ _tag: "TogglePin" }, pinned, ja)).toBe("タブのピン留めを外す")
  })

  it("ミュートしているタブでは、ミュートを解除する名前になる", () => {
    const muted = context({ activeTab: Option.some(tabIn(home, { isMuted: true })) })

    expect(actionTitle({ _tag: "ToggleMute" }, muted, ja)).toBe("タブのミュートを解除")
  })

  it("表示する言語で名前を付ける", () => {
    expect(actionTitle({ _tag: "MoveTabToSpace", spaceId: work }, context(), en)).toBe(
      "Move Tab to 仕事",
    )
  })
})
