import { describe, expect, it } from "vitest"
import { buildManifest } from "./manifest"

describe("the manifest's version", () => {
  it.each(["1", "0.1.0", "1.2.3.4", "65535.65535.65535.65535"])(
    "is the given version %s as is",
    (version) => {
      expect(buildManifest("production", version).version).toBe(version)
    },
  )

  it("is the given version in a development build too", () => {
    expect(buildManifest("development", "0.2.0").version).toBe("0.2.0")
  })

  it.each(["1.2.3-beta.1", "1.2.3+build.5", "01.2.3", "1.2.3.4.5", "65536.0.0", "1..2", ""])(
    "is refused, naming it, when Chrome can't load version %j",
    (version) => {
      expect(() => buildManifest("production", version)).toThrow(`"${version}"`)
    },
  )
})

describe("the manifest's keyboard shortcuts", () => {
  it("suggest keys for no more than 4 commands, the most Chrome loads", () => {
    const { commands = {} } = buildManifest("production", "1.0.0")

    const withKeys = Object.values(commands).filter((command) => command.suggested_key)

    expect(withKeys.length).toBeLessThanOrEqual(4)
  })
})
