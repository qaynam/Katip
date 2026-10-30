import { Array, Option, pipe, Result, Schema } from "effect"
import { Space, SpaceColor, SpaceId, SpaceName } from "./space"

export const SpaceList = Schema.Array(Space)
export type SpaceList = typeof SpaceList.Type

export class SpaceNotFound extends Schema.TaggedError<SpaceNotFound>()("SpaceNotFound", {
  spaceId: SpaceId,
}) {}

export class LastSpaceRemoval extends Schema.TaggedError<LastSpaceRemoval>()("LastSpaceRemoval", {
  spaceId: SpaceId,
}) {}

const defaultName = (spaces: SpaceList): SpaceName => {
  const taken = new Set<string>(spaces.map((space) => space.name))
  const candidates = Array.makeBy(
    spaces.length + 1,
    (offset) => `スペース ${spaces.length + 1 + offset}`,
  )
  // 候補は既存の数より 1 つ多いので空きは必ずあり、フォールバックには到達しない
  return SpaceName.make(
    pipe(
      Array.findFirst(candidates, (name) => !taken.has(name)),
      Option.getOrElse(() => Array.headNonEmpty(candidates)),
    ),
  )
}

const defaultColor = (spaces: SpaceList): SpaceColor => {
  const palette = SpaceColor.literals
  const used = new Set(spaces.map((space) => space.color))
  return pipe(
    Array.findFirst(palette, (color) => !used.has(color)),
    Option.getOrElse(() => palette[spaces.length % palette.length] ?? "grey"),
  )
}

export const addSpace = (
  spaces: SpaceList,
  draft: { readonly id: SpaceId; readonly name?: SpaceName; readonly color?: SpaceColor },
): SpaceList => [
  ...spaces,
  {
    id: draft.id,
    name: draft.name ?? defaultName(spaces),
    color: draft.color ?? defaultColor(spaces),
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

export const recolorSpace = (spaces: SpaceList, id: SpaceId, color: SpaceColor) =>
  updateSpace(spaces, id, (space) => ({ ...space, color }))

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
