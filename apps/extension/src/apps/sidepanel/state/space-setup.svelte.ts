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

// Renaming or editing the theme can only start once the Space is shown in the sidebar.
// Since either the switch/create outcome or the view may arrive first, the request is kept
// here and handed over when the target Space appears
export class PendingSpaceSetup {
  #request = $state.raw<SetupRequest | null>(null)

  requestFor(spaceId: SpaceId, steps: SpaceSetupSteps) {
    this.#request = { target: { _tag: "Space", spaceId }, steps }
  }

  /** The first Space shown that isn't in knownSpaceIds is taken to be the newly created one. */
  requestForNextCreated(knownSpaceIds: ReadonlySet<SpaceId>, steps: SpaceSetupSteps) {
    this.#request = { target: { _tag: "NextCreated", knownSpaceIds }, steps }
  }

  cancel() {
    this.#request = null
  }

  /** Takes and clears the request if it targets the Space on screen. */
  consume(activeSpaceId: SpaceId): Option.Option<SpaceSetupSteps> {
    const request = this.#request
    if (request === null || !isTargeted(request.target, activeSpaceId)) return Option.none()
    this.#request = null
    return Option.some(request.steps)
  }
}
