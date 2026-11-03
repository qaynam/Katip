import { Array, Option, pipe, Result, Schema } from "effect"
import { groupColorOf, presetPages, themeOf, type SpaceTheme } from "#modules/theme"
import { Space, SpaceId, SpaceName } from "./space"

export const SpaceList = Schema.Array(Space)
export type SpaceList = typeof SpaceList.Type

export class SpaceNotFound extends Schema.TaggedError<SpaceNotFound>()("SpaceNotFound", {
  spaceId: SpaceId,
}) {}

export class LastSpaceRemoval extends Schema.TaggedError<LastSpaceRemoval>()("LastSpaceRemoval", {
  spaceId: SpaceId,
}) {}

/** Names a Space created without a name after a number. Numbers start at 1. */
export type NumberedSpaceName = (number: number) => string

// Given more candidates than there are Spaces, one is always free and the fallback is never reached
const firstFreeName = (
  spaces: SpaceList,
  candidates: Array.NonEmptyReadonlyArray<SpaceName>,
): SpaceName => {
  const taken = new Set<string>(spaces.map((space) => space.name))
  return pipe(
    Array.findFirst(candidates, (name) => !taken.has(name)),
    Option.getOrElse(() => Array.headNonEmpty(candidates)),
  )
}

/**
 * A numbered name no existing Space has. The search starts at the number after the count of Spaces.
 */
export const nextSpaceName = (spaces: SpaceList, numbered: NumberedSpaceName): SpaceName =>
  firstFreeName(
    spaces,
    Array.makeBy(spaces.length + 1, (offset) =>
      SpaceName.make(numbered(spaces.length + 1 + offset)),
    ),
  )

/**
 * `name` when no existing Space has it, else `name` followed by the lowest number from 2 that makes
 * a name no Space has, such as `Arc 2`.
 */
export const unusedSpaceName = (spaces: SpaceList, name: SpaceName): SpaceName =>
  firstFreeName(spaces, [
    name,
    // A number after a name reads the same in every language Katip speaks, so this isn't translated
    ...Array.makeBy(spaces.length, (offset) => SpaceName.make(`${name} ${offset + 2}`)),
  ])

// The first preset on the first page is neutral, so it isn't one of the themes handed out
// automatically
const colorfulPresets = (presetPages[0] ?? []).slice(1).map(themeOf)

const defaultTheme = (spaces: SpaceList): SpaceTheme => {
  const used = new Set(spaces.map((space) => groupColorOf(space.theme)))
  return pipe(
    Array.findFirst(colorfulPresets, (theme) => !used.has(groupColorOf(theme))),
    Option.orElse(() => Array.get(colorfulPresets, spaces.length % colorfulPresets.length)),
    Option.getOrElse(() => themeOf([])),
  )
}

export const addSpace = (
  spaces: SpaceList,
  draft: { readonly id: SpaceId; readonly name: SpaceName; readonly theme?: SpaceTheme },
): SpaceList => [
  ...spaces,
  {
    id: draft.id,
    name: draft.name,
    theme: draft.theme ?? defaultTheme(spaces),
  },
]

const updateSpace = (
  spaces: SpaceList,
  id: SpaceId,
  update: (space: Space) => Space,
): Result.Result<SpaceList, SpaceNotFound> =>
  spaces.some((space) => space.id === id)
    ? Result.succeed(spaces.map((space) => (space.id === id ? update(space) : space)))
    : Result.fail(new SpaceNotFound({ spaceId: id }))

export const renameSpace = (spaces: SpaceList, id: SpaceId, name: SpaceName) =>
  updateSpace(spaces, id, (space) => ({ ...space, name }))

export const setSpaceTheme = (spaces: SpaceList, id: SpaceId, theme: SpaceTheme) =>
  updateSpace(spaces, id, (space) => ({ ...space, theme }))

export const removeSpace = (
  spaces: SpaceList,
  id: SpaceId,
): Result.Result<SpaceList, SpaceNotFound | LastSpaceRemoval> => {
  if (!spaces.some((space) => space.id === id)) {
    return Result.fail(new SpaceNotFound({ spaceId: id }))
  }
  if (spaces.length === 1) {
    return Result.fail(new LastSpaceRemoval({ spaceId: id }))
  }
  return Result.succeed(spaces.filter((space) => space.id !== id))
}

export const moveSpace = (
  spaces: SpaceList,
  id: SpaceId,
  toIndex: number,
): Result.Result<SpaceList, SpaceNotFound> =>
  pipe(
    Array.findFirst(spaces, (space) => space.id === id),
    Option.match({
      onNone: () => Result.fail(new SpaceNotFound({ spaceId: id })),
      onSome: (moving) => {
        const rest = spaces.filter((space) => space.id !== id)
        const clamped = Math.min(Math.max(toIndex, 0), rest.length)
        return Result.succeed([...rest.slice(0, clamped), moving, ...rest.slice(clamped)])
      },
    }),
  )
