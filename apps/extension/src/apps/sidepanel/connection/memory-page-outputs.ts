import type { TabId } from "#platform/browser"
import type { MicrophoneAnswer, PageOutputAccess, PageOutputs } from "./page-outputs"

export interface MemoryPageOutputsOptions {
  /** Whether Katip may access the sites from the start. False by default. */
  readonly hasAccess?: boolean
  /** The outputs pages name once their site may use the microphone. */
  readonly outputs?: ReadonlyArray<string>
  /** Whether the site may use the microphone already. False by default. */
  readonly mayUseMicrophone?: boolean
  /** Whether the site is allowed the microphone when asked. True by default. */
  readonly allowsMicrophone?: boolean
  /** Whether Chrome remembers the site's microphone as blocked. False by default. */
  readonly blocksMicrophone?: boolean
  /** False for a page served over plain HTTP, which can't pick an output. True by default. */
  readonly isSecure?: boolean
}

export interface MemoryPageOutputs extends PageOutputAccess {
  /** The tabs whose page was asked for the microphone, in order. */
  readonly askedTabs: ReadonlyArray<TabId>
  /** The sites whose settings were opened, in order. */
  readonly openedSiteSettings: ReadonlyArray<string>
}

/**
 * Pages that know the given outputs, for tests and the dev harness. Access to the sites is granted
 * through the origin access, as it is in Chrome, so listing assumes it.
 */
export const createMemoryPageOutputs = (
  options: MemoryPageOutputsOptions = {},
): MemoryPageOutputs => {
  let mayUseMicrophone = options.mayUseMicrophone ?? false
  const askedTabs: Array<TabId> = []
  const openedSiteSettings: Array<string> = []
  return {
    askedTabs,
    openedSiteSettings,
    openSiteSettings: (site) => {
      openedSiteSettings.push(site)
    },
    hasAccess: async () => options.hasAccess ?? false,
    list: async (): Promise<PageOutputs> => {
      if (options.isSecure === false) return { _tag: "Unreachable" }
      return mayUseMicrophone
        ? { _tag: "Listed", outputs: options.outputs ?? [] }
        : { _tag: "NeedsMicrophone" }
    },
    askForMicrophone: async (tabId): Promise<MicrophoneAnswer> => {
      askedTabs.push(tabId)
      if (options.blocksMicrophone === true) return "Blocked"
      mayUseMicrophone = options.allowsMicrophone ?? true
      return mayUseMicrophone ? "Allowed" : "Refused"
    },
  }
}
