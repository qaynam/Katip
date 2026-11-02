import { describe, expect, it } from "vitest"
import { buildManifest } from "./manifest"

describe("マニフェストの版", () => {
  it.each(["1", "0.1.0", "1.2.3.4", "65535.65535.65535.65535"])(
    "渡した版 %s が、そのまま拡張の版になる",
    (version) => {
      expect(buildManifest("production", version).version).toBe(version)
    },
  )

  it("開発ビルドでも、渡した版が拡張の版になる", () => {
    expect(buildManifest("development", "0.2.0").version).toBe("0.2.0")
  })

  it.each(["1.2.3-beta.1", "1.2.3+build.5", "01.2.3", "1.2.3.4.5", "65536.0.0", "1..2", ""])(
    "Chrome が読み込めない版 %j では、その版を示してマニフェストを作らない",
    (version) => {
      expect(() => buildManifest("production", version)).toThrow(`"${version}"`)
    },
  )
})
