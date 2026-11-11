import { Array, Match, Option } from "effect"
import type { Translator } from "#modules/i18n"
import type { SpaceId } from "#modules/space"
import type { Action } from "./action"

export interface ActionTarget {
  readonly isMuted: boolean
  /**
   * Whether the tab is shown side by side with another. `Unavailable` when it can't be: the browser
   * has no split view, or the tab is a Favorite, which Chrome never splits.
   */
  readonly split: "Unavailable" | "Unsplit" | "Split"
  /**
   * The Space the tab belongs to and whether it is pinned there. None for a tab outside every
   * Space, such as a Favorite.
   */
  readonly membership: Option.Option<{ readonly spaceId: SpaceId; readonly isPinned: boolean }>
}

export interface ActionContext {
  /** The active tab of the window the action runs in. */
  readonly activeTab: Option.Option<ActionTarget>
  /** The Space shown in the window the action runs in. */
  readonly activeSpaceId: Option.Option<SpaceId>
  /** The Spaces, in the order their actions are listed. */
  readonly spaces: ReadonlyArray<{ readonly id: SpaceId; readonly name: string }>
}

const splitActions: Readonly<Record<ActionTarget["split"], ReadonlyArray<Action>>> = {
  Unavailable: [],
  Unsplit: [{ _tag: "SplitWithNewTab" }],
  Split: [{ _tag: "Unsplit" }],
}

const tabActions = (target: ActionTarget, context: ActionContext): ReadonlyArray<Action> => {
  const spaceId = Option.map(target.membership, (membership) => membership.spaceId)
  return [
    { _tag: "CopyUrl" },
    { _tag: "CopyMarkdownLink" },
    ...(Option.isSome(spaceId) ? [{ _tag: "TogglePin" } as const] : []),
    { _tag: "DuplicateTab" },
    ...splitActions[target.split],
    { _tag: "CloseTab" },
    { _tag: "ToggleMute" },
    ...(Option.isSome(spaceId)
      ? context.spaces
          .filter((space) => space.id !== spaceId.value)
          .map((space): Action => ({ _tag: "MoveTabToSpace", spaceId: space.id }))
      : []),
  ]
}

/**
 * Returns the actions available for the current window and tab, in a fixed order.
 *
 * Without an active tab, actions on a tab are left out. For a tab outside every Space (such as a
 * Favorite), pinning and moving to another Space are left out.
 */
export const availableActions = (context: ActionContext): ReadonlyArray<Action> => [
  ...Option.match(context.activeTab, {
    onNone: () => [],
    onSome: (target) => tabActions(target, context),
  }),
  ...(Option.isSome(context.activeSpaceId) ? [{ _tag: "CloseTemporaryTabs" } as const] : []),
  { _tag: "OpenSettings" },
]

const isPinned = (context: ActionContext) =>
  Option.exists(
    Option.flatMap(context.activeTab, (target) => target.membership),
    (membership) => membership.isPinned,
  )

const isMuted = (context: ActionContext) =>
  Option.exists(context.activeTab, (target) => target.isMuted)

/**
 * The action's name. Pinning and muting are named for the change from the tab's current state.
 */
export const actionTitle = (
  action: Action,
  context: ActionContext,
  translator: Translator,
): string =>
  Match.valueTags(action, {
    CopyUrl: () => translator.t("actions.copyUrl"),
    CopyMarkdownLink: () => translator.t("actions.copyMarkdownLink"),
    TogglePin: () => translator.t(isPinned(context) ? "actions.unpinTab" : "actions.pinTab"),
    DuplicateTab: () => translator.t("actions.duplicateTab"),
    SplitWithNewTab: () => translator.t("actions.splitWithNewTab"),
    Unsplit: () => translator.t("actions.unsplit"),
    CloseTab: () => translator.t("actions.closeTab"),
    ToggleMute: () => translator.t(isMuted(context) ? "actions.unmuteTab" : "actions.muteTab"),
    MoveTabToSpace: ({ spaceId }) =>
      translator.t("actions.moveTabToSpace", {
        space: Option.getOrElse(
          Option.map(
            Array.findFirst(context.spaces, (space) => space.id === spaceId),
            (space) => space.name,
          ),
          () => "",
        ),
      }),
    CloseTemporaryTabs: () => translator.t("actions.closeTemporaryTabs"),
    OpenSettings: () => translator.t("actions.openSettings"),
  })
