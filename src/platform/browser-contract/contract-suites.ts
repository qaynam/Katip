import { bookmarkSuite } from "./bookmark-scenarios"
import type { ContractSuite } from "./scenario"
import { splitViewSuite } from "./split-view-scenarios"
import { tabGroupSuite } from "./tab-group-scenarios"
import {
  tabCreateSuite,
  tabPinSuite,
  tabRemoveSuite,
  tabUpdateSuite,
  windowCloseSuite,
} from "./tab-lifecycle-scenarios"
import { tabMoveSuite } from "./tab-move-scenarios"

export const contractSuites: ReadonlyArray<ContractSuite> = [
  tabCreateSuite,
  tabMoveSuite,
  tabRemoveSuite,
  windowCloseSuite,
  tabPinSuite,
  tabUpdateSuite,
  tabGroupSuite,
  splitViewSuite,
  bookmarkSuite,
]
