import { describe, expect, it, vi } from "vitest"
import type { PageSoundReport } from "#protocol"
import { namedOutputs, sinkFor, startPageSound } from "./page-sound"

const device = (deviceId: string, label: string, kind: MediaDeviceKind = "audiooutput") =>
  ({ deviceId, label, kind, groupId: "", toJSON: () => ({}) }) as MediaDeviceInfo

const speakers = device("built-in", "MacBook Pro Speakers")
const external = device("external", "External Speaker")

describe("namedOutputs", () => {
  it("lists the outputs by name, leaving out microphones and those that follow the system's choice", () => {
    expect(
      namedOutputs([
        device("default", "Default - MacBook Pro Speakers"),
        device("communications", "Communications - MacBook Pro Speakers"),
        speakers,
        device("mic", "MacBook Pro Microphone", "audioinput"),
        external,
      ]),
    ).toStrictEqual([speakers, external])
  })

  it("lists none while the site may not use the microphone, as Chrome names no output then", () => {
    expect(namedOutputs([device("", "")])).toStrictEqual([])
  })
})

describe("sinkFor", () => {
  it("points at the output of that name", () => {
    expect(sinkFor("External Speaker", [speakers, external])).toStrictEqual({
      sinkId: "external",
      status: { _tag: "Applied", output: "External Speaker" },
    })
  })

  it("falls back on the default output while the output isn't connected", () => {
    expect(sinkFor("External Speaker", [speakers])).toStrictEqual({
      sinkId: "",
      status: { _tag: "OutputMissing", output: "External Speaker" },
    })
  })

  it("needs the microphone permission when no output is named at all", () => {
    expect(sinkFor("External Speaker", [])).toStrictEqual({
      sinkId: "",
      status: { _tag: "NeedsMicrophone" },
    })
  })

  it("plays on the default output when none is chosen, permission or not", () => {
    expect(sinkFor(null, [])).toStrictEqual({
      sinkId: "",
      status: { _tag: "Applied", output: null },
    })
  })
})

/** A page with the given media elements, whose outputs and background are under the test's control. */
const pageWith = (html: string, options: { readonly reply: unknown }) => {
  document.body.innerHTML = html
  for (const element of document.querySelectorAll<HTMLMediaElement>("audio, video")) {
    let sinkId = ""
    Object.defineProperty(element, "sinkId", { get: () => sinkId, configurable: true })
    element.setSinkId = vi.fn(async (id: string) => {
      sinkId = id
    })
  }
  let devices = [speakers, external]
  const deviceListeners: Array<() => void> = []
  const messageListeners: Array<(message: unknown) => void> = []
  const reports: Array<PageSoundReport> = []
  startPageSound({
    document,
    mediaDevices: {
      enumerateDevices: async () => devices,
      addEventListener: (_: string, listener: unknown) =>
        deviceListeners.push(listener as () => void),
    },
    send: async (report) => {
      reports.push(report)
      return report._tag === "PageSoundStarted" ? options.reply : undefined
    },
    onMessage: (listener) => messageListeners.push(listener),
  })
  return {
    reports,
    sinks: () =>
      [...document.querySelectorAll<HTMLMediaElement>("audio, video")].map((e) => e.sinkId),
    order: (message: unknown) => messageListeners.forEach((listener) => listener(message)),
    connect: (connected: ReadonlyArray<MediaDeviceInfo>) => {
      devices = [...connected]
      deviceListeners.forEach((listener) => listener())
    },
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("a page whose site has an output", () => {
  it("asks where its sound goes as it starts, points its audio and video there and reports it", async () => {
    const page = pageWith("<video></video><audio></audio>", {
      reply: { _tag: "PlayOn", output: "External Speaker" },
    })
    await settled()

    expect([page.sinks(), page.reports]).toStrictEqual([
      ["external", "external"],
      [
        { _tag: "PageSoundStarted" },
        {
          _tag: "PageSoundApplied",
          status: { _tag: "Applied", output: "External Speaker" },
          outputs: ["MacBook Pro Speakers", "External Speaker"],
        },
      ],
    ])
  })

  it("points an element added later once it starts playing", async () => {
    const page = pageWith("", { reply: { _tag: "PlayOn", output: "External Speaker" } })
    await settled()
    const video = document.createElement("video")
    let sinkId = ""
    Object.defineProperty(video, "sinkId", { get: () => sinkId })
    video.setSinkId = vi.fn(async (id: string) => {
      sinkId = id
    })
    document.body.append(video)

    video.dispatchEvent(new Event("play"))

    expect(page.sinks()).toStrictEqual(["external"])
  })

  it("falls back on the default output when the output is disconnected, and returns to it once it's back", async () => {
    const page = pageWith("<video></video>", {
      reply: { _tag: "PlayOn", output: "External Speaker" },
    })
    await settled()

    page.connect([speakers])
    await settled()
    const whileDisconnected = page.sinks()
    page.connect([speakers, external])
    await settled()

    expect([
      whileDisconnected,
      page.sinks(),
      page.reports.at(-2),
      page.reports.at(-1),
    ]).toStrictEqual([
      [""],
      ["external"],
      {
        _tag: "PageSoundApplied",
        status: { _tag: "OutputMissing", output: "External Speaker" },
        outputs: ["MacBook Pro Speakers"],
      },
      {
        _tag: "PageSoundApplied",
        status: { _tag: "Applied", output: "External Speaker" },
        outputs: ["MacBook Pro Speakers", "External Speaker"],
      },
    ])
  })

  it("follows another output the background names, and lets go of the page when told", async () => {
    const page = pageWith("<video></video>", {
      reply: { _tag: "PlayOn", output: "External Speaker" },
    })
    await settled()

    page.order({ _tag: "PlayOn", output: "MacBook Pro Speakers" })
    await settled()
    const afterChange = page.sinks()
    page.order({ _tag: "LetGo" })

    expect([afterChange, page.sinks()]).toStrictEqual([["built-in"], [""]])
  })
})

describe("a page whose site has no output", () => {
  it("leaves its sound alone and reports nothing more", async () => {
    const page = pageWith("<video></video>", { reply: undefined })
    await settled()

    page.connect([speakers])
    await settled()

    expect([page.sinks(), page.reports]).toStrictEqual([[""], [{ _tag: "PageSoundStarted" }]])
  })
})
