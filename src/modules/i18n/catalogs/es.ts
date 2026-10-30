import type { Catalog } from "../catalog"
import { common } from "./es/common"
import { options } from "./es/options"
import { actions } from "./es/actions"
import { sidepanel } from "./es/sidepanel"
import { spotlight } from "./es/spotlight"
import { background } from "./es/background"

export const es: Catalog = {
  ...common,
  ...options,
  ...actions,
  ...sidepanel,
  ...spotlight,
  ...background,
}
