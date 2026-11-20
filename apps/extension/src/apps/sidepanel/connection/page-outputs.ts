import type { TabId } from "#platform/browser"

/**
 * The outputs the page in a tab can be sent to, by name.
 *
 * - `NeedsMicrophone`: none named yet. Chrome tells a site the names of the outputs only once it
 *   may use the microphone.
 * - `Unreachable`: Katip can't reach the page, or the page can't pick an output, as a page served
 *   over plain HTTP can't.
 */
export type PageOutputs =
  | { readonly _tag: "Listed"; readonly outputs: ReadonlyArray<string> }
  | { readonly _tag: "NeedsMicrophone" }
  | { readonly _tag: "Unreachable" }

/**
 * How asking for the microphone went. `Blocked` when Chrome remembers the site was blocked: it
 * then refuses without asking, until the site's settings allow the microphone again.
 */
export type MicrophoneAnswer = "Allowed" | "Refused" | "Blocked"

/** What a tab's page knows of the outputs. Tests and the dev harness swap in a fake. */
export interface PageOutputAccess {
  /** Whether Katip may access the pages at `originPattern`, like `https://example.com/*`. */
  readonly hasAccess: (originPattern: string) => Promise<boolean>
  readonly list: (tabId: TabId) => Promise<PageOutputs>
  /**
   * Asks for the page's site to use the microphone, which makes Chrome name the outputs to it.
   * Chrome asks on the page itself, so bring the tab to the front first. Never rejects.
   */
  readonly askForMicrophone: (tabId: TabId) => Promise<MicrophoneAnswer>
  /** Opens the browser's settings of `site`, where its microphone can be allowed again. */
  readonly openSiteSettings: (site: string) => void
}

/**
 * Lists the outputs as the page knows them.
 *
 * @remarks
 * Injected into the tab as the `func` of `chrome.scripting.executeScript`. Chrome sends the function
 * as source text, so it cannot reach outer variables or imports: every value it uses is written
 * inside it.
 */
const listOutputsInPage = async (): Promise<PageOutputs> => {
  if (navigator.mediaDevices === undefined) return { _tag: "Unreachable" }
  // The default and communication outputs follow the system's choice rather than name an output
  const systemChosen = ["", "default", "communications"]
  const outputs = (await navigator.mediaDevices.enumerateDevices())
    .filter(
      (device) =>
        device.kind === "audiooutput" &&
        !systemChosen.includes(device.deviceId) &&
        device.label !== "",
    )
    .map((device) => device.label)
  return outputs.length === 0 ? { _tag: "NeedsMicrophone" } : { _tag: "Listed", outputs }
}

/**
 * Asks to use the microphone and lets go of it at once: only the permission is wanted, which names
 * the outputs to the site.
 *
 * @remarks
 * Injected like {@link listOutputsInPage}, so everything it uses is written inside it.
 */
const askForMicrophoneInPage = async (): Promise<MicrophoneAnswer> => {
  const isBlocked = async () => {
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName })
      return status.state === "denied"
    } catch {
      return false
    }
  }
  if (await isBlocked()) return "Blocked"
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    return "Allowed"
  } catch {
    // Blocked from the question just answered, which Chrome won't ask again
    return (await isBlocked()) ? "Blocked" : "Refused"
  }
}

const runInPage = async <A>(tabId: TabId, func: () => Promise<A>): Promise<A | undefined> => {
  const [frame] = await chrome.scripting.executeScript({ target: { tabId }, func })
  return frame?.result as A | undefined
}

export const chromePageOutputs: PageOutputAccess = {
  hasAccess: (originPattern) =>
    chrome.permissions.contains({ origins: [originPattern] }).catch(() => false),
  list: (tabId) =>
    runInPage(tabId, listOutputsInPage).then(
      (outputs) => outputs ?? { _tag: "Unreachable" },
      (): PageOutputs => ({ _tag: "Unreachable" }),
    ),
  askForMicrophone: (tabId) =>
    runInPage(tabId, askForMicrophoneInPage).then(
      (answer) => answer ?? "Refused",
      (): MicrophoneAnswer => "Refused",
    ),
  openSiteSettings: (site) =>
    void chrome.tabs
      .create({ url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(site)}` })
      .catch(() => {}),
}

/** For a panel with no way to reach pages, as in tests that don't look at sound. */
export const noPageOutputs: PageOutputAccess = {
  hasAccess: async () => false,
  list: async () => ({ _tag: "Unreachable" }),
  askForMicrophone: async () => "Refused",
  openSiteSettings: () => {},
}
