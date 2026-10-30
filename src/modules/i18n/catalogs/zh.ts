import type { Catalog } from "../catalog"
import { common } from "./zh/common"
import { options } from "./zh/options"
import { actions } from "./zh/actions"
import { sidepanel } from "./zh/sidepanel"
import { spotlight } from "./zh/spotlight"
import { background } from "./zh/background"

export const zh: Catalog = {
  ...common,
  ...options,
  ...actions,
  ...sidepanel,
  ...spotlight,
  ...background,
}
