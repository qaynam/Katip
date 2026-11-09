import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { packageRootOf, thirdPartyNotices } from "./third-party-notices"

describe("the package a bundled module came from", () => {
  it("is the package directory under the last node_modules, scoped or not", () => {
    expect([
      packageRootOf("/repo/node_modules/.pnpm/effect@4.1.0/node_modules/effect/dist/Effect.js"),
      packageRootOf(
        "/repo/node_modules/.pnpm/@phosphor-icons+core@2.1.1/node_modules/@phosphor-icons/core/assets/fill/star-fill.svg?url",
      ),
    ]).toStrictEqual([
      "/repo/node_modules/.pnpm/effect@4.1.0/node_modules/effect",
      "/repo/node_modules/.pnpm/@phosphor-icons+core@2.1.1/node_modules/@phosphor-icons/core",
    ])
  })

  it("is none for Katip's own modules", () => {
    expect(packageRootOf("/repo/src/modules/space/space.ts")).toBeNull()
  })
})

describe("the third-party notices", () => {
  const packageAt = (
    parent: string,
    manifest: { name: string; version: string; license: string },
    licenseText?: string,
  ) => {
    const root = join(parent, manifest.name)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest))
    if (licenseText !== undefined) writeFileSync(join(root, "LICENSE"), licenseText)
    return root
  }

  it("carry each package's name, version, license and license text once, sorted by name", () => {
    const parent = mkdtempSync(join(tmpdir(), "katip-notices-"))
    const zeta = packageAt(parent, { name: "zeta", version: "2.0.0", license: "MIT" }, "Zeta text")
    const alpha = packageAt(
      parent,
      { name: "alpha", version: "1.0.0", license: "ISC" },
      "Alpha text",
    )

    const notices = thirdPartyNotices([zeta, alpha, zeta])

    expect(notices.match(/^(alpha|zeta) .*$/gm)).toStrictEqual([
      "alpha 1.0.0 (ISC)",
      "zeta 2.0.0 (MIT)",
    ])
    expect([notices.includes("Alpha text"), notices.includes("Zeta text")]).toStrictEqual([
      true,
      true,
    ])
  })

  it("say so when a package ships no license file", () => {
    const parent = mkdtempSync(join(tmpdir(), "katip-notices-"))
    const bare = packageAt(parent, { name: "bare", version: "0.1.0", license: "MIT" })

    expect(thirdPartyNotices([bare])).toContain(
      "No license file is included in the package; its license is MIT.",
    )
  })

  it("end with the notices of bundled data, in the order given", () => {
    const parent = mkdtempSync(join(tmpdir(), "katip-notices-"))
    const alpha = packageAt(parent, { name: "alpha", version: "1.0.0", license: "MIT" }, "Alpha")

    const notices = thirdPartyNotices(
      [alpha],
      [
        { name: "Bangs, from Kagi", licenseText: "MIT License\n\nCopyright (c) Kagi\n" },
        { name: "Other data", licenseText: "Other license" },
      ],
    )

    expect(notices.indexOf("alpha 1.0.0")).toBeLessThan(notices.indexOf("Bangs, from Kagi"))
    expect(notices).toContain("Bangs, from Kagi\n\nMIT License\n\nCopyright (c) Kagi\n\n---")
    expect(notices.trimEnd().endsWith("Other data\n\nOther license")).toBe(true)
  })
})
