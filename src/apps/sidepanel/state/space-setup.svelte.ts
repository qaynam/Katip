import { Option } from "effect"
import type { SpaceId } from "#modules/space"

export interface SpaceSetupSteps {
  readonly rename: boolean
  readonly editTheme: boolean
}

type SetupTarget =
  | { readonly _tag: "Space"; readonly spaceId: SpaceId }
  | { readonly _tag: "NextCreated"; readonly knownSpaceIds: ReadonlySet<SpaceId> }

interface SetupRequest {
  readonly target: SetupTarget
  readonly steps: SpaceSetupSteps
}

const isTargeted = (target: SetupTarget, activeSpaceId: SpaceId) =>
  target._tag === "Space"
    ? target.spaceId === activeSpaceId
    : !target.knownSpaceIds.has(activeSpaceId)

// 名前やテーマの編集は、その Space がサイドバーに表示されてからでないと始められない。
// 切り替えや作成のコマンドの結果とビューのどちらが先に届くかは決まっていないため、
// 依頼を覚えておき、対象の Space が表示された時点で受け取らせる
export class PendingSpaceSetup {
  #request = $state.raw<SetupRequest | null>(null)

  requestFor(spaceId: SpaceId, steps: SpaceSetupSteps) {
    this.#request = { target: { _tag: "Space", spaceId }, steps }
  }

  /** knownSpaceIds に無い Space が表示されたら、それを新しく作られた Space とみなす */
  requestForNextCreated(knownSpaceIds: ReadonlySet<SpaceId>, steps: SpaceSetupSteps) {
    this.#request = { target: { _tag: "NextCreated", knownSpaceIds }, steps }
  }

  cancel() {
    this.#request = null
  }

  /** 表示中の Space 宛ての依頼なら受け取って消す */
  consume(activeSpaceId: SpaceId): Option.Option<SpaceSetupSteps> {
    const request = this.#request
    if (request === null || !isTargeted(request.target, activeSpaceId)) return Option.none()
    this.#request = null
    return Option.some(request.steps)
  }
}
