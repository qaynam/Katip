import type { Catalog } from "../catalog"
import { common } from "./ja/common"
import { options } from "./ja/options"
import { actions } from "./ja/actions"
import { sidepanel } from "./ja/sidepanel"
import { spotlight } from "./ja/spotlight"
import { background } from "./ja/background"
import { manifest } from "./ja/manifest"

export const ja: Catalog = {
  ...common,
  ...options,
  ...actions,
  ...sidepanel,
  ...spotlight,
  ...background,
  ...manifest,
}
