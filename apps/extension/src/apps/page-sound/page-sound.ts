import type { PageSoundReport, PageSoundStatus } from "#protocol"

/** What the script uses of the page and the extension, so that tests can stand in for them. */
export interface PageSoundEnvironment {
  readonly document: Document
  readonly mediaDevices: Pick<MediaDevices, "enumerateDevices" | "addEventListener">
  /** Sends `report` to the background, resolving with its reply. */
  readonly send: (report: PageSoundReport) => Promise<unknown>
  /** Calls `listener` with each message the background sends the page. */
  readonly onMessage: (listener: (message: unknown) => void) => void
}

// The IDs of the outputs that follow the system's choice rather than name an output of their own
const SYSTEM_CHOSEN_IDS = new Set(["", "default", "communications"])

/**
 * The outputs a page can be pointed at by name, in the order the system lists them. None until the
 * site may use the microphone, as Chrome tells pages the names of the outputs only then.
 */
export const namedOutputs = (
  devices: ReadonlyArray<MediaDeviceInfo>,
): ReadonlyArray<MediaDeviceInfo> =>
  devices.filter(
    (device) =>
      device.kind === "audiooutput" &&
      !SYSTEM_CHOSEN_IDS.has(device.deviceId) &&
      device.label !== "",
  )

/** The device ID to point a page's sound at for `output`, and where the sound goes then. */
export const sinkFor = (
  output: string | null,
  outputs: ReadonlyArray<MediaDeviceInfo>,
): { readonly sinkId: string; readonly status: PageSoundStatus } => {
  if (output === null) return { sinkId: "", status: { _tag: "Applied", output: null } }
  if (outputs.length === 0) return { sinkId: "", status: { _tag: "NeedsMicrophone" } }
  const named = outputs.find((device) => device.label === output)
  return named === undefined
    ? { sinkId: "", status: { _tag: "OutputMissing", output } }
    : { sinkId: named.deviceId, status: { _tag: "Applied", output } }
}

type Order =
  { readonly _tag: "PlayOn"; readonly output: string | null } | { readonly _tag: "LetGo" }

// Not decoded with Schema like the rest of Katip's messages: the script goes into every page of a
// site, and would carry the whole schema library with it
const orderOf = (message: unknown): Order | null => {
  if (typeof message !== "object" || message === null || !("_tag" in message)) return null
  if (message._tag === "LetGo") return { _tag: "LetGo" }
  if (message._tag !== "PlayOn" || !("output" in message)) return null
  const { output } = message
  return output === null || typeof output === "string" ? { _tag: "PlayOn", output } : null
}

/**
 * Asks the background where the page's sound goes, and keeps the page's audio and video pointed
 * there: those already on the page, those that start playing later, and again whenever an output
 * is connected or disconnected. Reports where the sound went each time.
 *
 * @remarks
 * Only media elements reach an output this way, not sound a page makes with the Web Audio API.
 */
export const startPageSound = (environment: PageSoundEnvironment): void => {
  const { document, mediaDevices, send } = environment
  // undefined until the background names an output, and again once it lets the page go
  let wanted: string | null | undefined
  let sinkId = ""

  const point = (element: HTMLMediaElement) => {
    // Rejected for an output that was disconnected meanwhile; the next device change points the
    // element again
    if (element.sinkId !== sinkId) element.setSinkId(sinkId).catch(() => {})
  }
  const pointAll = () => {
    for (const element of document.querySelectorAll<HTMLMediaElement>("audio, video"))
      point(element)
  }
  const apply = async () => {
    if (wanted === undefined) return
    const outputs = namedOutputs(await mediaDevices.enumerateDevices())
    const chosen = sinkFor(wanted, outputs)
    sinkId = chosen.sinkId
    pointAll()
    send({
      _tag: "PageSoundApplied",
      status: chosen.status,
      outputs: outputs.map((device) => device.label),
    }).catch(() => {})
  }
  const obey = (message: unknown) => {
    const order = orderOf(message)
    if (order === null) return
    if (order._tag === "PlayOn") {
      wanted = order.output
      void apply()
    } else {
      wanted = undefined
      sinkId = ""
      pointAll()
    }
  }
  const follow = (event: Event) => {
    if (wanted !== undefined && event.target instanceof HTMLMediaElement) point(event.target)
  }

  // Media events don't bubble, so they're caught on their way down
  document.addEventListener("play", follow, true)
  document.addEventListener("loadstart", follow, true)
  mediaDevices.addEventListener("devicechange", () => void apply())
  environment.onMessage(obey)
  // Rejected when the extension was reloaded since the page opened, which leaves nothing to ask
  send({ _tag: "PageSoundStarted" }).then(obey, () => {})
}
