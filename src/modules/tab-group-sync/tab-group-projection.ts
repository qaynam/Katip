import { Schema } from "effect"
import { SpaceId } from "#modules/space"
import { TabGroupId, WindowId } from "#platform/browser"

export const ProjectedGroup = Schema.Struct({
  spaceId: SpaceId,
  windowId: WindowId,
  groupId: TabGroupId,
})
export type ProjectedGroup = typeof ProjectedGroup.Type

export const TabGroupProjection = Schema.Array(ProjectedGroup)
export type TabGroupProjection = typeof TabGroupProjection.Type
