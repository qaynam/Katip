import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { hostOfSite, originPatternOfSite, SoundSite, soundSiteOf } from "./sound-site"

describe("soundSiteOf", () => {
  it("is the origin of a web page, whatever its path, query or hash", () => {
    expect(soundSiteOf("https://www.youtube.com/watch?v=abc#t=10")).toStrictEqual(
      Option.some(SoundSite.make("https://www.youtube.com")),
    )
  })

  it("keeps another host of the same domain apart", () => {
    expect(soundSiteOf("https://music.youtube.com/watch?v=abc")).toStrictEqual(
      Option.some(SoundSite.make("https://music.youtube.com")),
    )
  })

  it.each([
    ["a browser page", "chrome://settings/"],
    ["an extension page", "chrome-extension://abc/sidepanel/index.html"],
    ["a local file", "file:///Users/me/song.mp3"],
    ["something that isn't a URL", "not a url"],
  ])("is none for %s", (_, url) => {
    expect(soundSiteOf(url)).toStrictEqual(Option.none())
  })
})

describe("a site as Katip asks for access to it and shows it", () => {
  it("asks for the host without the port, which match patterns don't take", () => {
    expect(originPatternOfSite(SoundSite.make("http://127.0.0.1:8080"))).toBe("http://127.0.0.1/*")
  })

  it("covers every page of the site, and reads as its host", () => {
    const site = SoundSite.make("https://www.youtube.com")

    expect([originPatternOfSite(site), hostOfSite(site)]).toStrictEqual([
      "https://www.youtube.com/*",
      "www.youtube.com",
    ])
  })
})
